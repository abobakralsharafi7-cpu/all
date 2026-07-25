#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تصحيح الحركات المستوردة داخل قاعدة البيانات بحيث تصبح سندات قبض وصرف أصلية.

القاعدة المطبقة (مستنبطة من السندات الأصلية في البرنامج):

  الحركة الموجبة  ->  سند قبض  : TransID=3 ، DocID يبدأ بـ coll
                       LineSeq=1  الصندوق (AccountID=1)  مدين  بالمبلغ
                       LineSeq=2  الحساب  (AccountID=6)  دائن  بالمبلغ

  الحركة السالبة  ->  سند صرف  : TransID=2 ، DocID يبدأ بـ Voc
                       LineSeq=1  الصندوق (AccountID=1)  دائن  بالمبلغ
                       LineSeq=2  الحساب  (AccountID=6)  مدين  بالمبلغ

صيغة رقم السند مأخوذة من السندات الأصلية:  البادئة + السنة + رقم الشهر بلا صفر + التسلسل
مثال أصلي: coll202663  =  coll + 2026 + 6 + 3
"""

import shutil
import sqlite3
import sys

SRC = "backup_1784979125243.db"
DST = "backup_1784979125243_2.db"

CASH_ACCOUNT = 1          # الصندوق
LEGACY_ACCOUNT = 6        # محمد احمد عبده احمد قايد الجراش
COMID = 1
CURRENCY_ID = 1           # ريال يمني

TRANS_RECEIPT = 3         # سند قبض
TRANS_PAYMENT = 2         # سند صرف
PREFIX = {TRANS_RECEIPT: "coll", TRANS_PAYMENT: "Voc"}


def month_token(doc_date):
    """رقم الشهر بلا صفر بادئ، والسنة — من تاريخ بصيغة DD/MM/YYYY."""
    day, month, year = doc_date.split("/")
    return year, str(int(month))


def main():
    shutil.copyfile(SRC, DST)
    con = sqlite3.connect(DST)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    # ------------------------------------------------------------------
    # 1) قراءة الحركات المستوردة الحالية (المرتبطة بجدول acount_details)
    # ------------------------------------------------------------------
    legacy = cur.execute(
        """
        SELECT DOC_UNID,
               MIN(DocDate)   AS DocDate,
               MIN(Explaines) AS Explaines,
               MAX(MAX(Debit), MAX(Credit)) AS Amount,
               MAX(CASE WHEN AccountID = ? THEN Debit  ELSE 0 END) AS AccDebit,
               MAX(CASE WHEN AccountID = ? THEN Credit ELSE 0 END) AS AccCredit
        FROM Transactions
        WHERE DOC_UNID LIKE 'legacy-acount-details-%'
        GROUP BY DOC_UNID
        ORDER BY CAST(REPLACE(DOC_UNID, 'legacy-acount-details-', '') AS INTEGER)
        """,
        (LEGACY_ACCOUNT, LEGACY_ACCOUNT),
    ).fetchall()

    if not legacy:
        sys.exit("لم يتم العثور على حركات مستوردة.")

    # ------------------------------------------------------------------
    # 2) تحديد اتجاه كل حركة من المصدر:
    #    في القاعدة الحالية الحركة الموجبة سُجّلت بجعل الحساب مدينًا،
    #    والحركة السالبة بجعل الحساب دائنًا. نستخدم ذلك لاستنتاج الإشارة.
    # ------------------------------------------------------------------
    docs = []
    for row in legacy:
        amount = float(row["Amount"] or 0)
        negative = float(row["AccCredit"] or 0) > 0
        docs.append(
            {
                "unid": row["DOC_UNID"],
                "date": row["DocDate"],
                "text": row["Explaines"],
                "amount": amount,
                # الصفر يُعامل معاملة غير السالب => سند قبض
                "trans": TRANS_PAYMENT if negative else TRANS_RECEIPT,
            }
        )

    # ------------------------------------------------------------------
    # 3) تخصيص تسلسل كل نوع سند بعد آخر تسلسل مستخدم في السندات الأصلية
    # ------------------------------------------------------------------
    next_seq = {}
    for trans in (TRANS_RECEIPT, TRANS_PAYMENT):
        used = cur.execute(
            """
            SELECT COALESCE(MAX(SeqID), 0) FROM Transactions
            WHERE TransID = ? AND DOC_UNID IS NULL
            """,
            (trans,),
        ).fetchone()[0]
        next_seq[trans] = used + 1

    taken = {r[0] for r in cur.execute(
        "SELECT DISTINCT DocID FROM Transactions WHERE DOC_UNID IS NULL")}

    for doc in docs:
        trans = doc["trans"]
        year, month = month_token(doc["date"])
        seq = next_seq[trans]
        doc_id = "%s%s%s%d" % (PREFIX[trans], year, month, seq)
        if doc_id in taken:
            sys.exit("تعارض في رقم السند: %s" % doc_id)
        taken.add(doc_id)
        doc["seq"] = seq
        doc["docid"] = doc_id
        next_seq[trans] += 1

    # ------------------------------------------------------------------
    # 4) حذف الصفوف المستوردة القديمة وإعادة كتابتها بهيئة السندات الأصلية
    # ------------------------------------------------------------------
    cur.execute("BEGIN")
    cur.execute("DELETE FROM Transactions WHERE DOC_UNID LIKE 'legacy-acount-details-%'")

    insert = """
        INSERT INTO Transactions (
            COMID, TransID, DocDate, DocID, SeqID, AccountID, CurrencyID,
            CurrencyExchange, PaymentMethod, Debit, Credit, CollID, CustomerID,
            RefernceID, Discount_AMT, RDiscount_AMT, PURDiscount_AMT,
            PURRDiscount_AMT, ReturnSale, PackageSize, LineSeq, ItemID,
            FromStockID, ToStockID, ItemCode, Barcode, UID, Price, InQty,
            OutQty, Explaines, SynchDate, UserID, MainAccountID,
            SubMainAccountID, Synch, Item_Cost, DOC_UNID, BatchNo, ExpiryDate
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            1, 1, ?, ?, '0', NULL,
            '', 0, 0, 0,
            0, NULL, 1, ?, 0,
            NULL, NULL, '0', '', 0, NULL, NULL,
            NULL, ?, NULL, 0, NULL,
            0, 0, 0, ?, NULL, NULL
        )
    """

    for doc in docs:
        amount = doc["amount"]
        if doc["trans"] == TRANS_RECEIPT:
            # سند قبض: الصندوق مدين ، الحساب دائن
            cash_debit, cash_credit = amount, 0.0
            acc_debit, acc_credit = 0.0, amount
        else:
            # سند صرف: الصندوق دائن ، الحساب مدين
            cash_debit, cash_credit = 0.0, amount
            acc_debit, acc_credit = amount, 0.0

        common = (COMID, doc["trans"], doc["date"], doc["docid"], doc["seq"])

        # السطر الأول: الصندوق
        cur.execute(insert, common + (CASH_ACCOUNT, CURRENCY_ID, cash_debit,
                                      cash_credit, 1, doc["text"], doc["unid"]))
        # السطر الثاني: الحساب المقابل
        cur.execute(insert, common + (LEGACY_ACCOUNT, CURRENCY_ID, acc_debit,
                                      acc_credit, 2, doc["text"], doc["unid"]))

    con.commit()

    # ------------------------------------------------------------------
    # 5) اختبارات السلامة
    # ------------------------------------------------------------------
    checks = []

    integrity = cur.execute("PRAGMA integrity_check").fetchone()[0]
    checks.append(("فحص سلامة SQLite", integrity == "ok", integrity))

    fk = cur.execute("PRAGMA foreign_key_check").fetchall()
    checks.append(("فحص المفاتيح الأجنبية", not fk, len(fk)))

    n_rows = cur.execute(
        "SELECT COUNT(*) FROM Transactions WHERE DOC_UNID LIKE 'legacy-acount-details-%'"
    ).fetchone()[0]
    checks.append(("عدد الأسطر المستوردة = 138", n_rows == 138, n_rows))

    n_docs = cur.execute(
        "SELECT COUNT(DISTINCT DocID) FROM Transactions WHERE DOC_UNID LIKE 'legacy%'"
    ).fetchone()[0]
    checks.append(("عدد السندات المستوردة = 69", n_docs == 69, n_docs))

    bad_prefix = cur.execute(
        """
        SELECT COUNT(*) FROM (
          SELECT DocID, TransID FROM Transactions
          WHERE DOC_UNID LIKE 'legacy%'
            AND ((TransID = 3 AND DocID NOT LIKE 'coll%')
              OR (TransID = 2 AND DocID NOT LIKE 'Voc%')
              OR TransID NOT IN (2, 3))
        )
        """
    ).fetchone()[0]
    checks.append(("بادئة كل سند مطابقة لنوعه", bad_prefix == 0, bad_prefix))

    wrong_dir = cur.execute(
        """
        SELECT COUNT(*) FROM (
          SELECT DocID FROM Transactions
          WHERE DOC_UNID LIKE 'legacy%'
          GROUP BY DocID
          HAVING
            -- سند قبض: الصندوق مدين والحساب دائن
            (MAX(TransID) = 3 AND NOT (
                 MAX(CASE WHEN AccountID = 1 THEN Credit END) = 0
             AND MAX(CASE WHEN AccountID = 6 THEN Debit  END) = 0))
         OR -- سند صرف: الصندوق دائن والحساب مدين
            (MAX(TransID) = 2 AND NOT (
                 MAX(CASE WHEN AccountID = 1 THEN Debit  END) = 0
             AND MAX(CASE WHEN AccountID = 6 THEN Credit END) = 0))
        )
        """
    ).fetchone()[0]
    checks.append(("اتجاه المدين/الدائن صحيح", wrong_dir == 0, wrong_dir))

    unbalanced = cur.execute(
        """
        SELECT COUNT(*) FROM (
          SELECT DocID FROM Transactions GROUP BY DocID
          HAVING ROUND(SUM(Debit) - SUM(Credit), 4) <> 0
        )
        """
    ).fetchone()[0]
    checks.append(("توازن كل سند", unbalanced == 0, unbalanced))

    bad_lines = cur.execute(
        """
        SELECT COUNT(*) FROM (
          SELECT DocID FROM Transactions WHERE DOC_UNID LIKE 'legacy%'
          GROUP BY DocID
          HAVING COUNT(*) <> 2
              OR SUM(CASE WHEN LineSeq = 1 THEN 1 ELSE 0 END) <> 1
              OR SUM(CASE WHEN LineSeq = 2 THEN 1 ELSE 0 END) <> 1
        )
        """
    ).fetchone()[0]
    checks.append(("كل سند من سطرين LineSeq 1 و 2", bad_lines == 0, bad_lines))

    dup = cur.execute(
        "SELECT COUNT(*) FROM (SELECT DocID FROM Transactions GROUP BY DocID HAVING COUNT(DISTINCT TransID) > 1)"
    ).fetchone()[0]
    checks.append(("لا تعارض في أرقام السندات", dup == 0, dup))

    view_rows = cur.execute("SELECT COUNT(*) FROM view_Transactions").fetchone()[0]
    checks.append(("ظهور كل السندات في شاشة الحركات = 79", view_rows == 79, view_rows))

    net = cur.execute(
        "SELECT ROUND(SUM(Credit) - SUM(Debit), 2) FROM Transactions WHERE AccountID = 6"
    ).fetchone()[0]
    checks.append(("صافي رصيد الحساب 3,500 دائن", net == 3500, net))

    cash_net = cur.execute(
        """
        SELECT ROUND(SUM(Debit) - SUM(Credit), 2) FROM Transactions
        WHERE AccountID = 1 AND DOC_UNID LIKE 'legacy%'
        """
    ).fetchone()[0]
    checks.append(("صافي أثر السندات على الصندوق 3,500 مدين", cash_net == 3500, cash_net))

    print("\nنتائج الفحص:")
    ok_all = True
    for name, ok, value in checks:
        print("  [%s] %-42s %s" % ("ناجح" if ok else "فاشل", name, value))
        ok_all &= ok

    con.close()
    if not ok_all:
        sys.exit("فشل أحد الاختبارات.")
    print("\nتم إنشاء: %s" % DST)


if __name__ == "__main__":
    main()
