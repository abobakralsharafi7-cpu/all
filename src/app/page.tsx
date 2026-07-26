"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type ScreenKey =
  | "home"
  | "system-settings"
  | "system-backup"
  | "system-add-account"
  | "system-cashboxes"
  | "system-currencies"
  | "payment-vouchers"
  | "receipt-vouchers"
  | "report-operations"
  | "report-accounts"
  | "report-images";

type VoucherType = "صرف" | "قبض";
type SortOrder = "newest" | "oldest";
type ReportMode = "تحليلي" | "إجمالي";
type AccountType = "عملاء" | "موردين" | "بنك" | "موظفين";
type BalanceSide = "له" | "عليه";
type ThemeMode = "dark" | "light";

type CurrencyCode = "YER" | "SAR" | "USD" | "AED" | "EUR";

type CurrencyRecord = {
  code: CurrencyCode;
  name: string;
  rateToBase: number | null;
  active: boolean;
};

type AccountRecord = {
  id: number;
  type: AccountType;
  sectionCode: string;
  serial: number;
  accountCode: string;
  name: string;
  phone: string;
  enabledCurrencies: CurrencyCode[];
  openingBalance?: number;
  openingSide?: BalanceSide;
};

type CashboxRecord = {
  id: number;
  code: string;
  name: string;
  enabledCurrencies: CurrencyCode[];
  openingBalance?: number;
  openingSide?: BalanceSide;
};

type OperationItem = {
  id: number;
  type: VoucherType;
  account: string;
  cashboxId: number;
  amount: number;
  currency: CurrencyCode;
  accountCurrency?: CurrencyCode;
  cashboxCurrency?: CurrencyCode;
  exchangeRate?: number;
  accountExchangeRate?: number;
  cashboxExchangeRate?: number;
  statement?: string;
  reference?: string;
  datetime: string;
  imageUrl?: string;
};

type OperationForm = {
  account: string;
  cashboxId: number;
  amount: string;
  currency: CurrencyCode;
  accountCurrency: CurrencyCode;
  cashboxCurrency: CurrencyCode;
  exchangeRate: string;
  accountExchangeRate: string;
  cashboxExchangeRate: string;
  statement: string;
  reference: string;
  datetimeInput: string;
  imageUrl?: string;
};

type AppSettings = {
  companyAr: string;
  companyEn: string;
  phone1: string;
  phone2: string;
  reserve1: string;
  reserve2: string;
  companyLogoUrl?: string;
  paymentVoucherLabel: string;
  receiptVoucherLabel: string;
  paymentNoticeTemplate: string;
  receiptNoticeTemplate: string;
  baseCurrency: CurrencyCode;
};

type TreeNode = {
  id: string;
  label: string;
  screen?: ScreenKey;
  action?: "open-company" | "open-labels";
  children?: TreeNode[];
};

type Toast = {
  id: number;
  message: string;
  type: "success" | "error";
};

type SetupState = {
  done: boolean;
  step: 1 | 2;
  selectedBase: CurrencyCode;
  cashboxName: string;
  openingBalance: string;
  openingSide: BalanceSide;
};

type AppSnapshot = {
  storageVersion: number;
  savedAt?: string;
  developer?: string;
  theme: ThemeMode;
  settings: AppSettings;
  currencies: CurrencyRecord[];
  accounts: AccountRecord[];
  cashboxes: CashboxRecord[];
  paymentOperations: OperationItem[];
  receiptOperations: OperationItem[];
  nextPaymentId: number;
  nextReceiptId: number;
  setup: SetupState;
};

const STORAGE_KEY = "proof-daftar-v2";
const DB_NAME = "proof-daftar-local-db";
const DB_VERSION = 1;
const META_STORE = "meta";
const PAYMENT_STORE = "paymentOperations";
const RECEIPT_STORE = "receiptOperations";
const META_STATE_KEY = "state";
const STORAGE_VERSION = 3;
const APP_DEVELOPER = "Professor";
const APP_LOGO_URL = "/app-logo.png";

const TYPE_SECTION_CODE: Record<AccountType, string> = {
  عملاء: "11",
  موردين: "22",
  بنك: "33",
  موظفين: "44",
};

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  YER: "ريال يمني",
  SAR: "ريال سعودي",
  USD: "دولار أمريكي",
  AED: "درهم إماراتي",
  EUR: "يورو",
};

const BASE_CURRENCY_CHOICES: CurrencyCode[] = ["YER", "SAR", "USD"];

const menuTree: TreeNode[] = [
  {
    id: "system-root",
    label: "إدارة النظام",
    children: [
      {
        id: "settings-root",
        label: "الإعدادات العامة",
        children: [
          { id: "system-company-info", label: "بيانات الشركة", action: "open-company" },
          { id: "system-voucher-labels", label: "مسميات ونصوص السندات", action: "open-labels" },
        ],
      },
      { id: "system-add-account", label: "إضافة/تعديل حساب", screen: "system-add-account" },
      { id: "system-cashboxes", label: "إضافة/تعديل الصناديق", screen: "system-cashboxes" },
      { id: "system-currencies", label: "العملات", screen: "system-currencies" },
      { id: "system-backup", label: "النسخ الاحتياطي والاستعادة", screen: "system-backup" },
    ],
  },
  {
    id: "accounts-root",
    label: "إدارة الحسابات",
    children: [
      { id: "payment-vouchers", label: "سندات الصرف", screen: "payment-vouchers" },
      { id: "receipt-vouchers", label: "سندات القبض", screen: "receipt-vouchers" },
      {
        id: "reports-root",
        label: "التقارير",
        children: [
          { id: "report-operations", label: "تقارير العمليات", screen: "report-operations" },
          { id: "report-accounts", label: "تقارير الحسابات", screen: "report-accounts" },
          { id: "report-images", label: "تقارير الصور المرفقة", screen: "report-images" },
        ],
      },
    ],
  },
];

const defaultSettings: AppSettings = {
  companyAr: "شركة بروف دفتر للحلول المحاسبية",
  companyEn: "Proof Daftar Accounting Solutions",
  phone1: "+966500000001",
  phone2: "+966500000002",
  reserve1: "Rida - Ring General Street",
  reserve2: "صنعاء - الشارع الدائري",
  companyLogoUrl: APP_LOGO_URL,
  paymentVoucherLabel: "سند صرف نقداً",
  receiptVoucherLabel: "سند قبض نقداً",
  paymentNoticeTemplate: "اشعار الي",
  receiptNoticeTemplate: "اشعار الي",
  baseCurrency: "YER",
};

const defaultCurrencies: CurrencyRecord[] = [
  { code: "YER", name: CURRENCY_NAMES.YER, rateToBase: null, active: true },
  { code: "SAR", name: CURRENCY_NAMES.SAR, rateToBase: null, active: true },
  { code: "USD", name: CURRENCY_NAMES.USD, rateToBase: null, active: true },
];

const defaultAccounts: AccountRecord[] = [];

const defaultCashboxes: CashboxRecord[] = [];

const defaultPayments: OperationItem[] = [];

const defaultReceipts: OperationItem[] = [];

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function hasIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

async function openLocalDb() {
  if (!hasIndexedDb()) {
    throw new Error("IndexedDB is not available");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(PAYMENT_STORE)) db.createObjectStore(PAYMENT_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(RECEIPT_STORE)) db.createObjectStore(RECEIPT_STORE, { keyPath: "id" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T) {
  const db = await openLocalDb();
  try {
    const transaction = db.transaction(storeName, mode);
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    const result = await run(store);
    await done;
    return result;
  } finally {
    db.close();
  }
}

async function getStoreValue<T>(storeName: string, key: IDBValidKey) {
  return withStore<T | undefined>(storeName, "readonly", (store) => requestToPromise<T | undefined>(store.get(key)));
}

async function putStoreValue<T>(storeName: string, key: IDBValidKey, value: T) {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.put(value, key));
  });
}

async function getAllStoreRecords<T>(storeName: string) {
  return withStore<T[]>(storeName, "readonly", (store) => requestToPromise<T[]>(store.getAll()));
}

async function putOperationRecord(storeName: string, operation: OperationItem) {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.put(operation));
  });
}

async function deleteOperationRecord(storeName: string, id: number) {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

async function replaceStoreRecords<T>(storeName: string, rows: T[]) {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.clear());
    for (const row of rows) {
      await requestToPromise(store.put(row));
    }
  });
}

async function saveSnapshotToIndexedDb(snapshot: AppSnapshot) {
  const { paymentOperations, receiptOperations, ...meta } = snapshot;
  await putStoreValue(META_STORE, META_STATE_KEY, meta);
  await replaceStoreRecords(PAYMENT_STORE, paymentOperations);
  await replaceStoreRecords(RECEIPT_STORE, receiptOperations);
}

function nowDateTimeString() {
  const date = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function parseDateOnly(value: string) {
  return value.slice(0, 10);
}

function formatDateTimeNoSeconds(value: string) {
  const [date, time = ""] = value.split(" ");
  const [hh = "00", mm = "00"] = time.split(":");
  return `${date} ${hh}:${mm}`;
}

function toDatetimeInput(value: string) {
  const [date, time = ""] = value.split(" ");
  const [hh = "00", mm = "00"] = time.split(":");
  return `${date}T${hh}:${mm}`;
}

function fromDatetimeInput(value: string) {
  if (!value) return nowDateTimeString();
  return `${value.replace("T", " ")}:00`;
}

function sanitizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function numberToArabicWords(value: number) {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "صفر";

  const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
  const teens = [
    "عشرة",
    "أحد عشر",
    "اثنا عشر",
    "ثلاثة عشر",
    "أربعة عشر",
    "خمسة عشر",
    "ستة عشر",
    "سبعة عشر",
    "ثمانية عشر",
    "تسعة عشر",
  ];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

  const under100 = (x: number) => {
    if (x < 10) return units[x];
    if (x < 20) return teens[x - 10];
    const t = Math.floor(x / 10);
    const u = x % 10;
    return u ? `${units[u]} و${tens[t]}` : tens[t];
  };

  const under1000 = (x: number) => {
    const h = Math.floor(x / 100);
    const rest = x % 100;
    if (!h) return under100(rest);
    if (!rest) return hundreds[h];
    return `${hundreds[h]} و${under100(rest)}`;
  };

  const thousandWord = (x: number) => {
    if (x === 1) return "ألف";
    if (x === 2) return "ألفان";
    if (x >= 3 && x <= 10) return `${under1000(x)} آلاف`;
    return `${under1000(x)} ألف`;
  };

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (millions) {
    if (millions === 1) parts.push("مليون");
    else if (millions === 2) parts.push("مليونان");
    else if (millions >= 3 && millions <= 10) parts.push(`${under1000(millions)} ملايين`);
    else parts.push(`${under1000(millions)} مليون`);
  }

  if (thousands) parts.push(thousandWord(thousands));
  if (rest) parts.push(under1000(rest));

  return parts.join(" و");
}

function accountInRange(name: string, from: string, to: string, allNames: string[]) {
  if (!from || !to) return true;
  const a = allNames.indexOf(from);
  const b = allNames.indexOf(to);
  const n = allNames.indexOf(name);
  if (a === -1 || b === -1 || n === -1) return true;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return n >= min && n <= max;
}

function getOperationCurrencyMeta(operation: OperationItem): {
  accountCurrency: CurrencyCode;
  cashboxCurrency: CurrencyCode;
  accountRate?: number;
  cashboxRate?: number;
} {
  const accountCurrency = operation.accountCurrency ?? operation.currency;
  const cashboxCurrency = operation.cashboxCurrency ?? operation.currency;
  const accountRate = operation.accountExchangeRate ?? operation.exchangeRate;
  const cashboxRate = operation.cashboxExchangeRate ?? operation.exchangeRate;
  return { accountCurrency, cashboxCurrency, accountRate, cashboxRate };
}

function operationMatchesCurrency(operation: OperationItem, currency: "all" | CurrencyCode) {
  if (currency === "all") return true;
  const meta = getOperationCurrencyMeta(operation);
  return operation.currency === currency || meta.accountCurrency === currency || meta.cashboxCurrency === currency;
}

async function compressImageFile(file: File, maxWidth = 1100, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadImageToDevice(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();

  if (navigator.share) {
    const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: "حفظ صورة السند",
        files: [file],
      });
      return;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function buildHeaderHtml(settings: AppSettings) {
  return `
    <div class="head">
      <div class="head-col">
        <h3>${settings.companyEn}</h3>
        <div>${settings.reserve1}</div>
        <div>TEL NO: ${settings.phone1}</div>
        <div>FAX NO: ${settings.phone2}</div>
      </div>
      <div class="head-center">
        ${
          settings.companyLogoUrl
            ? `<img src="${settings.companyLogoUrl}" alt="company-logo" />`
            : '<div class="logo-fallback">🏢</div>'
        }
      </div>
      <div class="head-col" style="text-align:right;">
        <h3>${settings.companyAr}</h3>
        <div>${settings.companyEn}</div>
        <div>${settings.reserve2}</div>
      </div>
    </div>
  `;
}

function renderPrintWindow(title: string, html: string) {
  const documentHtml = `
    <html lang="ar" dir="rtl">
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; padding: 16px; color: #111; background: #fff; }
          .page { border: 2px solid #101010; padding: 10px; margin-bottom: 10px; }
          .head { display:flex; align-items: center; justify-content: space-between; border:2px solid #151515; padding:8px; }
          .head-col { width: 40%; font-size: 12px; line-height: 1.6; color:#111; }
          .head-col h3 { margin:0; color:#d62828; font-size: 24px; }
          .head-center { width: 20%; text-align:center; }
          .head-center img { max-width: 120px; max-height: 70px; object-fit: contain; }
          .head-center .logo-fallback { font-size: 42px; }
          .voucher-title { margin-top: 8px; display:flex; justify-content: space-between; align-items:center; }
          .voucher-box { border:1px solid #111; border-radius:8px; padding:6px 14px; font-size: 24px; font-weight:700; }
          .meta { font-size: 17px; font-weight: 700; }
          .line { border:1px solid #222; border-radius: 8px; padding: 8px; margin-top:8px; font-size: 17px; }
          .amount-grid { margin-top:8px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
          .amount-box { border:1px solid #222; border-radius:8px; padding:8px; font-size:16px; min-height:48px; }
          table { width:100%; border-collapse: collapse; margin-top: 10px; table-layout: auto; }
          th, td { border: 2px solid #111; padding: 7px; text-align: right; font-size: 14px; word-break: break-word; }
          th { background: #f3f5ff; color: #d62828; }
          tfoot td { background: #f1f5f9; font-weight: 700; }
          .img-wrap { margin-top: 12px; border-top: 1px dashed #777; padding-top: 10px; }
          .img-wrap img { max-width: 100%; max-height: 320px; border:1px solid #888; }
          .page-break { page-break-after: always; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;

  const popup = window.open("", "_blank", "width=1200,height=900");

  if (popup) {
    popup.document.write(documentHtml);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 350);
    return true;
  }

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(documentHtml);
  frameDocument.close();
  setTimeout(() => {
    frameWindow.focus();
    frameWindow.print();
    setTimeout(() => frame.remove(), 1000);
  }, 350);
  return true;
}

function buildVoucherHtml({
  operation,
  settings,
  accountCode,
  cashboxCode,
  includeAttachment,
}: {
  operation: OperationItem;
  settings: AppSettings;
  accountCode: string;
  cashboxCode: string;
  includeAttachment: boolean;
}) {
  const accountCurrency = operation.accountCurrency ?? operation.currency;
  const cashboxCurrency = operation.cashboxCurrency ?? operation.currency;
  const accountRate = operation.accountExchangeRate ?? operation.exchangeRate;
  const cashboxRate = operation.cashboxExchangeRate ?? operation.exchangeRate;
  const currencyLabel = CURRENCY_NAMES[accountCurrency] ?? accountCurrency;
  const amountWords = `${numberToArabicWords(operation.amount)} ${currencyLabel}`;
  const holderText = operation.type === "صرف" ? "بيد الاخ/ الاخوه" : "استلمنا من الاخ/ الاخوه";
  const voucherLabel = operation.type === "صرف" ? settings.paymentVoucherLabel : settings.receiptVoucherLabel;

  return `
    <div class="page">
      ${buildHeaderHtml(settings)}

      <div class="voucher-title">
        <div class="meta">رقم السند: ${operation.id}</div>
        <div class="voucher-box">${voucherLabel}</div>
        <div class="meta">التاريخ: ${parseDateOnly(operation.datetime)}</div>
      </div>

      <div class="line">${holderText} / ${operation.account}</div>

      <div class="amount-grid">
        <div class="amount-box">مبلغ وقدره (كتابة): ${amountWords}</div>
        <div class="amount-box">المبلغ (رقماً): ${operation.amount.toLocaleString()} ${accountCurrency}</div>
        <div class="amount-box">عملة الحساب: ${accountCurrency}${accountRate ? ` | سعر الصرف: ${accountRate}` : ""}</div>
        <div class="amount-box">عملة الصندوق: ${cashboxCurrency}${cashboxRate ? ` | سعر الصرف: ${cashboxRate}` : ""}</div>
      </div>

      <table>
        <colgroup>
          <col style="width: 12%" />
          <col style="width: 22%" />
          <col style="width: 12%" />
          <col style="width: 40%" />
          <col style="width: 14%" />
        </colgroup>
        <thead>
          <tr>
            <th>رقم الحساب</th>
            <th>اسم الحساب</th>
            <th>رقم الصندوق</th>
            <th>البيان</th>
            <th>المبلغ / العملة</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${accountCode}</td>
            <td>${operation.account}<br/><small>عملة: ${accountCurrency}${accountRate ? ` | سعر الصرف: ${accountRate}` : ""}</small></td>
            <td>${cashboxCode}<br/><small>عملة: ${cashboxCurrency}${cashboxRate ? ` | سعر الصرف: ${cashboxRate}` : ""}</small></td>
            <td>${operation.statement ?? "—"}</td>
            <td>${operation.amount.toLocaleString()} ${accountCurrency} / صندوق ${cashboxCurrency}</td>
          </tr>
        </tbody>
      </table>

      ${includeAttachment && operation.imageUrl ? `<div class="img-wrap"><img src="${operation.imageUrl}" alt="attachment" /></div>` : ""}
    </div>
  `;
}

function SetupWizard({
  setup,
  onChange,
  onContinue,
  isDark,
}: {
  setup: SetupState;
  onChange: (next: SetupState) => void;
  onContinue: () => void;
  isDark: boolean;
}) {
  const card = isDark
    ? "border-slate-700 bg-slate-900/80 text-slate-100"
    : "border-slate-300 bg-white/95 text-slate-900";

  return (
    <main
      className={`min-h-screen w-full px-4 py-8 md:px-8 ${
        isDark
          ? "bg-[linear-gradient(160deg,#0f172a,#020617_55%,#111827)]"
          : "bg-[linear-gradient(160deg,#f8fafc,#e2e8f0_55%,#dbeafe)]"
      }`}
    >
      <div className="mx-auto w-full max-w-2xl">
        <section className={`rounded-3xl border p-6 shadow-2xl ${card}`}>
          <h1 className="text-2xl font-bold">تهيئة النظام لأول مرة</h1>
          <p className="mt-2 text-sm opacity-80">مرحبًا بك في بروف دفتر 👋 — هذا النظام يساعدك على إدارة سندات الصرف والقبض والحسابات والتقارير بطريقة مرتبة واحترافية.</p>
          <p className="mt-2 text-sm opacity-80">ابدأ باختيار العملة الأساسية ثم أنشئ الصندوق الأول، وبعدها يمكنك الإضافة والمتابعة بسهولة.</p>

          {setup.step === 1 ? (
            <div className="mt-6 space-y-4">
              <h2 className="font-semibold">اختر العملة الأساسية</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {BASE_CURRENCY_CHOICES.map((code) => (
                  <button
                    key={code}
                    onClick={() => onChange({ ...setup, selectedBase: code })}
                    className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                      setup.selectedBase === code
                        ? "border-cyan-400 bg-cyan-500/20"
                        : isDark
                        ? "border-slate-600 bg-slate-800"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {CURRENCY_NAMES[code]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <h2 className="font-semibold">إضافة الصندوق الأول</h2>
              <input
                value={setup.cashboxName}
                onChange={(e) => onChange({ ...setup, cashboxName: e.target.value })}
                placeholder="اسم الصندوق"
                className={`w-full rounded-xl border px-3 py-2 ${
                  isDark
                    ? "border-slate-600 bg-slate-800 text-slate-100"
                    : "border-slate-300 bg-white text-slate-900"
                }`}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={setup.openingBalance}
                  onChange={(e) => onChange({ ...setup, openingBalance: e.target.value })}
                  placeholder="رصيد افتتاحي (اختياري)"
                  type="number"
                  className={`rounded-xl border px-3 py-2 ${
                    isDark
                      ? "border-slate-600 bg-slate-800 text-slate-100"
                      : "border-slate-300 bg-white text-slate-900"
                  }`}
                />
                <select
                  value={setup.openingSide}
                  onChange={(e) => onChange({ ...setup, openingSide: e.target.value as BalanceSide })}
                  className={`rounded-xl border px-3 py-2 ${
                    isDark
                      ? "border-slate-600 bg-slate-800 text-slate-100"
                      : "border-slate-300 bg-white text-slate-900"
                  }`}
                >
                  <option>له</option>
                  <option>عليه</option>
                </select>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            {setup.step === 2 ? (
              <button
                onClick={() => onChange({ ...setup, step: 1 })}
                className={`rounded-xl border px-4 py-2 text-sm ${
                  isDark ? "border-slate-500 text-slate-200" : "border-slate-300 text-slate-700"
                }`}
              >
                رجوع
              </button>
            ) : null}
            <button
              onClick={onContinue}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950"
            >
              متابعة
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  isDark,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  isDark: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4">
      <div
        className={`w-full max-w-3xl rounded-2xl border p-5 ${
          isDark
            ? "border-slate-700 bg-slate-900 text-slate-100"
            : "border-slate-300 bg-white text-slate-900"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            className={`rounded-lg border px-3 py-1 text-sm ${
              isDark ? "border-slate-600" : "border-slate-300"
            }`}
          >
            إغلاق
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BackButton({ onBack, isDark }: { onBack: () => void; isDark: boolean }) {
  return (
    <button
      onClick={onBack}
      className={`rounded-lg border px-3 py-1.5 text-sm ${
        isDark
          ? "border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      ← رجوع
    </button>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed left-1/2 top-4 z-[95] w-[min(92vw,460px)] -translate-x-1/2 space-y-2 text-center">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${
            toast.type === "success"
              ? "border-emerald-400/70 bg-slate-950/95 text-emerald-100"
              : "border-rose-400/70 bg-slate-950/95 text-rose-100"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function DateInput({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className: string;
}) {
  const [dateMode, setDateMode] = useState(Boolean(value));
  const inputType = dateMode || Boolean(value) ? "date" : "text";

  return (
    <input
      type={inputType}
      value={value}
      onFocus={(event) => {
        const input = event.currentTarget;
        setDateMode(true);
        requestAnimationFrame(() => input.showPicker?.());
      }}
      onBlur={() => {
        if (!value) setDateMode(false);
      }}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      aria-label={label}
      className={className}
    />
  );
}

function TreeMenu({
  selectedScreen,
  onSelect,
  isDark,
}: {
  selectedScreen: ScreenKey;
  onSelect: (node: TreeNode) => void;
  isDark: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleNode = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderNode = (node: TreeNode, depth = 0): ReactNode => {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expanded[node.id];
    const isActive = node.screen === selectedScreen;

    return (
      <div key={node.id} className="space-y-1">
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.id)}
              className={`grid size-6 place-items-center rounded-md border text-xs ${
                isDark
                  ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {isExpanded ? "−" : "+"}
            </button>
          ) : (
            <span className="inline-block size-6" />
          )}

          <button
            onClick={() => {
              if (node.screen || node.action) onSelect(node);
              else if (hasChildren) toggleNode(node.id);
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-right text-sm transition ${
              isActive
                ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                : isDark
                ? "border-slate-700 bg-slate-800/40 text-slate-200 hover:bg-slate-700/70"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
            style={{ marginInlineStart: depth * 8 }}
          >
            {node.label}
          </button>
        </div>

        {hasChildren && isExpanded ? (
          <div className="space-y-1 pl-1">{node.children?.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  return <div className="space-y-2">{menuTree.map((node) => renderNode(node))}</div>;
}

function HomeScreen({
  selectedScreen,
  onTreeSelect,
  isDark,
}: {
  selectedScreen: ScreenKey;
  onTreeSelect: (node: TreeNode) => void;
  isDark: boolean;
}) {
  return (
    <section
      className={`grid min-h-[72vh] rounded-3xl border p-6 ${
        isDark
          ? "border-slate-700/70 bg-[radial-gradient(circle_at_20%_15%,#0ea5e955,transparent_35%),radial-gradient(circle_at_80%_80%,#7c3aed55,transparent_32%),linear-gradient(135deg,#0f172a,#020617)]"
          : "border-slate-300 bg-[radial-gradient(circle_at_20%_15%,#93c5fd66,transparent_35%),radial-gradient(circle_at_80%_80%,#c4b5fd66,transparent_32%),linear-gradient(135deg,#f8fafc,#e2e8f0)]"
      }`}
    >
      <div className="my-auto grid gap-5">
        <div className="text-center">
          <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? "text-cyan-300" : "text-blue-700"}`}>
            Accounting Platform
          </p>
          <h1 className={`mt-2 text-4xl font-extrabold leading-tight md:text-6xl ${isDark ? "text-white" : "text-slate-900"}`}>
            بروف دفتر
          </h1>
          <p className={`mt-2 text-2xl font-semibold md:text-3xl ${isDark ? "text-slate-200" : "text-slate-700"}`}>
            Proof Daftar
          </p>
        </div>

        <div
          className={`mx-auto w-full max-w-2xl rounded-2xl border p-4 ${
            isDark ? "border-slate-700 bg-slate-900/60" : "border-slate-300 bg-white/90"
          }`}
        >
          <p className={`mb-3 text-sm ${isDark ? "text-slate-200" : "text-slate-700"}`}>شجرة الإدارات:</p>
          <TreeMenu selectedScreen={selectedScreen} onSelect={onTreeSelect} isDark={isDark} />
        </div>
      </div>
    </section>
  );
}

function SimpleScreen({
  title,
  onBack,
  children,
  isDark,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
  isDark: boolean;
}) {
  return (
    <section
      className={`space-y-4 rounded-3xl border p-6 ${
        isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>
      {children}
    </section>
  );
}

function AccountsAdminScreen({
  accounts,
  onOpenAdd,
  onOpenEdit,
  onBack,
  isDark,
}: {
  accounts: AccountRecord[];
  onOpenAdd: () => void;
  onOpenEdit: (account: AccountRecord) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AccountType>("all");

  const rows = useMemo(
    () =>
      accounts
        .filter((a) => typeFilter === "all" || a.type === typeFilter)
        .filter((a) => [a.name, a.phone, a.type, a.accountCode].join(" ").toLowerCase().includes(search.toLowerCase())),
    [accounts, search, typeFilter],
  );

  return (
    <SimpleScreen title="إضافة/تعديل حساب" onBack={onBack} isDark={isDark}>
      <div className="grid gap-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث حساب"
          className={`rounded-xl border px-3 py-2 ${
            isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-900"
          }`}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | AccountType)}
          className={`rounded-xl border px-3 py-2 ${
            isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-900"
          }`}
        >
          <option value="all">كل الأقسام</option>
          <option value="عملاء">عملاء</option>
          <option value="موردين">موردين</option>
          <option value="بنك">بنك</option>
          <option value="موظفين">موظفين</option>
        </select>
        <button onClick={onOpenAdd} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">
          + إضافة حساب
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((a) => (
          <article
            key={a.id}
            className={`rounded-xl border p-3 text-sm ${
              isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">{a.name}</p>
              <button
                onClick={() => onOpenEdit(a)}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  isDark ? "border-slate-500" : "border-slate-300"
                }`}
              >
                تعديل
              </button>
            </div>
            <p className="opacity-80">القسم: {a.type}</p>
            <p className="opacity-80">رقم الحساب: {a.accountCode}</p>
            <p className="opacity-70">الهاتف: {a.phone || "—"}</p>
          </article>
        ))}
      </div>
    </SimpleScreen>
  );
}

function CashboxesAdminScreen({
  cashboxes,
  onOpenAdd,
  onOpenEdit,
  onBack,
  isDark,
}: {
  cashboxes: CashboxRecord[];
  onOpenAdd: () => void;
  onOpenEdit: (box: CashboxRecord) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () => cashboxes.filter((c) => [c.code, c.name, c.id].join(" ").toLowerCase().includes(search.toLowerCase())),
    [cashboxes, search],
  );

  return (
    <SimpleScreen title="إضافة/تعديل الصناديق" onBack={onBack} isDark={isDark}>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث صندوق"
          className={`rounded-xl border px-3 py-2 ${
            isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-900"
          }`}
        />
        <button onClick={onOpenAdd} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">
          + إضافة صندوق
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((box) => (
          <article
            key={box.id}
            className={`rounded-xl border p-3 text-sm ${
              isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">
                {box.name} (#{box.code})
              </p>
              <button
                onClick={() => onOpenEdit(box)}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  isDark ? "border-slate-500" : "border-slate-300"
                }`}
              >
                تعديل
              </button>
            </div>
            <p className="opacity-80">العملات: {box.enabledCurrencies.join("، ")}</p>
          </article>
        ))}
      </div>
    </SimpleScreen>
  );
}

function CurrenciesScreen({
  currencies,
  baseCurrency,
  onOpenAdd,
  onOpenEditRate,
  onToggleCurrency,
  onBack,
  isDark,
}: {
  currencies: CurrencyRecord[];
  baseCurrency: CurrencyCode;
  onOpenAdd: () => void;
  onOpenEditRate: (currency: CurrencyRecord) => void;
  onToggleCurrency: (code: CurrencyCode) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  return (
    <SimpleScreen title="العملات" onBack={onBack} isDark={isDark}>
      <div className="flex items-center justify-end">
        <button onClick={onOpenAdd} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">
          + إضافة عملة
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full min-w-[760px] text-sm">
          <thead className={isDark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700"}>
            <tr>
              <th className="px-3 py-2 text-right">الرمز</th>
              <th className="px-3 py-2 text-right">الاسم</th>
              <th className="px-3 py-2 text-right">سعر الصرف</th>
              <th className="px-3 py-2 text-right">الحالة</th>
              <th className="px-3 py-2 text-right">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.code} className="border-t border-slate-700/40">
                <td className="px-3 py-2">{c.code}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.code === baseCurrency ? "—" : c.rateToBase ?? ""}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => onToggleCurrency(c.code)}
                    className={`rounded-lg px-2 py-1 text-xs ${
                      c.active ? "bg-emerald-500/25 text-emerald-100" : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {c.active ? "مفعلة" : "موقوفة"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  {c.code === baseCurrency ? (
                    <span className="text-xs opacity-70">العملة الأساسية</span>
                  ) : (
                    <button
                      onClick={() => onOpenEditRate(c)}
                      className={`rounded-lg border px-2 py-1 text-xs ${
                        isDark ? "border-slate-500" : "border-slate-300"
                      }`}
                    >
                      تعديل السعر
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SimpleScreen>
  );
}

function VoucherListScreen({
  type,
  voucherLabel,
  operations,
  accounts,
  cashboxes,
  currencies,
  baseCurrency,
  onCreate,
  onUpdate,
  onDelete,
  onNotify,
  onPrint,
  onBack,
  onToast,
  isDark,
}: {
  type: VoucherType;
  voucherLabel: string;
  operations: OperationItem[];
  accounts: AccountRecord[];
  cashboxes: CashboxRecord[];
  currencies: CurrencyRecord[];
  baseCurrency: CurrencyCode;
  onCreate: (operation: Omit<OperationItem, "id">) => void;
  onUpdate: (id: number, operation: Omit<OperationItem, "id">) => void;
  onDelete: (id: number) => void;
  onNotify: (operation: OperationItem) => void;
  onPrint: (operation: OperationItem) => void;
  onBack: () => void;
  onToast: (message: string, type: "success" | "error") => void;
  isDark: boolean;
}) {
  const accountNames = accounts.map((a) => a.name);
  const cashboxIds = cashboxes.map((c) => c.id);
  const activeCurrencies = currencies.filter((c) => c.active).map((c) => c.code);

  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.name, a])), [accounts]);
  const cashboxById = useMemo(() => new Map(cashboxes.map((c) => [c.id, c])), [cashboxes]);

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [currencyFilter, setCurrencyFilter] = useState<"all" | CurrencyCode>("all");
  const [sectionFilter, setSectionFilter] = useState<"all" | AccountType>("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  const firstCashboxId = cashboxIds[0] ?? 0;

  const getAccountCurrencies = (accountName: string) => {
    const account = accountByName.get(accountName);
    const enabled = account?.enabledCurrencies ?? activeCurrencies;
    return activeCurrencies.filter((x) => enabled.includes(x));
  };

  const getCashboxCurrencies = (cashboxId: number) => {
    const cashbox = cashboxById.get(cashboxId);
    const enabled = cashbox?.enabledCurrencies ?? activeCurrencies;
    return activeCurrencies.filter((x) => enabled.includes(x));
  };

  const pickCurrency = (allowed: CurrencyCode[], current?: CurrencyCode) => {
    if (current && allowed.includes(current)) return current;
    if (allowed.includes(baseCurrency)) return baseCurrency;
    return (allowed[0] ?? baseCurrency) as CurrencyCode;
  };

  const defaultRate = (code: CurrencyCode) => {
    if (code === baseCurrency) return "";
    const rate = currencies.find((c) => c.code === code)?.rateToBase;
    return rate ? String(rate) : "";
  };

  const currencyMeta = (operation: OperationItem) => {
    const accountCurrency = operation.accountCurrency ?? operation.currency;
    const cashboxCurrency = operation.cashboxCurrency ?? operation.currency;
    const accountRate = operation.accountExchangeRate ?? operation.exchangeRate;
    const cashboxRate = operation.cashboxExchangeRate ?? operation.exchangeRate;
    return { accountCurrency, cashboxCurrency, accountRate, cashboxRate };
  };

  const initialCurrency = (activeCurrencies[0] ?? baseCurrency) as CurrencyCode;

  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OperationForm>({
    account: "",
    cashboxId: firstCashboxId,
    amount: "",
    currency: initialCurrency,
    accountCurrency: initialCurrency,
    cashboxCurrency: initialCurrency,
    exchangeRate: "",
    accountExchangeRate: "",
    cashboxExchangeRate: "",
    statement: "",
    reference: "",
    datetimeInput: toDatetimeInput(nowDateTimeString()),
    imageUrl: "",
  });

  const accountCurrenciesForForm = useMemo(
    () => getAccountCurrencies(form.account),
    [form.account, accounts, currencies],
  );

  const cashboxCurrenciesForForm = useMemo(
    () => getCashboxCurrencies(form.cashboxId),
    [form.cashboxId, cashboxes, currencies],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return operations
      .filter((item) => {
        const acc = accountByName.get(item.account);
        const matchesSection = sectionFilter === "all" || acc?.type === sectionFilter;
        const matchesQuery =
          !q ||
          [
            item.id,
            item.statement ?? "",
            item.reference ?? "",
            item.amount,
            item.account,
            item.currency,
            item.accountCurrency ?? "",
            item.cashboxCurrency ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        const dateOnly = parseDateOnly(item.datetime);
        const matchesDate = (!fromDate || dateOnly >= fromDate) && (!toDate || dateOnly <= toDate);
        const matchesCurrency = operationMatchesCurrency(item, currencyFilter);
        const matchesAccount = accountFilter === "all" || item.account === accountFilter;
        return matchesSection && matchesQuery && matchesDate && matchesCurrency && matchesAccount;
      })
      .sort((a, b) =>
        sortOrder === "newest" ? b.datetime.localeCompare(a.datetime) : a.datetime.localeCompare(b.datetime),
      );
  }, [operations, search, fromDate, toDate, currencyFilter, accountFilter, sortOrder, accountByName, sectionFilter]);

  const openCreate = () => {
    const account = "";
    const cashboxId = cashboxIds[0] ?? 0;
    const accountCurrency = pickCurrency(getAccountCurrencies(account));
    const cashboxCurrency = pickCurrency(getCashboxCurrencies(cashboxId));

    setEditingId(null);
    setForm({
      account,
      cashboxId,
      amount: "",
      currency: accountCurrency,
      accountCurrency,
      cashboxCurrency,
      exchangeRate: "",
      accountExchangeRate: defaultRate(accountCurrency),
      cashboxExchangeRate: defaultRate(cashboxCurrency),
      statement: "",
      reference: "",
      datetimeInput: toDatetimeInput(nowDateTimeString()),
      imageUrl: "",
    });
    setOpenForm(true);
  };

  const openEdit = (op: OperationItem) => {
    const meta = currencyMeta(op);
    setEditingId(op.id);
    setForm({
      account: op.account,
      cashboxId: op.cashboxId,
      amount: String(op.amount),
      currency: meta.accountCurrency,
      accountCurrency: meta.accountCurrency,
      cashboxCurrency: meta.cashboxCurrency,
      exchangeRate: op.exchangeRate ? String(op.exchangeRate) : "",
      accountExchangeRate: meta.accountCurrency === baseCurrency ? "" : meta.accountRate ? String(meta.accountRate) : defaultRate(meta.accountCurrency),
      cashboxExchangeRate: meta.cashboxCurrency === baseCurrency ? "" : meta.cashboxRate ? String(meta.cashboxRate) : defaultRate(meta.cashboxCurrency),
      statement: op.statement ?? "",
      reference: op.reference ?? "",
      datetimeInput: toDatetimeInput(op.datetime),
      imageUrl: op.imageUrl ?? "",
    });
    setOpenForm(true);
  };

  const refreshBySelection = (nextAccount: string, nextCashboxId: number) => {
    const nextAccountCurrency = pickCurrency(getAccountCurrencies(nextAccount), form.accountCurrency);
    const nextCashboxCurrency = pickCurrency(getCashboxCurrencies(nextCashboxId), form.cashboxCurrency);
    setForm((f) => ({
      ...f,
      account: nextAccount,
      cashboxId: nextCashboxId,
      currency: nextAccountCurrency,
      accountCurrency: nextAccountCurrency,
      cashboxCurrency: nextCashboxCurrency,
      accountExchangeRate:
        nextAccountCurrency === f.accountCurrency ? f.accountExchangeRate : defaultRate(nextAccountCurrency),
      cashboxExchangeRate:
        nextCashboxCurrency === f.cashboxCurrency ? f.cashboxExchangeRate : defaultRate(nextCashboxCurrency),
    }));
  };

  const saveForm = () => {
    if (!form.account) {
      onToast("يرجى تعبئة حقل الحساب", "error");
      return;
    }
    if (!form.cashboxId) {
      onToast("يرجى تعبئة حقل الصندوق", "error");
      return;
    }
    if (!form.amount) {
      onToast("يرجى تعبئة حقل المبلغ", "error");
      return;
    }
    if (!form.accountCurrency) {
      onToast("يرجى اختيار عملة الحساب", "error");
      return;
    }
    if (!form.cashboxCurrency) {
      onToast("يرجى اختيار عملة الصندوق", "error");
      return;
    }
    if (!form.datetimeInput) {
      onToast("يرجى تعبئة حقل التاريخ", "error");
      return;
    }
    if (form.accountCurrency !== baseCurrency && !form.accountExchangeRate) {
      onToast("يرجى تعبئة سعر صرف عملة الحساب", "error");
      return;
    }
    if (form.cashboxCurrency !== baseCurrency && !form.cashboxExchangeRate) {
      onToast("يرجى تعبئة سعر صرف عملة الصندوق", "error");
      return;
    }

    const payload: Omit<OperationItem, "id"> = {
      type,
      account: form.account,
      cashboxId: form.cashboxId,
      amount: Number(form.amount),
      currency: form.accountCurrency,
      accountCurrency: form.accountCurrency,
      cashboxCurrency: form.cashboxCurrency,
      exchangeRate: form.accountCurrency === baseCurrency ? undefined : Number(form.accountExchangeRate),
      accountExchangeRate: form.accountCurrency === baseCurrency ? undefined : Number(form.accountExchangeRate),
      cashboxExchangeRate: form.cashboxCurrency === baseCurrency ? undefined : Number(form.cashboxExchangeRate),
      statement: form.statement || undefined,
      reference: form.reference || undefined,
      datetime: fromDatetimeInput(form.datetimeInput),
      imageUrl: form.imageUrl || undefined,
    };

    if (editingId) onUpdate(editingId, payload);
    else onCreate(payload);

    setOpenForm(false);
    setEditingId(null);
  };

  const onImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageFile(file);
    setForm((f) => ({ ...f, imageUrl: compressed }));
    onToast("تم إرفاق الصورة بنجاح", "success");
  };

  const selectAccountCurrency = (code: CurrencyCode) => {
    setForm((f) => ({
      ...f,
      currency: code,
      accountCurrency: code,
      accountExchangeRate: defaultRate(code),
      exchangeRate: defaultRate(code),
    }));
  };

  const selectCashboxCurrency = (code: CurrencyCode) => {
    setForm((f) => ({
      ...f,
      cashboxCurrency: code,
      cashboxExchangeRate: defaultRate(code),
    }));
  };

  const inputClass = isDark
    ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900";

  return (
    <section
      className={`relative space-y-4 rounded-3xl border p-6 pb-20 ${
        isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{voucherLabel}</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عام: رقم/بيان/مرجع/مبلغ" className={inputClass} />
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value as "all" | AccountType)} className={inputClass}>
          <option value="all">كل الأقسام</option>
          <option value="عملاء">عملاء</option>
          <option value="موردين">موردين</option>
          <option value="بنك">بنك</option>
          <option value="موظفين">موظفين</option>
        </select>
        <label className="space-y-1 text-sm">
          <span className={isDark ? "text-slate-300" : "text-slate-600"}>من تاريخ</span>
          <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className={isDark ? "text-slate-300" : "text-slate-600"}>إلى تاريخ</span>
          <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        </label>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className={inputClass}><option value="newest">الفرز: الأحدث</option><option value="oldest">الفرز: الأقدم</option></select>
        <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value as "all" | CurrencyCode)} className={inputClass}><option value="all">كل العملات</option>{activeCurrencies.map((code) => <option key={`${type}-fcur-${code}`} value={code}>{code}</option>)}</select>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={inputClass}><option value="all">كل الحسابات</option>{accountNames.map((name) => <option key={`${type}-facc-${name}`} value={name}>{name}</option>)}</select>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => {
          const box = cashboxById.get(item.cashboxId);
          const meta = currencyMeta(item);
          return (
            <article
              key={`${type}-${item.id}`}
              className={`rounded-2xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">#{item.id} - {item.account}</p>
                  <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>{item.statement || "—"}</p>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {formatDateTimeNoSeconds(item.datetime)} | صندوق: #{box?.code ?? item.cashboxId}
                    {item.reference ? ` | مرجع: ${item.reference}` : ""}
                    {meta.accountRate ? ` | صرف الحساب: ${meta.accountRate}` : ""}
                    {meta.cashboxRate ? ` | صرف الصندوق: ${meta.cashboxRate}` : ""}
                  </p>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setActiveMenuId((id) => (id === item.id ? null : item.id))}
                    className={`rounded-lg border px-2 py-1 text-sm ${
                      isDark ? "border-slate-600 bg-slate-700 text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    ☰
                  </button>
                  {activeMenuId === item.id ? (
                    <div className={`absolute left-0 z-10 mt-1 w-44 space-y-1 rounded-xl border p-2 shadow-xl ${isDark ? "border-slate-600 bg-slate-900" : "border-slate-300 bg-white"}`}>
                      <button onClick={() => { openEdit(item); setActiveMenuId(null); }} className={`w-full rounded-lg px-2 py-1.5 text-right text-xs ${isDark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-800"}`}>تعديل</button>
                      <button onClick={() => { onNotify(item); setActiveMenuId(null); }} className="w-full rounded-lg bg-violet-500/30 px-2 py-1.5 text-right text-xs text-violet-100">إرسال إشعار</button>
                      <button onClick={() => { onPrint(item); setActiveMenuId(null); }} className="w-full rounded-lg bg-cyan-500/30 px-2 py-1.5 text-right text-xs text-cyan-100">طباعة PDF</button>
                      <button onClick={() => { onDelete(item.id); setActiveMenuId(null); }} className="w-full rounded-lg bg-rose-500/30 px-2 py-1.5 text-right text-xs text-rose-100">حذف</button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold text-cyan-300">
                <span>{item.amount.toLocaleString()}</span>
                <span className="rounded-md bg-cyan-500/15 px-2 py-0.5">حساب: {meta.accountCurrency}</span>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5">صندوق: {meta.cashboxCurrency}</span>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 ? <p className={`rounded-xl border border-dashed p-4 text-center text-sm ${isDark ? "border-slate-600 bg-slate-800/60 text-slate-400" : "border-slate-300 bg-slate-50 text-slate-500"}`}>لا توجد نتائج.</p> : null}

      <button onClick={openCreate} className="absolute bottom-5 left-5 grid size-12 place-items-center rounded-full bg-cyan-500 text-2xl font-bold text-cyan-950 shadow-xl">+</button>

      {openForm ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/70 p-4">
          <div className={`w-full max-w-2xl rounded-2xl border p-5 ${isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}>
            <h3 className="text-lg font-bold">{editingId ? `تعديل ${voucherLabel}` : `إضافة ${voucherLabel} جديد`}</h3>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>رقم السند تلقائي وغير قابل للتعديل.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={form.account} onChange={(e) => refreshBySelection(e.target.value, form.cashboxId)} className={inputClass}>
                  <option value="">اختر حساب</option>
                  {accountNames.map((name) => <option key={`acc-${name}`} value={name}>{name}</option>)}
                </select>
                <select
                  value={form.accountCurrency}
                  onChange={(e) => selectAccountCurrency(e.target.value as CurrencyCode)}
                  disabled={accountCurrenciesForForm.length <= 1}
                  aria-label="عملة الحساب"
                  className={`${inputClass} w-24 px-2 text-center text-xs font-bold disabled:opacity-70`}
                >
                  {accountCurrenciesForForm.map((code) => <option key={`acc-cur-${code}`} value={code}>{code}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={form.cashboxId} onChange={(e) => refreshBySelection(form.account, Number(e.target.value))} className={inputClass}>
                  <option value={0}>اختر صندوق</option>
                  {cashboxes.map((c) => <option key={`box-${c.id}`} value={c.id}>#{c.code} - {c.name}</option>)}
                </select>
                <select
                  value={form.cashboxCurrency}
                  onChange={(e) => selectCashboxCurrency(e.target.value as CurrencyCode)}
                  disabled={cashboxCurrenciesForForm.length <= 1}
                  aria-label="عملة الصندوق"
                  className={`${inputClass} w-24 px-2 text-center text-xs font-bold disabled:opacity-70`}
                >
                  {cashboxCurrenciesForForm.map((code) => <option key={`box-cur-${code}`} value={code}>{code}</option>)}
                </select>
              </div>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="المبلغ" className={inputClass} />
              <div className={inputClass + " opacity-80"}>العملة الأساسية: {baseCurrency}</div>

              {form.accountCurrency !== baseCurrency ? (
                <input type="number" value={form.accountExchangeRate} onChange={(e) => setForm((f) => ({ ...f, accountExchangeRate: e.target.value, exchangeRate: e.target.value }))} placeholder={`سعر صرف عملة الحساب ${form.accountCurrency}`} className={inputClass} />
              ) : null}

              {form.cashboxCurrency !== baseCurrency ? (
                <input type="number" value={form.cashboxExchangeRate} onChange={(e) => setForm((f) => ({ ...f, cashboxExchangeRate: e.target.value }))} placeholder={`سعر صرف عملة الصندوق ${form.cashboxCurrency}`} className={inputClass} />
              ) : null}

              <input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="رقم المرجع (اختياري)" className={inputClass} />
              <input type="datetime-local" value={form.datetimeInput} onChange={(e) => setForm((f) => ({ ...f, datetimeInput: e.target.value }))} className={inputClass} />
              <textarea rows={3} value={form.statement} onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))} placeholder="البيان" className={`${inputClass} md:col-span-2`} />
              <input type="file" accept="image/*" className={`${inputClass} md:col-span-2`} onChange={onImageSelect} />
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={saveForm} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">حفظ</button>
              <button onClick={() => setOpenForm(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OperationsReportScreen({
  operations,
  settings,
  accounts,
  cashboxes,
  accountNames,
  currencyCodes,
  onPrinted,
  onBack,
  isDark,
}: {
  operations: OperationItem[];
  settings: AppSettings;
  accounts: AccountRecord[];
  cashboxes: CashboxRecord[];
  accountNames: string[];
  currencyCodes: CurrencyCode[];
  onPrinted: (ok: boolean) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  const [includePayment, setIncludePayment] = useState(true);
  const [includeReceipt, setIncludeReceipt] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [currency, setCurrency] = useState<"all" | CurrencyCode>("all");
  const [sectionFilter, setSectionFilter] = useState<"all" | AccountType>("all");
  const [reportMode, setReportMode] = useState<ReportMode>("تحليلي");
  const [rows, setRows] = useState<OperationItem[]>([]);

  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.name, a])), [accounts]);
  const cashboxById = useMemo(() => new Map(cashboxes.map((c) => [c.id, c])), [cashboxes]);

  const buildRows = () =>
    operations
      .filter((op) => (includePayment && op.type === "صرف") || (includeReceipt && op.type === "قبض"))
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => accountInRange(op.account, fromAccount, toAccount, accountNames))
      .filter((op) => operationMatchesCurrency(op, currency))
      .filter((op) => sectionFilter === "all" || accountByName.get(op.account)?.type === sectionFilter)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const viewReport = () => setRows(buildRows());

  const printReport = () => {
    const built = buildRows();
    setRows(built);

    if (reportMode === "تحليلي") {
      const pages = built
        .map((op, idx) => {
          const accCode = accountByName.get(op.account)?.accountCode ?? "—";
          const boxCode = cashboxById.get(op.cashboxId)?.code ?? String(op.cashboxId);
          return `${buildVoucherHtml({ operation: op, settings, accountCode: accCode, cashboxCode: boxCode, includeAttachment: Boolean(op.imageUrl) })}${idx < built.length - 1 ? '<div class="page-break"></div>' : ""}`;
        })
        .join("");

      const ok = renderPrintWindow("تقارير العمليات - تحليلي", pages);
      onPrinted(ok);
      return;
    }

    const rowsHtml = built
      .map((op) => {
        const debit = op.type === "قبض" ? op.amount : 0;
        const credit = op.type === "صرف" ? op.amount : 0;
        const boxCode = cashboxById.get(op.cashboxId)?.code ?? String(op.cashboxId);
        const meta = getOperationCurrencyMeta(op);
        return `<tr>
          <td>${op.id}</td>
          <td>${parseDateOnly(op.datetime)}</td>
          <td>${op.type}</td>
          <td>${op.account}<br/><small>عملة: ${meta.accountCurrency}${meta.accountRate ? ` | سعر الصرف: ${meta.accountRate}` : ""}</small></td>
          <td>${boxCode}<br/><small>عملة: ${meta.cashboxCurrency}${meta.cashboxRate ? ` | سعر الصرف: ${meta.cashboxRate}` : ""}</small></td>
          <td>${debit.toLocaleString()}</td>
          <td>${credit.toLocaleString()}</td>
        </tr>`;
      })
      .join("");

    const totalDebit = built.filter((x) => x.type === "قبض").reduce((s, x) => s + x.amount, 0);
    const totalCredit = built.filter((x) => x.type === "صرف").reduce((s, x) => s + x.amount, 0);

    const html = `
      <div class="page">
        ${buildHeaderHtml(settings)}
        <table>
          <thead><tr><th>رقم السند</th><th>التاريخ</th><th>النوع</th><th>الحساب</th><th>الصندوق</th><th>مدين</th><th>دائن</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot><tr><td colspan="5">الإجمالي</td><td>${totalDebit.toLocaleString()}</td><td>${totalCredit.toLocaleString()}</td></tr></tfoot>
        </table>
      </div>
    `;

    const ok = renderPrintWindow("تقارير العمليات - إجمالي", html);
    onPrinted(ok);
  };

  const totals = useMemo(() => {
    const debit = rows.filter((x) => x.type === "قبض").reduce((s, x) => s + x.amount, 0);
    const credit = rows.filter((x) => x.type === "صرف").reduce((s, x) => s + x.amount, 0);
    return { debit, credit };
  }, [rows]);

  const inputClass = isDark
    ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900";

  return (
    <section className={`space-y-4 rounded-3xl border p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تقارير العمليات</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className={`rounded-2xl border p-4 ${isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"}`}>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={includePayment} onChange={(e) => setIncludePayment(e.target.checked)} className="size-4 accent-cyan-500" /> سندات الصرف</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeReceipt} onChange={(e) => setIncludeReceipt(e.target.checked)} className="size-4 accent-cyan-500" /> سندات القبض</label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)} className={inputClass}><option>تحليلي</option><option>إجمالي</option></select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value as "all" | AccountType)} className={inputClass}><option value="all">كل الأقسام</option><option value="عملاء">عملاء</option><option value="موردين">موردين</option><option value="بنك">بنك</option><option value="موظفين">موظفين</option></select>
        <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className={inputClass}><option value="">من حساب</option>{accountNames.map((name) => <option key={`opf-${name}`} value={name}>{name}</option>)}</select>
        <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} className={inputClass}><option value="">إلى حساب</option>{accountNames.map((name) => <option key={`opt-${name}`} value={name}>{name}</option>)}</select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "all" | CurrencyCode)} className={inputClass}><option value="all">كل العملات</option>{currencyCodes.map((code) => <option key={`opc-${code}`} value={code}>{code}</option>)}</select>
      </div>

      <div className="flex gap-2">
        <button onClick={viewReport} disabled={!includePayment && !includeReceipt} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">عرض التقرير</button>
        <button onClick={printReport} disabled={!includePayment && !includeReceipt} className={`rounded-xl border px-4 py-2 text-sm font-bold disabled:cursor-not-allowed ${isDark ? "border-slate-500 bg-slate-800 text-slate-200 disabled:text-slate-500" : "border-slate-300 bg-white text-slate-700 disabled:text-slate-400"}`}>طباعة PDF</button>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700/40">
          <table className="w-full min-w-[960px] text-sm">
            <thead className={isDark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700"}>
              <tr>
                <th className="px-3 py-2 text-right">رقم السند</th>
                <th className="px-3 py-2 text-right">التاريخ والوقت</th>
                <th className="px-3 py-2 text-right">النوع</th>
                <th className="px-3 py-2 text-right">الحساب</th>
                <th className="px-3 py-2 text-right">الصندوق</th>
                {reportMode === "تحليلي" ? <th className="px-3 py-2 text-right min-w-[280px]">البيان</th> : null}
                <th className="px-3 py-2 text-right">مدين</th>
                <th className="px-3 py-2 text-right">دائن</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((op) => {
                const boxCode = cashboxById.get(op.cashboxId)?.code ?? String(op.cashboxId);
                const meta = getOperationCurrencyMeta(op);
                return (
                  <tr key={`op-${op.type}-${op.id}-${op.datetime}`} className="border-t border-slate-700/30">
                    <td className="px-3 py-2">{op.id}</td>
                    <td className="px-3 py-2">{formatDateTimeNoSeconds(op.datetime)}</td>
                    <td className="px-3 py-2">{op.type}</td>
                    <td className="px-3 py-2">
                      <div>{op.account}</div>
                      <div className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
                        عملة: {meta.accountCurrency}{meta.accountRate ? ` | سعر الصرف: ${meta.accountRate}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{boxCode}</div>
                      <div className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
                        عملة: {meta.cashboxCurrency}{meta.cashboxRate ? ` | سعر الصرف: ${meta.cashboxRate}` : ""}
                      </div>
                    </td>
                    {reportMode === "تحليلي" ? <td className="px-3 py-2">{op.statement ?? "—"}</td> : null}
                    <td className="px-3 py-2 text-emerald-300">{op.type === "قبض" ? op.amount.toLocaleString() : "0"}</td>
                    <td className="px-3 py-2 text-rose-300">{op.type === "صرف" ? op.amount.toLocaleString() : "0"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                <td colSpan={reportMode === "تحليلي" ? 7 : 6} className="px-3 py-2 text-right font-bold">الإجمالي</td>
                <td className="px-3 py-2 font-bold text-emerald-300">{totals.debit.toLocaleString()}</td>
                <td className="px-3 py-2 font-bold text-rose-300">{totals.credit.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function AccountsReportScreen({
  operations,
  settings,
  accountNames,
  currencyCodes,
  accounts,
  onPrinted,
  onBack,
  isDark,
}: {
  operations: OperationItem[];
  settings: AppSettings;
  accountNames: string[];
  currencyCodes: CurrencyCode[];
  accounts: AccountRecord[];
  onPrinted: (ok: boolean) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [currency, setCurrency] = useState<"all" | CurrencyCode>("all");
  const [sectionFilter, setSectionFilter] = useState<"all" | AccountType>("all");
  const [reportMode, setReportMode] = useState<ReportMode>("تحليلي");

  const [analyticalRows, setAnalyticalRows] = useState<
    Array<{ account: string; currency: CurrencyCode; entries: OperationItem[]; debit: number; credit: number; balance: number; nature: string }>
  >([]);
  const [aggregateRows, setAggregateRows] = useState<
    Array<{ account: string; currency: CurrencyCode; debit: number; credit: number; balance: number; nature: string }>
  >([]);

  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.name, a])), [accounts]);

  const build = () => {
    const filtered = operations
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => accountInRange(op.account, fromAccount, toAccount, accountNames))
      .filter((op) => operationMatchesCurrency(op, currency))
      .filter((op) => sectionFilter === "all" || accountByName.get(op.account)?.type === sectionFilter)
      .sort((a, b) => a.datetime.localeCompare(b.datetime));

    const grouped = new Map<string, OperationItem[]>();
    filtered.forEach((op) => {
      const key = `${op.account}__${getOperationCurrencyMeta(op).accountCurrency}`;
      grouped.set(key, [...(grouped.get(key) ?? []), op]);
    });

    const analytical = Array.from(grouped.entries()).map(([key, entries]) => {
      const [account, curr] = key.split("__") as [string, CurrencyCode];
      const debit = entries.filter((e) => e.type === "قبض").reduce((s, e) => s + e.amount, 0);
      const credit = entries.filter((e) => e.type === "صرف").reduce((s, e) => s + e.amount, 0);
      const balance = debit - credit;
      return { account, currency: curr, entries, debit, credit, balance, nature: balance >= 0 ? "لكم" : "عليكم" };
    });

    const aggregate = analytical.map((row) => ({
      account: row.account,
      currency: row.currency,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
      nature: row.nature,
    }));

    return { analytical, aggregate };
  };

  const viewReport = () => {
    const built = build();
    setAnalyticalRows(built.analytical);
    setAggregateRows(built.aggregate);
  };

  const printReport = () => {
    const built = build();
    setAnalyticalRows(built.analytical);
    setAggregateRows(built.aggregate);

    if (reportMode === "تحليلي") {
      const pages = built.analytical
        .map((group, idx) => {
          const rows = group.entries
            .map((entry) => {
              const debit = entry.type === "قبض" ? entry.amount : 0;
              const credit = entry.type === "صرف" ? entry.amount : 0;
              const meta = getOperationCurrencyMeta(entry);
              const note = [
                entry.statement ?? "—",
                `عملة الصندوق: ${meta.cashboxCurrency}${meta.cashboxRate ? ` | سعر الصرف: ${meta.cashboxRate}` : ""}`,
              ].join("<br/>");
              return `<tr>
                <td>${parseDateOnly(entry.datetime)}</td>
                <td>${entry.type}</td>
                <td>${entry.id}</td>
                <td>${note}</td>
                <td>${debit.toLocaleString()}</td>
                <td>${credit.toLocaleString()}</td>
              </tr>`;
            })
            .join("");

          return `
            <div class="page">
              ${buildHeaderHtml(settings)}
              <div class="voucher-title"><div class="voucher-box">تقرير حساب تحليلي</div><div class="meta">الحساب: ${group.account} (${group.currency})</div></div>
              <table>
                <thead><tr><th>التاريخ</th><th>النوع</th><th>رقم العملية</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr><td colspan="4">الإجمالي</td><td>${group.debit.toLocaleString()}</td><td>${group.credit.toLocaleString()}</td></tr></tfoot>
              </table>
              <div class="line">الرصيد: ${group.balance.toLocaleString()} (${group.nature})</div>
            </div>
            ${idx < built.analytical.length - 1 ? '<div class="page-break"></div>' : ""}
          `;
        })
        .join("");

      const ok = renderPrintWindow("تقارير الحسابات - تحليلي", pages);
      onPrinted(ok);
      return;
    }

    const rows = built.aggregate
      .map(
        (row) => `<tr><td>${row.account}</td><td>${row.currency}</td><td>${row.debit.toLocaleString()}</td><td>${row.credit.toLocaleString()}</td><td>${row.balance.toLocaleString()} (${row.nature})</td></tr>`,
      )
      .join("");

    const totalDebit = built.aggregate.reduce((s, r) => s + r.debit, 0);
    const totalCredit = built.aggregate.reduce((s, r) => s + r.credit, 0);

    const html = `
      <div class="page">
        ${buildHeaderHtml(settings)}
        <table>
          <thead><tr><th>الحساب</th><th>العملة</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="2">الإجمالي</td><td>${totalDebit.toLocaleString()}</td><td>${totalCredit.toLocaleString()}</td><td></td></tr></tfoot>
        </table>
      </div>
    `;

    const ok = renderPrintWindow("تقارير الحسابات - إجمالي", html);
    onPrinted(ok);
  };

  const totalFooter = useMemo(
    () => ({ debit: aggregateRows.reduce((s, r) => s + r.debit, 0), credit: aggregateRows.reduce((s, r) => s + r.credit, 0) }),
    [aggregateRows],
  );

  const inputClass = isDark
    ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900";

  return (
    <section className={`space-y-4 rounded-3xl border p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تقارير الحسابات</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)} className={inputClass}><option>تحليلي</option><option>إجمالي</option></select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value as "all" | AccountType)} className={inputClass}><option value="all">كل الأقسام</option><option value="عملاء">عملاء</option><option value="موردين">موردين</option><option value="بنك">بنك</option><option value="موظفين">موظفين</option></select>
        <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className={inputClass}><option value="">من حساب</option>{accountNames.map((name) => <option key={`arf-${name}`} value={name}>{name}</option>)}</select>
        <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} className={inputClass}><option value="">إلى حساب</option>{accountNames.map((name) => <option key={`art-${name}`} value={name}>{name}</option>)}</select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "all" | CurrencyCode)} className={inputClass}><option value="all">كل العملات</option>{currencyCodes.map((code) => <option key={`arc-${code}`} value={code}>{code}</option>)}</select>
      </div>

      <div className="flex gap-2">
        <button onClick={viewReport} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">عرض التقرير</button>
        <button onClick={printReport} className={`rounded-xl border px-4 py-2 text-sm font-bold ${isDark ? "border-slate-500 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}>طباعة PDF</button>
      </div>

      {reportMode === "تحليلي" && analyticalRows.length > 0 ? (
        <div className="space-y-4">
          {analyticalRows.map((group) => (
            <article key={`ana-${group.account}-${group.currency}`} className={`rounded-xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}>
              <p className="mb-2 font-bold">{group.account} - {group.currency}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className={isDark ? "bg-slate-700 text-slate-100" : "bg-slate-100 text-slate-700"}>
                    <tr>
                      <th className="px-2 py-1 text-right">التاريخ والوقت</th>
                      <th className="px-2 py-1 text-right">النوع</th>
                      <th className="px-2 py-1 text-right">رقم العملية</th>
                      <th className="px-2 py-1 text-right">البيان</th>
                      <th className="px-2 py-1 text-right">مدين</th>
                      <th className="px-2 py-1 text-right">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry) => {
                      const meta = getOperationCurrencyMeta(entry);
                      return (
                        <tr key={`ar-${group.account}-${entry.type}-${entry.id}-${entry.datetime}`} className="border-t border-slate-700/30">
                          <td className="px-2 py-1">{formatDateTimeNoSeconds(entry.datetime)}</td>
                          <td className="px-2 py-1">{entry.type}</td>
                          <td className="px-2 py-1">{entry.id}</td>
                          <td className="px-2 py-1">
                            <div>{entry.statement ?? "—"}</div>
                            <div className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>
                              عملة الصندوق: {meta.cashboxCurrency}{meta.cashboxRate ? ` | سعر الصرف: ${meta.cashboxRate}` : ""}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-emerald-300">{entry.type === "قبض" ? entry.amount.toLocaleString() : "0"}</td>
                          <td className="px-2 py-1 text-rose-300">{entry.type === "صرف" ? entry.amount.toLocaleString() : "0"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                      <td colSpan={4} className="px-2 py-1 font-bold">الإجمالي</td>
                      <td className="px-2 py-1 font-bold text-emerald-300">{group.debit.toLocaleString()}</td>
                      <td className="px-2 py-1 font-bold text-rose-300">{group.credit.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-sm text-cyan-300">الرصيد: {group.balance.toLocaleString()} ({group.nature})</p>
            </article>
          ))}
        </div>
      ) : null}

      {reportMode === "إجمالي" && aggregateRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-700/40">
          <table className="w-full min-w-[760px] text-sm">
            <thead className={isDark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700"}>
              <tr>
                <th className="px-3 py-2 text-right">الحساب</th>
                <th className="px-3 py-2 text-right">العملة</th>
                <th className="px-3 py-2 text-right">مدين</th>
                <th className="px-3 py-2 text-right">دائن</th>
                <th className="px-3 py-2 text-right">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {aggregateRows.map((row) => (
                <tr key={`agg-${row.account}-${row.currency}`} className="border-t border-slate-700/30">
                  <td className="px-3 py-2">{row.account}</td>
                  <td className="px-3 py-2">{row.currency}</td>
                  <td className="px-3 py-2 text-emerald-300">{row.debit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-rose-300">{row.credit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-cyan-300">{row.balance.toLocaleString()} ({row.nature})</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                <td colSpan={2} className="px-3 py-2 font-bold">الإجمالي</td>
                <td className="px-3 py-2 font-bold text-emerald-300">{totalFooter.debit.toLocaleString()}</td>
                <td className="px-3 py-2 font-bold text-rose-300">{totalFooter.credit.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ImageReportsScreen({
  operations,
  accounts,
  accountNames,
  currencyCodes,
  onBack,
  onDownload,
  isDark,
}: {
  operations: OperationItem[];
  accounts: AccountRecord[];
  accountNames: string[];
  currencyCodes: CurrencyCode[];
  onBack: () => void;
  onDownload: () => void;
  isDark: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState<"all" | VoucherType>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [currency, setCurrency] = useState<"all" | CurrencyCode>("all");
  const [sectionFilter, setSectionFilter] = useState<"all" | AccountType>("all");
  const [query, setQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.name, a])), [accounts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operations
      .filter((op) => Boolean(op.imageUrl))
      .filter((op) => typeFilter === "all" || op.type === typeFilter)
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => accountInRange(op.account, fromAccount, toAccount, accountNames))
      .filter((op) => operationMatchesCurrency(op, currency))
      .filter((op) => sectionFilter === "all" || accountByName.get(op.account)?.type === sectionFilter)
      .filter((op) => !q || [op.id, op.statement ?? "", op.reference ?? "", op.amount, op.account].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.datetime.localeCompare(a.datetime));
  }, [operations, typeFilter, fromDate, toDate, fromAccount, toAccount, currency, sectionFilter, query, accountNames, accountByName]);

  const inputClass = isDark
    ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900";

  return (
    <section className={`space-y-4 rounded-3xl border p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تقارير الصور المرفقة</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | VoucherType)} className={inputClass}><option value="all">كل العمليات</option><option value="صرف">سندات الصرف</option><option value="قبض">سندات القبض</option></select>
        <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value as "all" | AccountType)} className={inputClass}><option value="all">كل الأقسام</option><option value="عملاء">عملاء</option><option value="موردين">موردين</option><option value="بنك">بنك</option><option value="موظفين">موظفين</option></select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث عام" className={inputClass} />
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "all" | CurrencyCode)} className={inputClass}><option value="all">كل العملات</option>{currencyCodes.map((code) => <option key={`imgc-${code}`} value={code}>{code}</option>)}</select>
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} className={inputClass}><option value="">من حساب</option>{accountNames.map((name) => <option key={`imgf-${name}`} value={name}>{name}</option>)}</select>
        <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} className={inputClass}><option value="">إلى حساب</option>{accountNames.map((name) => <option key={`imgt-${name}`} value={name}>{name}</option>)}</select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={`img-${row.type}-${row.id}-${row.datetime}`} className={`rounded-2xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}>
            <p className="text-sm font-bold">سند #{row.id} - {row.type}</p>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{formatDateTimeNoSeconds(row.datetime)} | {row.account}</p>
            <img src={row.imageUrl} alt={`صورة سند ${row.id}`} className="mt-2 h-44 w-full cursor-zoom-in rounded-xl object-cover" onClick={() => setSelectedImage(row.imageUrl ?? null)} />
          </article>
        ))}
      </div>

      {rows.length === 0 ? <p className={`rounded-xl border border-dashed p-4 text-center text-sm ${isDark ? "border-slate-600 bg-slate-800/50 text-slate-400" : "border-slate-300 bg-slate-50 text-slate-500"}`}>لا توجد صور مطابقة.</p> : null}

      {selectedImage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4">
          <button onClick={() => setSelectedImage(null)} className="absolute right-6 top-6 rounded-lg border border-white/40 px-3 py-1 text-white">إغلاق</button>
          <img src={selectedImage} alt="عرض موسع" className="max-h-[85vh] max-w-[95vw] rounded-xl object-contain" />
          <button
            onClick={async () => {
              try {
                await downloadImageToDevice(selectedImage, `voucher-image-${Date.now()}.jpg`);
                onDownload();
              } catch {
                onDownload();
              }
            }}
            className="mt-4 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-bold text-cyan-950"
          >
            تحميل الصورة
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ContentScreen({
  screen,
  selectedScreen,
  onSelect,
  onTreeSelect,
  settings,
  accounts,
  cashboxes,
  currencies,
  paymentOperations,
  receiptOperations,
  onOpenAddAccount,
  onOpenEditAccount,
  onOpenAddCashbox,
  onOpenEditCashbox,
  onOpenAddCurrency,
  onOpenEditCurrencyRate,
  onToggleCurrency,
  onCreatePayment,
  onCreateReceipt,
  onUpdatePayment,
  onUpdateReceipt,
  onDeletePayment,
  onDeleteReceipt,
  onNotify,
  onPrint,
  onPrinted,
  onImageDownload,
  onToast,
  isDark,
}: {
  screen: ScreenKey;
  selectedScreen: ScreenKey;
  onSelect: (screen: ScreenKey) => void;
  onTreeSelect: (node: TreeNode) => void;
  settings: AppSettings;
  accounts: AccountRecord[];
  cashboxes: CashboxRecord[];
  currencies: CurrencyRecord[];
  paymentOperations: OperationItem[];
  receiptOperations: OperationItem[];
  onOpenAddAccount: () => void;
  onOpenEditAccount: (account: AccountRecord) => void;
  onOpenAddCashbox: () => void;
  onOpenEditCashbox: (box: CashboxRecord) => void;
  onOpenAddCurrency: () => void;
  onOpenEditCurrencyRate: (currency: CurrencyRecord) => void;
  onToggleCurrency: (code: CurrencyCode) => void;
  onCreatePayment: (operation: Omit<OperationItem, "id">) => void;
  onCreateReceipt: (operation: Omit<OperationItem, "id">) => void;
  onUpdatePayment: (id: number, operation: Omit<OperationItem, "id">) => void;
  onUpdateReceipt: (id: number, operation: Omit<OperationItem, "id">) => void;
  onDeletePayment: (id: number) => void;
  onDeleteReceipt: (id: number) => void;
  onNotify: (operation: OperationItem) => void;
  onPrint: (operation: OperationItem) => void;
  onPrinted: (ok: boolean) => void;
  onImageDownload: () => void;
  onToast: (message: string, type: "success" | "error") => void;
  isDark: boolean;
}) {
  const allOperations = [...paymentOperations, ...receiptOperations];
  const accountNames = accounts.map((a) => a.name);
  const currencyCodes = currencies.filter((c) => c.active).map((c) => c.code);

  if (screen === "home") {
    return <HomeScreen selectedScreen={selectedScreen} onTreeSelect={onTreeSelect} isDark={isDark} />;
  }

  if (screen === "system-settings") {
    return (
      <SimpleScreen title="الإعدادات العامة" onBack={() => onSelect("home")} isDark={isDark}>
        <p>اختر بيانات الشركة أو مسميات ونصوص السندات من الشجرة الرئيسية.</p>
      </SimpleScreen>
    );
  }

  if (screen === "system-backup") {
    return (
      <SimpleScreen title="النسخ الاحتياطي والاستعادة" onBack={() => onSelect("home")} isDark={isDark}>
        <p>استخدم أزرار النسخ الاحتياطي والاستعادة من الأسفل.</p>
      </SimpleScreen>
    );
  }

  if (screen === "system-add-account") {
    return <AccountsAdminScreen accounts={accounts} onOpenAdd={onOpenAddAccount} onOpenEdit={onOpenEditAccount} onBack={() => onSelect("home")} isDark={isDark} />;
  }

  if (screen === "system-cashboxes") {
    return <CashboxesAdminScreen cashboxes={cashboxes} onOpenAdd={onOpenAddCashbox} onOpenEdit={onOpenEditCashbox} onBack={() => onSelect("home")} isDark={isDark} />;
  }

  if (screen === "system-currencies") {
    return (
      <CurrenciesScreen
        currencies={currencies}
        baseCurrency={settings.baseCurrency}
        onOpenAdd={onOpenAddCurrency}
        onOpenEditRate={onOpenEditCurrencyRate}
        onToggleCurrency={onToggleCurrency}
        onBack={() => onSelect("home")}
        isDark={isDark}
      />
    );
  }

  if (screen === "payment-vouchers") {
    return (
      <VoucherListScreen
        type="صرف"
        voucherLabel={settings.paymentVoucherLabel}
        operations={paymentOperations}
        accounts={accounts}
        cashboxes={cashboxes}
        currencies={currencies}
        baseCurrency={settings.baseCurrency}
        onCreate={onCreatePayment}
        onUpdate={onUpdatePayment}
        onDelete={onDeletePayment}
        onNotify={onNotify}
        onPrint={onPrint}
        onBack={() => onSelect("home")}
        onToast={onToast}
        isDark={isDark}
      />
    );
  }

  if (screen === "receipt-vouchers") {
    return (
      <VoucherListScreen
        type="قبض"
        voucherLabel={settings.receiptVoucherLabel}
        operations={receiptOperations}
        accounts={accounts}
        cashboxes={cashboxes}
        currencies={currencies}
        baseCurrency={settings.baseCurrency}
        onCreate={onCreateReceipt}
        onUpdate={onUpdateReceipt}
        onDelete={onDeleteReceipt}
        onNotify={onNotify}
        onPrint={onPrint}
        onBack={() => onSelect("home")}
        onToast={onToast}
        isDark={isDark}
      />
    );
  }

  if (screen === "report-operations") {
    return (
      <OperationsReportScreen
        operations={allOperations}
        settings={settings}
        accounts={accounts}
        cashboxes={cashboxes}
        accountNames={accountNames}
        currencyCodes={currencyCodes}
        onPrinted={onPrinted}
        onBack={() => onSelect("home")}
        isDark={isDark}
      />
    );
  }

  if (screen === "report-images") {
    return (
      <ImageReportsScreen
        operations={allOperations}
        accounts={accounts}
        accountNames={accountNames}
        currencyCodes={currencyCodes}
        onBack={() => onSelect("home")}
        onDownload={onImageDownload}
        isDark={isDark}
      />
    );
  }

  return (
    <AccountsReportScreen
      operations={allOperations}
      settings={settings}
      accountNames={accountNames}
      currencyCodes={currencyCodes}
      accounts={accounts}
      onPrinted={onPrinted}
      onBack={() => onSelect("home")}
      isDark={isDark}
    />
  );
}

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");

  const [selectedScreen, setSelectedScreen] = useState<ScreenKey>("home");

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>(defaultCurrencies);
  const [accounts, setAccounts] = useState<AccountRecord[]>(defaultAccounts);
  const [cashboxes, setCashboxes] = useState<CashboxRecord[]>(defaultCashboxes);

  const [paymentOperations, setPaymentOperations] = useState<OperationItem[]>(defaultPayments);
  const [receiptOperations, setReceiptOperations] = useState<OperationItem[]>(defaultReceipts);

  const [nextPaymentId, setNextPaymentId] = useState(1);
  const [nextReceiptId, setNextReceiptId] = useState(1);

  const [setup, setSetup] = useState<SetupState>({
    done: false,
    step: 1,
    selectedBase: "YER",
    cashboxName: "",
    openingBalance: "",
    openingSide: "له",
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [labelsModalOpen, setLabelsModalOpen] = useState(false);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<{
    mode: "create" | "edit";
    id?: number;
    type: AccountType;
    name: string;
    phone: string;
    enabledCurrencies: CurrencyCode[];
    openingBalance: string;
    openingSide: BalanceSide;
  }>({
    mode: "create",
    type: "عملاء",
    name: "",
    phone: "",
    enabledCurrencies: ["YER"],
    openingBalance: "",
    openingSide: "له",
  });

  const [cashboxModalOpen, setCashboxModalOpen] = useState(false);
  const [cashboxForm, setCashboxForm] = useState<{
    mode: "create" | "edit";
    id?: number;
    name: string;
    enabledCurrencies: CurrencyCode[];
    openingBalance: string;
    openingSide: BalanceSide;
  }>({
    mode: "create",
    name: "",
    enabledCurrencies: ["YER"],
    openingBalance: "",
    openingSide: "له",
  });

  const [currencyAddModalOpen, setCurrencyAddModalOpen] = useState(false);
  const [currencyAddForm, setCurrencyAddForm] = useState<{ code: CurrencyCode; name: string; rateToBase: string }>({ code: "EUR", name: CURRENCY_NAMES.EUR, rateToBase: "" });

  const [currencyRateModalOpen, setCurrencyRateModalOpen] = useState(false);
  const [currencyRateEdit, setCurrencyRateEdit] = useState<{ code: CurrencyCode; name: string; rateToBase: string }>({ code: "SAR", name: CURRENCY_NAMES.SAR, rateToBase: "" });

  const [postSaveModalOpen, setPostSaveModalOpen] = useState(false);
  const [postSaveOperation, setPostSaveOperation] = useState<OperationItem | null>(null);

  const [printOptionModalOpen, setPrintOptionModalOpen] = useState(false);
  const [printOperation, setPrintOperation] = useState<OperationItem | null>(null);

  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [notifyOperation, setNotifyOperation] = useState<OperationItem | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");

  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const metaPersistTimerRef = useRef<number | null>(null);

  const isDark = theme === "dark";

  const buildSnapshot = (): AppSnapshot => ({
    storageVersion: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    developer: APP_DEVELOPER,
    theme,
    settings: { ...defaultSettings, ...settings, companyLogoUrl: settings.companyLogoUrl ?? APP_LOGO_URL },
    currencies,
    accounts,
    cashboxes,
    paymentOperations,
    receiptOperations,
    nextPaymentId,
    nextReceiptId,
    setup,
  });

  const addToast = (message: string, type: "success" | "error") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2600);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let parsed: Partial<AppSnapshot> | null = null;

        if (hasIndexedDb()) {
          const meta = await getStoreValue<Partial<AppSnapshot>>(META_STORE, META_STATE_KEY);
          const paymentRows = await getAllStoreRecords<OperationItem>(PAYMENT_STORE);
          const receiptRows = await getAllStoreRecords<OperationItem>(RECEIPT_STORE);
          const oldRaw = localStorage.getItem(STORAGE_KEY);

          if (!meta && paymentRows.length === 0 && receiptRows.length === 0 && oldRaw) {
            const migrated = JSON.parse(oldRaw) as Partial<AppSnapshot>;
            const migrationSnapshot: AppSnapshot = {
              storageVersion: STORAGE_VERSION,
              savedAt: new Date().toISOString(),
              developer: APP_DEVELOPER,
              theme: migrated.theme ?? "dark",
              settings: { ...defaultSettings, ...(migrated.settings ?? {}), companyLogoUrl: migrated.settings?.companyLogoUrl ?? APP_LOGO_URL },
              currencies: migrated.currencies ?? defaultCurrencies,
              accounts: migrated.accounts ?? defaultAccounts,
              cashboxes: migrated.cashboxes ?? defaultCashboxes,
              paymentOperations: migrated.paymentOperations ?? [],
              receiptOperations: migrated.receiptOperations ?? [],
              nextPaymentId:
                migrated.nextPaymentId ??
                Math.max(0, ...(migrated.paymentOperations ?? []).map((operation) => operation.id)) + 1,
              nextReceiptId:
                migrated.nextReceiptId ??
                Math.max(0, ...(migrated.receiptOperations ?? []).map((operation) => operation.id)) + 1,
              setup: migrated.setup ?? setup,
            };
            await saveSnapshotToIndexedDb(migrationSnapshot);
            parsed = migrationSnapshot;
          } else {
            parsed = {
              ...(meta ?? {}),
              paymentOperations: paymentRows,
              receiptOperations: receiptRows,
            };
          }
        } else {
          const raw = localStorage.getItem(STORAGE_KEY);
          parsed = raw ? (JSON.parse(raw) as Partial<AppSnapshot>) : null;
        }

        if (cancelled || !parsed) return;

        const restoredPayments = (parsed.paymentOperations ?? defaultPayments).sort((a, b) => b.datetime.localeCompare(a.datetime));
        const restoredReceipts = (parsed.receiptOperations ?? defaultReceipts).sort((a, b) => b.datetime.localeCompare(a.datetime));

        setTheme(parsed.theme ?? "dark");
        setSettings({ ...defaultSettings, ...(parsed.settings ?? {}), companyLogoUrl: parsed.settings?.companyLogoUrl ?? APP_LOGO_URL });
        setCurrencies(parsed.currencies ?? defaultCurrencies);
        setAccounts(parsed.accounts ?? defaultAccounts);
        setCashboxes(parsed.cashboxes ?? defaultCashboxes);
        setPaymentOperations(restoredPayments);
        setReceiptOperations(restoredReceipts);
        setNextPaymentId(parsed.nextPaymentId ?? Math.max(0, ...restoredPayments.map((operation) => operation.id)) + 1);
        setNextReceiptId(parsed.nextReceiptId ?? Math.max(0, ...restoredReceipts.map((operation) => operation.id)) + 1);
        setSetup(parsed.setup ?? setup);
      } catch {
        // Keep defaults if local data cannot be read.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    void load();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (metaPersistTimerRef.current) window.clearTimeout(metaPersistTimerRef.current);

    metaPersistTimerRef.current = window.setTimeout(() => {
      const snapshot = buildSnapshot();

      if (hasIndexedDb()) {
        const { paymentOperations: _paymentOperations, receiptOperations: _receiptOperations, ...meta } = snapshot;
        void putStoreValue(META_STORE, META_STATE_KEY, meta).catch(() => undefined);
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }, 250);

    return () => {
      if (metaPersistTimerRef.current) window.clearTimeout(metaPersistTimerRef.current);
    };
  }, [hydrated, theme, settings, currencies, accounts, cashboxes, paymentOperations, receiptOperations, nextPaymentId, nextReceiptId, setup]);

  const activeCurrencies = useMemo(() => currencies.filter((c) => c.active).map((c) => c.code), [currencies]);

  const accountCodeByName = useMemo(() => new Map(accounts.map((a) => [a.name, a.accountCode])), [accounts]);
  const cashboxById = useMemo(() => new Map(cashboxes.map((c) => [c.id, c])), [cashboxes]);

  const buildNotifyMessage = (operation: OperationItem) => {
    const head = operation.type === "صرف" ? settings.paymentNoticeTemplate : settings.receiptNoticeTemplate;
    const sideWord = operation.type === "صرف" ? "عليكم" : "لكم";
    const accountCurrency = operation.accountCurrency ?? operation.currency;
    const cashboxCurrency = operation.cashboxCurrency ?? operation.currency;
    const accountRate = operation.accountExchangeRate ?? operation.exchangeRate;
    const cashboxRate = operation.cashboxExchangeRate ?? operation.exchangeRate;
    const currencyLabel = CURRENCY_NAMES[accountCurrency] ?? accountCurrency;
    const amountWords = `${numberToArabicWords(operation.amount)} ${currencyLabel}`;
    const rates = [
      accountRate ? `سعر صرف الحساب: ${accountRate}` : "",
      cashboxRate ? `سعر صرف الصندوق: ${cashboxRate}` : "",
    ].filter(Boolean);
    return `${head}\n${sideWord} مبلغ وقدره ${operation.amount.toLocaleString()} ${amountWords}\nعملة الحساب: ${accountCurrency}\nعملة الصندوق: ${cashboxCurrency}${rates.length ? `\n${rates.join("\n")}` : ""}\nوذلك مقابل / ${operation.statement ?? "—"}`;
  };

  const handleTreeSelect = (node: TreeNode) => {
    if (node.action === "open-company") {
      setCompanyModalOpen(true);
      return;
    }
    if (node.action === "open-labels") {
      setLabelsModalOpen(true);
      return;
    }
    if (node.screen) setSelectedScreen(node.screen);
  };

  const beginNotify = (operation: OperationItem) => {
    setNotifyOperation(operation);
    setNotifyMessage(buildNotifyMessage(operation));
    setNotifyModalOpen(true);
  };

  const doNotifyOpenShare = async () => {
    if (!notifyOperation) return;

    const account = accounts.find((a) => a.name === notifyOperation.account);
    const phone = sanitizePhone(account?.phone ?? "");

    try {
      if (navigator.share) {
        await navigator.share({ title: "إشعار سند", text: notifyMessage });
        addToast("تم فتح خيارات المشاركة من الهاتف", "success");
        return;
      }
    } catch {
      addToast("تعذر فتح قائمة المشاركة", "error");
      return;
    }

    if (phone) {
      const encoded = encodeURIComponent(notifyMessage);
      const url = `sms:${phone}?body=${encoded}`;
      const opened = window.open(url, "_blank");
      addToast(opened ? "تم فتح تطبيق الرسائل" : "فشل فتح تطبيق الرسائل", opened ? "success" : "error");
      return;
    }

    addToast("المشاركة غير مدعومة على هذا الجهاز", "error");
  };

  const printNow = (operation: OperationItem, includeAttachment: boolean) => {
    const accountCode = accountCodeByName.get(operation.account) ?? "—";
    const cashboxCode = cashboxById.get(operation.cashboxId)?.code ?? String(operation.cashboxId);

    const html = buildVoucherHtml({
      operation,
      settings,
      accountCode,
      cashboxCode,
      includeAttachment,
    });
    const ok = renderPrintWindow("طباعة سند", html);
    addToast(ok ? "تمت الطباعة بنجاح" : "فشلت الطباعة", ok ? "success" : "error");
  };

  const beginPrint = (operation: OperationItem) => {
    if (operation.imageUrl) {
      setPrintOperation(operation);
      setPrintOptionModalOpen(true);
    } else {
      printNow(operation, false);
    }
  };

  const createOperation = (
    type: VoucherType,
    operation: Omit<OperationItem, "id">,
    target: "payment" | "receipt",
  ) => {
    if (target === "payment") {
      const created: OperationItem = {
        ...operation,
        type,
        id: nextPaymentId,
      };
      setPaymentOperations((prev) => [created, ...prev]);
      if (hasIndexedDb()) void putOperationRecord(PAYMENT_STORE, created).catch(() => addToast("تعذر حفظ السند في قاعدة الهاتف", "error"));
      setNextPaymentId((n) => n + 1);
      setPostSaveOperation(created);
      setPostSaveModalOpen(true);
      addToast("تم حفظ سند الصرف", "success");
      return;
    }

    const created: OperationItem = {
      ...operation,
      type,
      id: nextReceiptId,
    };
    setReceiptOperations((prev) => [created, ...prev]);
    if (hasIndexedDb()) void putOperationRecord(RECEIPT_STORE, created).catch(() => addToast("تعذر حفظ السند في قاعدة الهاتف", "error"));
    setNextReceiptId((n) => n + 1);
    setPostSaveOperation(created);
    setPostSaveModalOpen(true);
    addToast("تم حفظ سند القبض", "success");
  };

  const updateOperation = (
    id: number,
    operation: Omit<OperationItem, "id">,
    target: "payment" | "receipt",
  ) => {
    const storeName = target === "payment" ? PAYMENT_STORE : RECEIPT_STORE;
    const existing = (target === "payment" ? paymentOperations : receiptOperations).find((item) => item.id === id);
    const updatedOperation = existing ? { ...existing, ...operation } : null;
    const updater = (item: OperationItem) =>
      item.id === id
        ? {
            ...item,
            ...operation,
          }
        : item;

    if (target === "payment") setPaymentOperations((prev) => prev.map(updater));
    else setReceiptOperations((prev) => prev.map(updater));
    if (updatedOperation && hasIndexedDb()) {
      void putOperationRecord(storeName, updatedOperation).catch(() => addToast("تعذر حفظ التعديل في قاعدة الهاتف", "error"));
    }
    addToast("تم تعديل السند", "success");
  };

  const backupNow = () => {
    const payload = buildSnapshot();
    downloadJsonFile(`proof-daftar-backup-${Date.now()}.json`, payload);
    addToast("تم إنشاء النسخة الاحتياطية", "success");
  };

  const restoreFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppSnapshot>;

      if (!parsed.settings || !parsed.accounts || !parsed.currencies || !parsed.cashboxes) {
        addToast("ملف النسخة غير صالح", "error");
        return;
      }

      const restoredPayments = parsed.paymentOperations ?? [];
      const restoredReceipts = parsed.receiptOperations ?? [];
      const restoredSnapshot: AppSnapshot = {
        storageVersion: STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        developer: APP_DEVELOPER,
        theme: parsed.theme ?? "dark",
        settings: { ...defaultSettings, ...parsed.settings, companyLogoUrl: parsed.settings.companyLogoUrl ?? APP_LOGO_URL },
        currencies: parsed.currencies,
        accounts: parsed.accounts,
        cashboxes: parsed.cashboxes,
        paymentOperations: restoredPayments,
        receiptOperations: restoredReceipts,
        nextPaymentId: parsed.nextPaymentId ?? Math.max(0, ...restoredPayments.map((operation) => operation.id)) + 1,
        nextReceiptId: parsed.nextReceiptId ?? Math.max(0, ...restoredReceipts.map((operation) => operation.id)) + 1,
        setup: parsed.setup ?? { ...setup, done: true },
      };

      if (hasIndexedDb()) await saveSnapshotToIndexedDb(restoredSnapshot);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredSnapshot));

      setTheme(restoredSnapshot.theme);
      setSettings(restoredSnapshot.settings);
      setCurrencies(restoredSnapshot.currencies);
      setAccounts(restoredSnapshot.accounts);
      setCashboxes(restoredSnapshot.cashboxes);
      setPaymentOperations(restoredSnapshot.paymentOperations.sort((a, b) => b.datetime.localeCompare(a.datetime)));
      setReceiptOperations(restoredSnapshot.receiptOperations.sort((a, b) => b.datetime.localeCompare(a.datetime)));
      setNextPaymentId(restoredSnapshot.nextPaymentId);
      setNextReceiptId(restoredSnapshot.nextReceiptId);
      setSetup(restoredSnapshot.setup);
      setSelectedScreen("home");
      addToast("تمت استعادة النسخة الاحتياطية", "success");
    } catch {
      addToast("فشلت عملية الاستعادة", "error");
    } finally {
      event.target.value = "";
    }
  };

  const continueSetup = () => {
    if (setup.step === 1) {
      const nextSettings = { ...settings, baseCurrency: setup.selectedBase };
      setSettings(nextSettings);

      setCurrencies((prev) =>
        prev.map((c) =>
          c.code === setup.selectedBase
            ? { ...c, active: true, rateToBase: 1 }
            : { ...c, rateToBase: c.rateToBase ?? null },
        ),
      );

      setSetup((s) => ({ ...s, step: 2 }));
      return;
    }

    if (!setup.cashboxName.trim()) {
      addToast("اسم الصندوق مطلوب لإكمال التهيئة", "error");
      return;
    }

    const firstCashbox: CashboxRecord = {
      id: 1,
      code: "1",
      name: setup.cashboxName,
      enabledCurrencies: activeCurrencies.length ? activeCurrencies : [setup.selectedBase],
      openingBalance: setup.openingBalance ? Number(setup.openingBalance) : undefined,
      openingSide: setup.openingBalance ? setup.openingSide : undefined,
    };

    setCashboxes([firstCashbox]);
    setSetup((s) => ({ ...s, done: true }));
    setSelectedScreen("home");
    addToast("اكتملت تهيئة النظام", "success");
  };

  if (!hydrated) {
    return <main className="min-h-screen" />;
  }

  if (!setup.done) {
    return <SetupWizard setup={setup} onChange={setSetup} onContinue={continueSetup} isDark={isDark} />;
  }

  return (
    <main
      className={`min-h-screen w-full px-3 py-4 md:px-6 ${
        isDark
          ? "bg-[linear-gradient(160deg,#0f172a,#020617_55%,#111827)] text-slate-100"
          : "bg-[linear-gradient(160deg,#f8fafc,#e2e8f0_55%,#dbeafe)] text-slate-900"
      }`}
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-4">
        <header
          className={`rounded-2xl border px-4 py-3 ${
            isDark ? "border-slate-700/70 bg-slate-900/70" : "border-slate-300 bg-white/90"
          }`}
        >
          <div className="relative flex items-center justify-center py-1">
            <button
              onClick={() => setSelectedScreen("home")}
              className={`absolute right-0 rounded-xl border px-3 py-2 text-sm font-bold ${
                isDark
                  ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              الرئيسية
            </button>

            <div className="text-center">
              <p className={`text-xs uppercase tracking-[0.2em] ${isDark ? "text-cyan-300" : "text-blue-700"}`}>Proof Daftar</p>
              <p className="text-sm font-semibold">بروف دفتر - نظام محاسبي</p>
            </div>

            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className={`absolute left-0 rounded-xl border px-3 py-2 text-sm font-bold ${
                isDark
                  ? "border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {isDark ? "☀️ نهاري" : "🌙 ليلي"}
            </button>
          </div>
        </header>

        <ContentScreen
          screen={selectedScreen}
          selectedScreen={selectedScreen}
          onSelect={setSelectedScreen}
          onTreeSelect={handleTreeSelect}
          settings={settings}
          accounts={accounts}
          cashboxes={cashboxes}
          currencies={currencies}
          paymentOperations={paymentOperations}
          receiptOperations={receiptOperations}
          onOpenAddAccount={() => {
            setAccountForm({
              mode: "create",
              type: "عملاء",
              name: "",
              phone: "",
              enabledCurrencies: [settings.baseCurrency],
              openingBalance: "",
              openingSide: "له",
            });
            setAccountModalOpen(true);
          }}
          onOpenEditAccount={(account) => {
            setAccountForm({
              mode: "edit",
              id: account.id,
              type: account.type,
              name: account.name,
              phone: account.phone,
              enabledCurrencies: account.enabledCurrencies,
              openingBalance: account.openingBalance ? String(account.openingBalance) : "",
              openingSide: account.openingSide ?? "له",
            });
            setAccountModalOpen(true);
          }}
          onOpenAddCashbox={() => {
            setCashboxForm({
              mode: "create",
              name: "",
              enabledCurrencies: [settings.baseCurrency],
              openingBalance: "",
              openingSide: "له",
            });
            setCashboxModalOpen(true);
          }}
          onOpenEditCashbox={(box) => {
            setCashboxForm({
              mode: "edit",
              id: box.id,
              name: box.name,
              enabledCurrencies: box.enabledCurrencies,
              openingBalance: box.openingBalance ? String(box.openingBalance) : "",
              openingSide: box.openingSide ?? "له",
            });
            setCashboxModalOpen(true);
          }}
          onOpenAddCurrency={() => setCurrencyAddModalOpen(true)}
          onOpenEditCurrencyRate={(currency) => {
            setCurrencyRateEdit({ code: currency.code, name: currency.name, rateToBase: String(currency.rateToBase ?? "") });
            setCurrencyRateModalOpen(true);
          }}
          onToggleCurrency={(code) => {
            if (code === settings.baseCurrency) {
              addToast("لا يمكن تعطيل العملة الأساسية", "error");
              return;
            }
            setCurrencies((prev) => prev.map((c) => (c.code === code ? { ...c, active: !c.active } : c)));
            addToast("تم تحديث حالة العملة", "success");
          }}
          onCreatePayment={(operation) => createOperation("صرف", operation, "payment")}
          onCreateReceipt={(operation) => createOperation("قبض", operation, "receipt")}
          onUpdatePayment={(id, operation) => updateOperation(id, operation, "payment")}
          onUpdateReceipt={(id, operation) => updateOperation(id, operation, "receipt")}
          onDeletePayment={(id) => {
            setPaymentOperations((prev) => prev.filter((op) => op.id !== id));
            if (hasIndexedDb()) void deleteOperationRecord(PAYMENT_STORE, id).catch(() => addToast("تعذر حذف السند من قاعدة الهاتف", "error"));
            addToast("تم حذف سند الصرف", "success");
          }}
          onDeleteReceipt={(id) => {
            setReceiptOperations((prev) => prev.filter((op) => op.id !== id));
            if (hasIndexedDb()) void deleteOperationRecord(RECEIPT_STORE, id).catch(() => addToast("تعذر حذف السند من قاعدة الهاتف", "error"));
            addToast("تم حذف سند القبض", "success");
          }}
          onNotify={beginNotify}
          onPrint={beginPrint}
          onPrinted={(ok) => addToast(ok ? "تم تجهيز الطباعة" : "فشل تجهيز الطباعة", ok ? "success" : "error")}
          onImageDownload={() => addToast("تم تنزيل الصورة", "success")}
          onToast={addToast}
          isDark={isDark}
        />

        {selectedScreen === "system-backup" ? (
          <div className={`rounded-2xl border p-4 ${isDark ? "border-slate-700 bg-slate-900/70" : "border-slate-300 bg-white/90"}`}>
            <p className={`mb-3 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              التخزين محلي ومفتوح حسب مساحة الهاتف، ويتم ضغط صور السندات تلقائياً لتقليل الحجم مع الحفاظ على وضوحها.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={backupNow} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950">نسخ احتياطي الآن</button>
              <button onClick={() => restoreInputRef.current?.click()} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-500 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}>استعادة نسخة</button>
              <input ref={restoreInputRef} type="file" accept="application/json" className="hidden" onChange={restoreFromFile} />
            </div>
          </div>
        ) : null}
      </div>

      {companyModalOpen ? (
        <ModalShell title="بيانات الشركة" onClose={() => setCompanyModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={settings.companyAr} onChange={(e) => setSettings((s) => ({ ...s, companyAr: e.target.value }))} placeholder="اسم الشركة بالعربي" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={settings.companyEn} onChange={(e) => setSettings((s) => ({ ...s, companyEn: e.target.value }))} placeholder="اسم الشركة بالإنجليزي" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={settings.phone1} onChange={(e) => setSettings((s) => ({ ...s, phone1: e.target.value }))} placeholder="هاتف 1" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={settings.phone2} onChange={(e) => setSettings((s) => ({ ...s, phone2: e.target.value }))} placeholder="هاتف 2" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={settings.reserve1} onChange={(e) => setSettings((s) => ({ ...s, reserve1: e.target.value }))} placeholder="سطر معلومات (EN)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={settings.reserve2} onChange={(e) => setSettings((s) => ({ ...s, reserve2: e.target.value }))} placeholder="سطر معلومات (AR)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <label className={`md:col-span-2 rounded-xl border border-dashed px-3 py-2 text-sm ${isDark ? "border-slate-600 bg-slate-800 text-slate-300" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
              شعار الشركة
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const compressed = await compressImageFile(file, 700, 0.76);
                  setSettings((s) => ({ ...s, companyLogoUrl: compressed }));
                  addToast("تم تحديث الشعار", "success");
                }}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setCompanyModalOpen(false); addToast("تم حفظ بيانات الشركة", "success"); }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">حفظ</button>
            <button onClick={() => setCompanyModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
          </div>
        </ModalShell>
      ) : null}

      {labelsModalOpen ? (
        <ModalShell title="مسميات ونصوص السندات" onClose={() => setLabelsModalOpen(false)} isDark={isDark}>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input value={settings.paymentVoucherLabel} onChange={(e) => setSettings((s) => ({ ...s, paymentVoucherLabel: e.target.value }))} placeholder="مسمى سند الصرف" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
              <input value={settings.receiptVoucherLabel} onChange={(e) => setSettings((s) => ({ ...s, receiptVoucherLabel: e.target.value }))} placeholder="مسمى سند القبض" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            </div>
            <textarea rows={3} value={settings.paymentNoticeTemplate} onChange={(e) => setSettings((s) => ({ ...s, paymentNoticeTemplate: e.target.value }))} placeholder="رأس إشعار الصرف" className={isDark ? "w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "w-full rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <textarea rows={3} value={settings.receiptNoticeTemplate} onChange={(e) => setSettings((s) => ({ ...s, receiptNoticeTemplate: e.target.value }))} placeholder="رأس إشعار القبض" className={isDark ? "w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "w-full rounded-xl border border-slate-300 bg-white px-3 py-2"} />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setLabelsModalOpen(false); addToast("تم حفظ المسميات", "success"); }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">حفظ</button>
            <button onClick={() => setLabelsModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
          </div>
        </ModalShell>
      ) : null}

      {accountModalOpen ? (
        <ModalShell title={accountForm.mode === "create" ? "إضافة حساب" : "تعديل حساب"} onClose={() => setAccountModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={accountForm.type} onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value as AccountType }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}><option>عملاء</option><option>موردين</option><option>بنك</option><option>موظفين</option></select>
            <input value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الحساب" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={accountForm.phone} onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))} placeholder="رقم الهاتف" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={accountForm.openingBalance} onChange={(e) => setAccountForm((f) => ({ ...f, openingBalance: e.target.value }))} placeholder="رصيد افتتاحي (اختياري)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <select value={accountForm.openingSide} onChange={(e) => setAccountForm((f) => ({ ...f, openingSide: e.target.value as BalanceSide }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}><option>له</option><option>عليه</option></select>
          </div>

          <div className={`mt-3 rounded-xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"}`}>
            <p className="mb-2 text-sm">العملات المفعلة للحساب:</p>
            <div className="flex flex-wrap gap-3">
              {currencies.filter((c) => c.active).map((currency) => (
                <label key={`accm-${currency.code}`} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={accountForm.enabledCurrencies.includes(currency.code)}
                    onChange={(e) => setAccountForm((f) => ({ ...f, enabledCurrencies: e.target.checked ? [...f.enabledCurrencies, currency.code] : f.enabledCurrencies.filter((x) => x !== currency.code) }))}
                    className="size-4 accent-cyan-500"
                  />
                  {currency.code}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                if (!accountForm.name.trim()) {
                  addToast("اسم الحساب مطلوب", "error");
                  return;
                }
                if (accountForm.enabledCurrencies.length === 0) {
                  addToast("اختر عملة واحدة على الأقل", "error");
                  return;
                }

                if (accountForm.mode === "create") {
                  const typeAccounts = accounts.filter((a) => a.type === accountForm.type);
                  const nextSerial = (Math.max(0, ...typeAccounts.map((a) => a.serial)) || 0) + 1;
                  const sectionCode = TYPE_SECTION_CODE[accountForm.type];
                  const accountCode = `${sectionCode}${String(nextSerial).padStart(4, "0")}`;

                  setAccounts((prev) => [
                    ...prev,
                    {
                      id: Date.now(),
                      type: accountForm.type,
                      sectionCode,
                      serial: nextSerial,
                      accountCode,
                      name: accountForm.name,
                      phone: accountForm.phone,
                      enabledCurrencies: accountForm.enabledCurrencies,
                      openingBalance: accountForm.openingBalance ? Number(accountForm.openingBalance) : undefined,
                      openingSide: accountForm.openingBalance ? accountForm.openingSide : undefined,
                    },
                  ]);
                  addToast("تم إضافة الحساب", "success");
                } else {
                  setAccounts((prev) => prev.map((a) => a.id === accountForm.id ? { ...a, type: accountForm.type, name: accountForm.name, phone: accountForm.phone, enabledCurrencies: accountForm.enabledCurrencies, openingBalance: accountForm.openingBalance ? Number(accountForm.openingBalance) : undefined, openingSide: accountForm.openingBalance ? accountForm.openingSide : undefined } : a));
                  addToast("تم تعديل الحساب", "success");
                }

                setAccountModalOpen(false);
              }}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950"
            >
              حفظ
            </button>
            <button onClick={() => setAccountModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
          </div>
        </ModalShell>
      ) : null}

      {cashboxModalOpen ? (
        <ModalShell title={cashboxForm.mode === "create" ? "إضافة صندوق" : "تعديل صندوق"} onClose={() => setCashboxModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={cashboxForm.name} onChange={(e) => setCashboxForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الصندوق" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={cashboxForm.openingBalance} onChange={(e) => setCashboxForm((f) => ({ ...f, openingBalance: e.target.value }))} placeholder="رصيد افتتاحي (اختياري)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <select value={cashboxForm.openingSide} onChange={(e) => setCashboxForm((f) => ({ ...f, openingSide: e.target.value as BalanceSide }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}><option>له</option><option>عليه</option></select>
          </div>

          <div className={`mt-3 rounded-xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"}`}>
            <p className="mb-2 text-sm">العملات المفعلة للصندوق:</p>
            <div className="flex flex-wrap gap-3">
              {currencies.filter((c) => c.active).map((currency) => (
                <label key={`boxm-${currency.code}`} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cashboxForm.enabledCurrencies.includes(currency.code)}
                    onChange={(e) => setCashboxForm((f) => ({ ...f, enabledCurrencies: e.target.checked ? [...f.enabledCurrencies, currency.code] : f.enabledCurrencies.filter((x) => x !== currency.code) }))}
                    className="size-4 accent-cyan-500"
                  />
                  {currency.code}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                if (!cashboxForm.name.trim()) {
                  addToast("اسم الصندوق مطلوب", "error");
                  return;
                }
                if (cashboxForm.enabledCurrencies.length === 0) {
                  addToast("اختر عملة واحدة على الأقل", "error");
                  return;
                }

                if (cashboxForm.mode === "create") {
                  const nextCode = String((Math.max(0, ...cashboxes.map((c) => Number(c.code))) || 0) + 1);
                  setCashboxes((prev) => [...prev, { id: Date.now(), code: nextCode, name: cashboxForm.name, enabledCurrencies: cashboxForm.enabledCurrencies, openingBalance: cashboxForm.openingBalance ? Number(cashboxForm.openingBalance) : undefined, openingSide: cashboxForm.openingBalance ? cashboxForm.openingSide : undefined }]);
                  addToast("تم إضافة الصندوق", "success");
                } else {
                  setCashboxes((prev) => prev.map((c) => c.id === cashboxForm.id ? { ...c, name: cashboxForm.name, enabledCurrencies: cashboxForm.enabledCurrencies, openingBalance: cashboxForm.openingBalance ? Number(cashboxForm.openingBalance) : undefined, openingSide: cashboxForm.openingBalance ? cashboxForm.openingSide : undefined } : c));
                  addToast("تم تعديل الصندوق", "success");
                }

                setCashboxModalOpen(false);
              }}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950"
            >
              حفظ
            </button>
            <button onClick={() => setCashboxModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
          </div>
        </ModalShell>
      ) : null}

      {currencyAddModalOpen ? (
        <ModalShell title="إضافة عملة جديدة" onClose={() => setCurrencyAddModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={currencyAddForm.code} onChange={(e) => setCurrencyAddForm((f) => ({ ...f, code: e.target.value as CurrencyCode, name: CURRENCY_NAMES[e.target.value as CurrencyCode] }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}><option value="EUR">EUR</option><option value="AED">AED</option><option value="USD">USD</option><option value="SAR">SAR</option><option value="YER">YER</option></select>
            <input value={currencyAddForm.name} onChange={(e) => setCurrencyAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم العملة" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={currencyAddForm.rateToBase} onChange={(e) => setCurrencyAddForm((f) => ({ ...f, rateToBase: e.target.value }))} placeholder="سعر الصرف" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 md:col-span-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2 md:col-span-2"} />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                if (currencies.some((c) => c.code === currencyAddForm.code)) {
                  addToast("رمز العملة موجود", "error");
                  return;
                }
                setCurrencies((prev) => [...prev, { code: currencyAddForm.code, name: currencyAddForm.name || CURRENCY_NAMES[currencyAddForm.code], rateToBase: currencyAddForm.rateToBase ? Number(currencyAddForm.rateToBase) : null, active: true }]);
                setCurrencyAddModalOpen(false);
                setCurrencyAddForm({ code: "EUR", name: CURRENCY_NAMES.EUR, rateToBase: "" });
                addToast("تم إضافة العملة", "success");
              }}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950"
            >
              حفظ
            </button>
            <button onClick={() => setCurrencyAddModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
          </div>
        </ModalShell>
      ) : null}

      {currencyRateModalOpen ? (
        <ModalShell title={`تعديل سعر ${currencyRateEdit.code}`} onClose={() => setCurrencyRateModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={currencyRateEdit.code} readOnly className={isDark ? "rounded-xl border border-slate-600 bg-slate-700 px-3 py-2 text-slate-300" : "rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-slate-600"} />
            <input value={currencyRateEdit.name} readOnly className={isDark ? "rounded-xl border border-slate-600 bg-slate-700 px-3 py-2 text-slate-300" : "rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-slate-600"} />
            <input value={currencyRateEdit.rateToBase} onChange={(e) => setCurrencyRateEdit((f) => ({ ...f, rateToBase: e.target.value }))} placeholder="سعر الصرف" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 md:col-span-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2 md:col-span-2"} />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                if (!currencyRateEdit.rateToBase) {
                  addToast("أدخل سعر الصرف", "error");
                  return;
                }
                setCurrencies((prev) => prev.map((c) => c.code === currencyRateEdit.code ? { ...c, rateToBase: Number(currencyRateEdit.rateToBase) } : c));
                setCurrencyRateModalOpen(false);
                addToast("تم تعديل سعر الصرف", "success");
              }}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950"
            >
              حفظ
            </button>
            <button onClick={() => setCurrencyRateModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
          </div>
        </ModalShell>
      ) : null}

      {postSaveModalOpen && postSaveOperation ? (
        <ModalShell title="تم الحفظ" onClose={() => setPostSaveModalOpen(false)} isDark={isDark}>
          <p className="text-sm">هل تريد طباعة العملية أم إرسال إشعار الآن؟</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => { setPostSaveModalOpen(false); beginPrint(postSaveOperation); }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">طباعة</button>
            <button onClick={() => { setPostSaveModalOpen(false); beginNotify(postSaveOperation); }} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white">إرسال إشعار</button>
            <button onClick={() => setPostSaveModalOpen(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>لاحقًا</button>
          </div>
        </ModalShell>
      ) : null}

      {printOptionModalOpen && printOperation ? (
        <ModalShell title="خيارات الطباعة" onClose={() => setPrintOptionModalOpen(false)} isDark={isDark}>
          <p className="text-sm">هذا السند يحتوي على مرفق. هل تريد طباعة المرفق أيضًا؟</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { printNow(printOperation, true); setPrintOptionModalOpen(false); }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">نعم، مع المرفق</button>
            <button onClick={() => { printNow(printOperation, false); setPrintOptionModalOpen(false); }} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-500 bg-slate-800" : "border-slate-300 bg-white"}`}>بدون المرفق</button>
          </div>
        </ModalShell>
      ) : null}

      {notifyModalOpen && notifyOperation ? (
        <ModalShell title="إرسال إشعار" onClose={() => setNotifyModalOpen(false)} isDark={isDark}>
          <div className="space-y-3">
            <p className="text-sm">راجع النص ثم افتح مشاركة الهاتف لاختيار التطبيق المطلوب.</p>
            <textarea rows={6} value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} className={isDark ? "w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "w-full rounded-xl border border-slate-300 bg-white px-3 py-2"} />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={doNotifyOpenShare} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">فتح خيارات المشاركة</button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(notifyMessage);
                  addToast("تم نسخ نص الإشعار", "success");
                } catch {
                  addToast("تعذر نسخ نص الإشعار", "error");
                }
              }}
              className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}
            >
              نسخ النص
            </button>
          </div>
        </ModalShell>
      ) : null}

      <Toasts toasts={toasts} />
    </main>
  );
}
