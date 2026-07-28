"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
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
  | "report-cashboxes"
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
  openingCurrency?: CurrencyCode;
};

type CashboxRecord = {
  id: number;
  code: string;
  name: string;
  enabledCurrencies: CurrencyCode[];
  openingBalance?: number;
  openingSide?: BalanceSide;
  openingCurrency?: CurrencyCode;
};

type OperationItem = {
  id: number;
  type: VoucherType;
  account: string;
  cashboxId: number;
  amount: number;
  accountAmount?: number;
  cashboxAmount?: number;
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
  action?: "open-company";
  children?: TreeNode[];
};

type Toast = {
  id: number;
  message: string;
  type: "success" | "error";
};

type ContactPicker = {
  select?: (properties: string[], options?: { multiple?: boolean }) => Promise<Array<{ tel?: string[] }>>;
};

type SaveFilePicker = {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<{ createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

type SaveResult = "saved" | "shared" | "downloaded" | "cancelled";

type NativeToolsPlugin = {
  saveBase64File: (options: { filename: string; mimeType: string; base64: string }) => Promise<{ status: SaveResult }>;
  saveTextFile: (options: { filename: string; mimeType: string; text: string }) => Promise<{ status: SaveResult }>;
  beginStage: () => Promise<{ status: string }>;
  appendStage: (options: { chunk: string }) => Promise<{ status: string }>;
  saveStaged: (options: { filename: string; mimeType: string }) => Promise<{ status: SaveResult }>;
  pickPhone: () => Promise<{ status: "selected" | "empty" | "cancelled"; phone?: string }>;
  printHtml: (options: { title: string; html?: string; htmlPath?: string }) => Promise<{ status: "opened" }>;
  stagePrintHtml: () => Promise<{ path: string }>;
  restartApp: () => Promise<{ status: "restarting" }>;
};

const NativeTools = registerPlugin<NativeToolsPlugin>("NativeTools");

type SetupState = {
  done: boolean;
  step: 1 | 2;
  selectedBase: CurrencyCode;
  cashboxName: string;
  openingBalance: string;
  openingSide: BalanceSide;
  openingCurrency: CurrencyCode;
};

type AppSnapshot = {
  storageVersion: number;
  appVersion?: string;
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
const DB_VERSION = 2;
const META_STORE = "meta";
const PAYMENT_STORE = "paymentOperations";
const RECEIPT_STORE = "receiptOperations";
const META_STATE_KEY = "state";
const STORAGE_VERSION = 3;
const APP_DEVELOPER = "Professor";
const APP_LOGO_URL = "/app-logo.png";
const APP_VERSION = "1.0.0";
const APP_BUILD = "2026.07.28";

/* ==== حدود المساحة والحماية من امتلاء الذاكرة ==== */
const LOW_SPACE_LIMIT_BYTES = 200 * 1024 * 1024; // 200 ميجابايت
const BACKUP_REMINDER_DAYS = 7;
const LAST_BACKUP_KEY = "lastBackupAt";
const REMINDER_SNOOZE_KEY = "backupReminderSnoozedAt";

/* ==== ترقيم صفحات الطباعة (A4 = 277mm ارتفاع مفيد) ====
   الترويسة + العنوان ≈ 42mm، الرأس ≈ 8mm، الإجمالي ≈ 8mm، الرصيد ≈ 10mm
   ارتفاع الصف الواحد ≈ 8mm (سطر واحد) — تُحسب بدقة أدناه لمنع القص بين الصفحات */
const PRINT_PAGE_UNITS = 244; // السعة المفيدة بوحدات (1 وحدة ≈ 1mm) مع هامش أمان
const PRINT_HEADER_UNITS = 52; // ترويسة الشركة + عنوان التقرير
const PRINT_THEAD_UNITS = 11; // رأس الجدول (يتكرر بكل صفحة)
const PRINT_FOOT_UNITS = 12; // صف الإجمالي
const PRINT_TAIL_UNITS = 14; // سطر الرصيد
const PRINT_ROW_UNITS = 9.2; // ارتفاع الصف ذي السطر الواحد
const PRINT_ROW_EXTRA_LINE_UNITS = 5.4; // لكل سطر إضافي في خانة البيان
/* عدد الأحرف التي يتسع لها سطر واحد في عمود البيان.
   محسوب من العرض الفعلي: عمود 43% من 181mm ≈ 74mm ÷ عرض الحرف 1.79mm ≈ 42 حرفًا.
   القيمة السابقة (55) كانت مبالغًا فيها فتُقدَّر أسطر أقل من الواقع
   ويفيض المحتوى إلى صفحة إضافية شبه فارغة. */
const PRINT_STATEMENT_CHARS_PER_LINE = 38;

/* ==== حجم دفعة العرض في القوائم (منع البطء مع مئات الآلاف من السجلات) ==== */
const LIST_PAGE_SIZE = 60;

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
      { id: "system-company-info", label: "بيانات الشركة", action: "open-company" },
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
          { id: "report-cashboxes", label: "تقارير الصناديق", screen: "report-cashboxes" },
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

/* =========================================================================
   حماية الطباعة من حقن HTML (XSS)
   ========================================================================= */
function escapeHtml(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================================
   التشفير: AES-256-GCM عبر WebCrypto + PBKDF2 (600,000 دورة)
   يُستخدم لتشفير قاعدة البيانات والنسخ الاحتياطية
   ========================================================================= */
const CRYPTO_ITERATIONS = 600000;
const DEVICE_KEY_STORAGE = "proof-daftar-device-key";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  // دفعات صغيرة: تمرير آلاف الوسائط إلى fromCharCode يسبب انهيار المكدس على أندرويد
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j += 1) binary += String.fromCharCode(slice[j]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hasWebCrypto() {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: CRYPTO_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

type EncryptedPayload = { v: 1; alg: "AES-GCM-256"; kdf: "PBKDF2-SHA256"; it: number; salt: string; iv: string; data: string };

async function encryptWithPassphrase(plaintext: string, passphrase: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    v: 1,
    alg: "AES-GCM-256",
    kdf: "PBKDF2-SHA256",
    it: CRYPTO_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
}

async function decryptWithPassphrase(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const key = await deriveAesKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    base64ToBytes(payload.data) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  const candidate = value as EncryptedPayload | null;
  return !!candidate && candidate.v === 1 && candidate.alg === "AES-GCM-256" && typeof candidate.data === "string";
}

/* -- مفتاح الجهاز: يُولَّد مرة واحدة ويُحفظ في مساحة التطبيق الخاصة -- */
let deviceKeyCache: string | null = null;

function getDeviceKey(): string {
  if (deviceKeyCache) return deviceKeyCache;
  try {
    const existing = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (existing) {
      deviceKeyCache = existing;
      return existing;
    }
  } catch {
    /* التخزين غير متاح */
  }
  const generated = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  try {
    localStorage.setItem(DEVICE_KEY_STORAGE, generated);
  } catch {
    /* التخزين غير متاح */
  }
  deviceKeyCache = generated;
  return generated;
}

/* -- تشفير حقول السند الحساسة قبل الكتابة في القاعدة --
   ملاحظة أداء حاسمة: مفتاح قاعدة البيانات يُشتق مرة واحدة فقط ويُخزَّن في الذاكرة.
   (اشتقاق PBKDF2 لكل سجل كان يجعل فتح التطبيق بطيئًا جدًا مع كثرة السندات) -- */
const SENSITIVE_FIELDS = ["account", "statement", "reference", "imageUrl"] as const;

type StoredOperation = OperationItem & { __enc?: { iv: string; data: string } };

let dbCryptoKeyPromise: Promise<CryptoKey> | null = null;

function getDbCryptoKey(): Promise<CryptoKey> {
  if (!dbCryptoKeyPromise) {
    // المفتاح عشوائي 256-بت أصلًا، فيُستورد مباشرة بلا اشتقاق مكلف
    dbCryptoKeyPromise = crypto.subtle.importKey(
      "raw",
      base64ToBytes(getDeviceKey()).slice(0, 32) as BufferSource,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  return dbCryptoKeyPromise;
}

async function encryptOperationRecord(operation: OperationItem): Promise<StoredOperation> {
  if (!hasWebCrypto()) return operation;
  try {
    const secret: Record<string, unknown> = {};
    SENSITIVE_FIELDS.forEach((field) => {
      if (operation[field] !== undefined) secret[field] = operation[field];
    });
    const key = await getDbCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(JSON.stringify(secret)),
    );
    const shell: StoredOperation = {
      ...operation,
      __enc: { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) },
    };
    SENSITIVE_FIELDS.forEach((field) => {
      delete (shell as Record<string, unknown>)[field];
    });
    return shell;
  } catch {
    return operation;
  }
}

async function decryptOperationRecord(record: StoredOperation): Promise<OperationItem> {
  if (!record.__enc) return record as OperationItem;
  try {
    const key = await getDbCryptoKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.__enc.iv) as BufferSource },
      key,
      base64ToBytes(record.__enc.data) as BufferSource,
    );
    const secret = JSON.parse(new TextDecoder().decode(plain)) as Partial<OperationItem>;
    const restored = { ...record, ...secret } as StoredOperation;
    delete restored.__enc;
    return restored as OperationItem;
  } catch {
    const fallback = { ...record } as StoredOperation;
    delete fallback.__enc;
    return fallback as OperationItem;
  }
}

/* =========================================================================
   مراقبة مساحة التخزين — منع الحفظ عند امتلاء الذاكرة
   ========================================================================= */
type StorageStatus = { supported: boolean; usage: number; quota: number; available: number; low: boolean };

async function getStorageStatus(): Promise<StorageStatus> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      const available = Math.max(0, quota - usage);
      return { supported: true, usage, quota, available, low: quota > 0 && available < LOW_SPACE_LIMIT_BYTES };
    }
  } catch {
    /* غير مدعوم */
  }
  return { supported: false, usage: 0, quota: 0, available: Number.MAX_SAFE_INTEGER, low: false };
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} ميجابايت`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${bytes} بايت`;
}

/* -- تفعيل التخزين الدائم: يمنع تطبيقات التنظيف ونظام أندرويد من مسح البيانات -- */
async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    if (navigator.storage.persisted) {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

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

/* =========================================================================
   قفل تمرير الخلفية عند فتح أي نافذة منبثقة
   يمنع تحرك قائمة السندات خلف النافذة عند السحب داخلها
   ========================================================================= */
let scrollLockCount = 0;
let scrollLockOffset = 0;

function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    if (scrollLockCount === 0) {
      scrollLockOffset = window.scrollY || document.documentElement.scrollTop || 0;
      const body = document.body;
      body.style.position = "fixed";
      body.style.top = `-${scrollLockOffset}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
      body.style.overscrollBehavior = "none";
    }
    scrollLockCount += 1;

    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) {
        const body = document.body;
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        body.style.overflow = "";
        body.style.touchAction = "";
        body.style.overscrollBehavior = "";
        window.scrollTo(0, scrollLockOffset);
      }
    };
  }, [active]);
}

async function openLocalDb() {
  if (!hasIndexedDb()) {
    throw new Error("IndexedDB is not available");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);

      const ensureOperationStore = (storeName: string) => {
        const store = db.objectStoreNames.contains(storeName)
          ? tx?.objectStore(storeName)
          : db.createObjectStore(storeName, { keyPath: "id" });
        if (!store) return;
        // فهارس لضمان السرعة مع مئات الآلاف من العمليات
        if (!store.indexNames.contains("datetime")) store.createIndex("datetime", "datetime", { unique: false });
        if (!store.indexNames.contains("cashboxId")) store.createIndex("cashboxId", "cashboxId", { unique: false });
      };

      ensureOperationStore(PAYMENT_STORE);
      ensureOperationStore(RECEIPT_STORE);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("قاعدة البيانات مشغولة"));
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

/* قراءة العمليات مع فك التشفير — تعمل على دفعات لتفادي تجميد الواجهة */
async function getAllOperations(storeName: string): Promise<OperationItem[]> {
  const raw = await getAllStoreRecords<StoredOperation>(storeName);
  const output: OperationItem[] = [];
  const BATCH = 400;
  for (let i = 0; i < raw.length; i += BATCH) {
    const slice = raw.slice(i, i + BATCH);
    const decoded = await Promise.all(slice.map((record) => decryptOperationRecord(record)));
    output.push(...decoded);
    if (i + BATCH < raw.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return output;
}

/* كتابة سند واحد — تُرمى الأخطاء عمدًا ليتعامل معها المتصل (حماية من شبح البيانات) */
async function putOperationRecord(storeName: string, operation: OperationItem) {
  const encoded = await encryptOperationRecord(operation);
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.put(encoded));
  });
}

async function deleteOperationRecord(storeName: string, id: number) {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.delete(id));
  });
}

/* استبدال كامل — معاملة واحدة ذرّية: إما تنجح كلها أو تُلغى كلها */
async function replaceStoreRecords<T>(storeName: string, rows: T[]) {
  await withStore(storeName, "readwrite", async (store) => {
    await requestToPromise(store.clear());
    for (const row of rows) {
      store.put(row);
    }
  });
}

async function replaceOperationRecords(storeName: string, rows: OperationItem[]) {
  const encoded: StoredOperation[] = [];
  const BATCH = 400;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    encoded.push(...(await Promise.all(slice.map((row) => encryptOperationRecord(row)))));
    if (i + BATCH < rows.length) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await replaceStoreRecords(storeName, encoded);
}

async function saveSnapshotToIndexedDb(snapshot: AppSnapshot) {
  const { paymentOperations, receiptOperations, ...meta } = snapshot;
  await putStoreValue(META_STORE, META_STATE_KEY, meta);
  await replaceOperationRecords(PAYMENT_STORE, paymentOperations);
  await replaceOperationRecords(RECEIPT_STORE, receiptOperations);
}

/* تحويل خطأ التخزين إلى رسالة عربية واضحة */
function storageErrorMessage(error: unknown) {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return "⛔ لم يتم الحفظ: ذاكرة الهاتف ممتلئة. أفرغ مساحة أو خذ نسخة احتياطية ثم أعد المحاولة";
  }
  return "⛔ لم يتم الحفظ في قاعدة البيانات. لم تُسجَّل العملية، أعد المحاولة";
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

function compareByDateTimeAsc(a: OperationItem, b: OperationItem) {
  return a.datetime.localeCompare(b.datetime) || a.id - b.id;
}

function compareByDateTimeDesc(a: OperationItem, b: OperationItem) {
  return b.datetime.localeCompare(a.datetime) || b.id - a.id;
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatAmount(value: number, currency: CurrencyCode, maximumFractionDigits = 2) {
  return `${formatNumber(value, maximumFractionDigits)} ${currency}`;
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

function valueInRange(value: string, from: string, to: string, allValues: string[]) {
  if (!from || !to) return true;
  const a = allValues.indexOf(from);
  const b = allValues.indexOf(to);
  const n = allValues.indexOf(value);
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

function getOperationAmounts(operation: OperationItem) {
  return {
    accountAmount: operation.accountAmount ?? operation.amount,
    cashboxAmount: operation.cashboxAmount ?? operation.amount,
  };
}

function accountBalanceNature(balance: number) {
  if (balance > 0) return "عليه";
  if (balance < 0) return "له";
  return "";
}

function cashboxBalanceNature(balance: number) {
  if (balance > 0) return "عليه";
  if (balance < 0) return "له";
  return "";
}

function formatBalanceWithNature(balance: number, currency?: CurrencyCode, nature = "") {
  const parts = [formatNumber(Math.abs(balance))];
  if (currency) parts.push(currency);
  if (nature) parts.push(`(${nature})`);
  return parts.join(" ");
}

function operationMatchesCurrency(operation: OperationItem, currency: "all" | CurrencyCode) {
  if (currency === "all") return true;
  const meta = getOperationCurrencyMeta(operation);
  return operation.currency === currency || meta.accountCurrency === currency || meta.cashboxCurrency === currency;
}

/* =========================================================================
   ضغط الصور المرفقة — WebP عند التوفر (أخف بـ 25-35% من JPEG بنفس الوضوح)
   مع تصغير تدريجي للجودة حتى الوصول لحجم مستهدف يحافظ على وضوح المستند
   ========================================================================= */
const IMAGE_TARGET_BYTES = 35 * 1024; // الحجم المستهدف لكل مرفق
const IMAGE_MAX_BYTES = 60 * 1024; // الحد الأقصى المطلق
const IMAGE_MAX_WIDTH = 1000; // يكفي لقراءة نص مستند A4 مصوّر

function canvasSupportsWebp() {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    return probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function dataUrlBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return Math.floor((payload.length * 3) / 4);
}

async function compressImageFile(file: File, maxWidth = IMAGE_MAX_WIDTH, quality = 0.72): Promise<string> {
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

  const mimeType = canvasSupportsWebp() ? "image/webp" : "image/jpeg";

  const renderAt = (targetWidth: number, targetQuality: number) => {
    const scale = img.width > targetWidth ? targetWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL(mimeType, targetQuality);
  };

  let best = renderAt(maxWidth, quality);
  if (!best) return dataUrl;
  if (dataUrlBytes(best) <= IMAGE_TARGET_BYTES) return best;

  /* ضغط تدريجي مكثّف: نجرّب تركيبات (عرض × جودة) من الأعلى جودة للأقل
     ونتوقف عند أول نتيجة تحقق الحجم المستهدف — يضمن أفضل وضوح ممكن
     ضمن أصغر حجم. WebP يحافظ على قراءة النص حتى عند جودة منخفضة. */
  const attempts: Array<[number, number]> = [
    [1000, 0.58], [1000, 0.48], [1000, 0.40],
    [900, 0.44], [900, 0.36],
    [800, 0.40], [800, 0.32],
    [700, 0.36], [700, 0.30],
  ];

  for (const [stepWidth, stepQuality] of attempts) {
    const candidate = renderAt(stepWidth, stepQuality);
    if (!candidate) break;
    best = candidate;
    if (dataUrlBytes(candidate) <= IMAGE_TARGET_BYTES) return candidate;
  }

  // ملاذ أخير: 640px بأقل جودة مقبولة (يبقى نص المستند مقروءًا)
  if (dataUrlBytes(best) > IMAGE_MAX_BYTES) {
    const last = renderAt(640, 0.28);
    if (last) best = last;
  }

  return best;
}

function isAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const commaIndex = dataUrl.indexOf(",");
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("تعذر قراءة الملف"));
    reader.onabort = () => reject(new Error("تم إلغاء قراءة الملف"));
    reader.readAsDataURL(blob);
  });
}

async function saveBlobToDevice(
  blob: Blob,
  filename: string,
  description: string,
  accept: Record<string, string[]>,
): Promise<SaveResult> {
  if (isAndroidApp()) {
    const result = await NativeTools.saveBase64File({
      filename,
      mimeType: blob.type || "application/octet-stream",
      base64: await blobToBase64(blob),
    });
    return result.status;
  }

  const pickerWindow = window as Window & SaveFilePicker;

  if (pickerWindow.showSaveFilePicker) {
    try {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: filename, files: [file] });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

function saveResultMessage(result: SaveResult, subject: string) {
  if (result === "saved") return `تم حفظ ${subject} في المكان المختار`;
  if (result === "shared") return `تم فتح خيارات حفظ ${subject}`;
  if (result === "downloaded") return `تم تنزيل ${subject}`;
  return "تم إلغاء الحفظ";
}

async function downloadJsonFile(filename: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  if (isAndroidApp()) {
    const result = await NativeTools.saveTextFile({
      filename,
      mimeType: "application/json",
      text,
    });
    return result.status;
  }

  const blob = new Blob([text], { type: "application/json" });
  return saveBlobToDevice(blob, filename, "ملف نسخة احتياطية", { "application/json": [".json"] });
}

async function downloadImageToDevice(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const mimeType = blob.type || "image/jpeg";
  return saveBlobToDevice(blob, filename, "صورة سند", { [mimeType]: [".jpg", ".jpeg", ".png"] });
}

function buildHeaderHtml(settings: AppSettings) {
  return `
    <div class="head">
      <div class="head-col head-en">
        <h3>${escapeHtml(settings.companyEn)}</h3>
        <div>${escapeHtml(settings.reserve1)}</div>
        <div>${escapeHtml(settings.phone1)}</div>
      </div>
      <div class="head-center">
        ${
          settings.companyLogoUrl
            ? `<img src="${escapeHtml(settings.companyLogoUrl)}" alt="company-logo" />`
            : '<div class="logo-fallback">🏢</div>'
        }
      </div>
      <div class="head-col head-ar">
        <h3>${escapeHtml(settings.companyAr)}</h3>
        <div>${escapeHtml(settings.companyEn)}</div>
        <div>${escapeHtml(settings.phone2)}</div>
        <div>${escapeHtml(settings.reserve2)}</div>
      </div>
    </div>
  `;
}

/* =========================================================================
   محرك ترقيم صفحات الطباعة
   - يوزّع الصفوف على صفحات A4
   - الإجمالي (tfoot) يظهر في الصفحة الأخيرة فقط
   - عدّاد الصفحات (إجمالي/الحالية) أسفل كل صفحة
   ========================================================================= */
type PrintPageBlock = {
  titleHtml: string;
  colgroupHtml: string;
  theadHtml: string;
  leadingRowsHtml?: string;
  rowsHtml: string[];
  footerHtml?: string;
  tailHtml?: string;
};

/* فك ترميز كيانات HTML للحصول على الطول الحقيقي للنص */
function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/* يقدّر ارتفاع الصف حسب طول نص البيان (الأسطر المتعددة تأخذ مساحة أكبر).
   يُحاكي التفاف النص كلمةً كلمةً كما يفعل المتصفح، لأن القسمة المجرّدة
   على عدد الأحرف تُقلّل التقدير فتفيض الصفوف إلى صفحة إضافية. */
function estimateRowUnits(rowHtml: string) {
  const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => match[1]);

  let maxLines = 1;

  for (const rawCell of cells) {
    const isStatement = /statement-cell/.test(rawCell) || cells.indexOf(rawCell) >= 0;
    const brCount = (rawCell.match(/<br\s*\/?>/gi)?.length ?? 0);
    const text = decodeHtmlEntities(rawCell.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

    // عرض الخلايا الأخرى أضيق، لكن نصّها قصير عادةً
    const perLine = isStatement ? PRINT_STATEMENT_CHARS_PER_LINE : PRINT_STATEMENT_CHARS_PER_LINE;

    // محاكاة الالتفاف: كلمة أطول من السطر تُقسَّم، والكلمات تتراكم حتى امتلاء السطر
    let lines = 1;
    let used = 0;
    for (const word of text.split(" ")) {
      if (!word) continue;
      const wordLen = word.length;
      if (wordLen > perLine) {
        if (used > 0) lines += 1;
        lines += Math.ceil(wordLen / perLine) - 1;
        used = wordLen % perLine;
        continue;
      }
      const needed = used === 0 ? wordLen : wordLen + 1;
      if (used + needed > perLine) {
        lines += 1;
        used = wordLen;
      } else {
        used += needed;
      }
    }

    const explicitBreaks = (text.match(/\n/g)?.length ?? 0);
    const cellLines = lines + brCount + explicitBreaks;
    if (cellLines > maxLines) maxLines = cellLines;
  }

  return PRINT_ROW_UNITS + (maxLines - 1) * PRINT_ROW_EXTRA_LINE_UNITS;
}

/* توزيع الصفوف على صفحات بحيث لا يُقطع أي صف بين صفحتين إطلاقًا */
function chunkPrintRows(rows: string[], leadingUnits: number, footUnits: number, tailUnits: number) {
  if (rows.length === 0) return [[]] as string[][];

  const heights = rows.map(estimateRowUnits);
  const pages: string[][] = [];
  let current: string[] = [];
  let used = PRINT_HEADER_UNITS + PRINT_THEAD_UNITS + leadingUnits;

  for (let i = 0; i < rows.length; i += 1) {
    const rowHeight = heights[i];
    const isLastRow = i === rows.length - 1;
    // الصفحة الأخيرة يجب أن تتسع أيضًا لصف الإجمالي وسطر الرصيد
    const reserve = isLastRow ? footUnits + tailUnits : 0;

    if (current.length > 0 && used + rowHeight + reserve > PRINT_PAGE_UNITS) {
      pages.push(current);
      current = [];
      used = PRINT_HEADER_UNITS + PRINT_THEAD_UNITS;
    }

    current.push(rows[i]);
    used += rowHeight;
  }

  if (current.length > 0) pages.push(current);
  if (pages.length === 0) return [[]];

  /* موازنة الصفحة الأخيرة: إذا بقيت شبه فارغة ننقل إليها صفوفًا من السابقة
     تدريجيًا، مع التأكد أن الصفحة السابقة تبقى ضمن حدود الورقة. */
  const pageUnits = (rowsOfPage: string[], isLast: boolean, withLeading: boolean) =>
    PRINT_HEADER_UNITS
    + PRINT_THEAD_UNITS
    + (withLeading ? leadingUnits : 0)
    + (isLast ? footUnits + tailUnits : 0)
    + rowsOfPage.reduce((sum, row) => sum + estimateRowUnits(row), 0);

  if (pages.length >= 2) {
    const lastIndex = pages.length - 1;
    const prevIndex = lastIndex - 1;

    // ننقل صفًا واحدًا في كل دورة طالما الصفحة الأخيرة ناقصة والسابقة تتحمّل
    for (let guard = 0; guard < 40; guard += 1) {
      const last = pages[lastIndex];
      const prev = pages[prevIndex];
      if (prev.length <= 1) break;

      const lastUnits = pageUnits(last, true, prevIndex === 0 && pages.length === 2 ? false : false);
      if (lastUnits >= PRINT_PAGE_UNITS * 0.62) break;

      const candidate = prev[prev.length - 1];
      const candidateUnits = estimateRowUnits(candidate);
      if (lastUnits + candidateUnits > PRINT_PAGE_UNITS) break;

      prev.pop();
      last.unshift(candidate);
    }
  }

  return pages;
}

/* يبني صفحات كل التقارير ثم يرقّمها ترقيمًا متسلسلًا عبر التقرير كله */
function buildPaginatedReport(blocks: PrintPageBlock[], settings: AppSettings) {
  const rendered: string[] = [];

  blocks.forEach((block) => {
    const leadingUnits = block.leadingRowsHtml ? estimateRowUnits(block.leadingRowsHtml) : 0;
    const footUnits = block.footerHtml ? PRINT_FOOT_UNITS : 0;
    const tailUnits = block.tailHtml ? PRINT_TAIL_UNITS : 0;
    const chunks = chunkPrintRows(block.rowsHtml, leadingUnits, footUnits, tailUnits);

    chunks.forEach((chunk, chunkIndex) => {
      const isLastChunk = chunkIndex === chunks.length - 1;
      const leading = chunkIndex === 0 && block.leadingRowsHtml ? block.leadingRowsHtml : "";
      // الإجمالي في الصفحة الأخيرة من هذه المجموعة فقط
      const foot = isLastChunk && block.footerHtml ? `<tfoot>${block.footerHtml}</tfoot>` : "";
      const tail = isLastChunk && block.tailHtml ? block.tailHtml : "";
      rendered.push(`
        ${buildHeaderHtml(settings)}
        ${block.titleHtml}
        <table>
          ${block.colgroupHtml}
          ${block.theadHtml}
          <tbody>${leading}${chunk.join("")}</tbody>
          ${foot}
        </table>
        ${tail}
      `);
    });
  });

  return paginateStaticPages(rendered);
}

/* ترقيم صفحات مبنية مسبقًا (مثل السندات المفردة) */
function paginateStaticPages(innerPages: string[]) {
  const total = innerPages.length || 1;
  return innerPages
    .map((inner, index) => {
      const counter = `<div class="page-counter">${total}/${index + 1}</div>`;
      return `<div class="page">${inner}${counter}</div>${index < innerPages.length - 1 ? '<div class="page-break"></div>' : ""}`;
    })
    .join("");
}

async function renderPrintWindow(title: string, html: string) {
  setPrintProgress(true, "جارٍ تجهيز التقرير...");
  // إفساح المجال للمتصفح كي يرسم المؤشر قبل العمل الثقيل
  await new Promise((resolve) => setTimeout(resolve, 50));

  const documentHtml = `
    <html lang="ar" dir="rtl">
      <head>
        <title>${title}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #111; }
          body { font-family: Tahoma, Arial, sans-serif; width: 100%; max-width: 190mm; margin: 0 auto; }
          /* الصفحة: بلا ارتفاع ثابت (محرك طباعة أندرويد يقصّه ويُخرج ورقة فارغة).
             عدد الصفوف محسوب مسبقًا ليملأ A4 تمامًا، والفاصل يُفرض بـ page-break-after. */
          /* بلا min-height: الارتفاع الثابت يتعارض مع محرك طباعة أندرويد
             في المستندات متعددة الصفحات فيُخرج صفحات فارغة.
             عدد الصفوف محسوب مسبقًا في JS ليملأ الورقة، والفاصل يُفرض بـ page-break-after. */
          .page { position: relative; box-sizing: border-box; width: 100%; max-width: 190mm; border: 2px solid #101010; padding: 4mm 4mm 9mm 4mm; margin: 0 auto; overflow: visible; page-break-inside: avoid; break-inside: avoid; page-break-after: always; break-after: page; }
          .page:last-of-type { page-break-after: auto; break-after: auto; }
          .page-counter { position: absolute; bottom: 2.5mm; right: 4mm; font-size: 9px; color: #334155; direction: ltr; letter-spacing: 0.5px; }
          .head { direction:ltr; display:flex; align-items: center; justify-content: space-between; border:2px solid #151515; padding:8px; }
          .head-col { width: 40%; font-size: 12px; line-height: 1.6; color:#111; }
          .head-en { text-align: left; direction:ltr; }
          .head-ar { text-align: right; direction:rtl; }
          .head-col h3 { margin:0; color:#d62828; font-size: 24px; }
          .head-center { width: 20%; text-align:center; }
          .head-center img { max-width: 120px; max-height: 70px; object-fit: contain; }
          .voucher-title { margin-top: 8px; display:flex; justify-content: space-between; align-items:center; }
          .voucher-box { border:1px solid #111; border-radius:8px; padding:6px 14px; font-size: 24px; font-weight:700; }
          .meta { font-size: 17px; font-weight: 700; }
          .line { border:1px solid #222; border-radius: 8px; padding: 7px; margin-top:8px; font-size: 17px; }
          .amount-grid { margin-top:8px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
          .amount-box { border:1px solid #222; border-radius:8px; padding:8px; font-size:16px; min-height:48px; }
          table { width:100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
          th, td { border: 2px solid #111; padding: 5px 6px; text-align: center; vertical-align: middle; font-size: 13px; word-break: normal; overflow-wrap: break-word; }
          td.compact-cell, th.compact-cell { white-space: nowrap; vertical-align: middle; }
          td.statement-cell, th.statement-cell { text-align: right; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
          small { font-size: 11px; color: #334155; }
          th { background: #f3f5ff; color: #d62828; }
          tfoot td { background: #f1f5f9; font-weight: 700; }
          .img-wrap { margin-top: 12px; border-top: 1px dashed #777; padding-top: 10px; }
          .img-wrap img { max-width: 100%; max-height: 320px; border:1px solid #888; }
          .page-break { display: none; }
          tr, td, th { page-break-inside: avoid; break-inside: avoid; }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          @media screen { body { padding: 12px; } .page { margin-bottom: 10px; } }
          @media print {
            html, body { width: auto; height: auto; min-height: 0; margin: 0; padding: 0; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { margin: 0; border-width: 1.5px; }
            .page:last-of-type { page-break-after: auto; break-after: auto; }
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;

  if (isAndroidApp()) {
    try {
      /* التقارير الكبيرة (صور مضمّنة + عشرات الصفحات) قد تتجاوز حد جسر Capacitor.
         نكتبها على دفعات في ملف مؤقت ثم نمرّر مساره فقط. */
      // حد منخفض عمدًا: تمرير HTML كبير كسلسلة نصية يُقتطع بصمت
      // في WebView فتخرج ورقة فارغة. فوق هذا الحد نستخدم ملفًا حقيقيًا.
      const PRINT_BRIDGE_LIMIT = 120_000;
      if (documentHtml.length > PRINT_BRIDGE_LIMIT) {
        const CHUNK = 512 * 1024;
        const totalChunks = Math.ceil(documentHtml.length / CHUNK);
        await NativeTools.beginStage();
        for (let i = 0; i < documentHtml.length; i += CHUNK) {
          const step = Math.floor(i / CHUNK) + 1;
          setPrintProgress(true, `تحضير بيانات التقرير (${step} من ${totalChunks})`);
          await NativeTools.appendStage({ chunk: documentHtml.slice(i, i + CHUNK) });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const staged = await NativeTools.stagePrintHtml();
        setPrintProgress(true, "جارٍ تنسيق الصفحات وفتح الطابعة...");
        await NativeTools.printHtml({ title, htmlPath: staged.path });
        setPrintProgress(false);
        return true;
      }

      setPrintProgress(true, "جارٍ فتح نافذة الطابعة...");
      await NativeTools.printHtml({ title, html: documentHtml });
      setPrintProgress(false);
      return true;
    } catch {
      // خطة بديلة: إن فشلت الطباعة الأصلية نستخدم محرك الطباعة داخل الويب
      try {
        setPrintProgress(true, "جارٍ المحاولة بطريقة بديلة...");
        const ok = await printViaIframe(documentHtml);
        setPrintProgress(false);
        return ok;
      } catch {
        setPrintProgress(false);
        return false;
      }
    }
  }

  const ok = printViaIframe(documentHtml);
  setPrintProgress(false);
  return ok;
}

/** طباعة عبر إطار مخفي — تُستخدم على الويب وكخطة بديلة على أندرويد. */
function printViaIframe(documentHtml: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "0";
  frame.style.top = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
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

function buildVoucherInnerHtml({
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
  const currencyLabel = CURRENCY_NAMES[cashboxCurrency] ?? cashboxCurrency;
  const { accountAmount, cashboxAmount } = getOperationAmounts(operation);
  const amountWords = `${numberToArabicWords(cashboxAmount)} ${currencyLabel}`;
  const exchangeDisplay = accountCurrency !== cashboxCurrency ? accountRate ?? cashboxRate : undefined;
  const cashboxRateHtml = exchangeDisplay ? `<br/><small>سعر الصرف: ${formatNumber(exchangeDisplay)}</small>` : "";
  const holderText = operation.type === "صرف" ? "بيد الاخوه/الاخ/" : "استلمنا من الاخوه/الاخ/";
  const voucherLabel = operation.type === "صرف" ? settings.paymentVoucherLabel : settings.receiptVoucherLabel;

  const inner = `
      ${buildHeaderHtml(settings)}

      <div class="voucher-title">
        <div class="meta">رقم السند: ${escapeHtml(operation.id)}</div>
        <div class="voucher-box">${escapeHtml(voucherLabel)}</div>
        <div class="meta">التاريخ: ${escapeHtml(parseDateOnly(operation.datetime))}</div>
      </div>

      <div class="line">${escapeHtml(holderText)} ${escapeHtml(operation.account)}</div>

      <div class="amount-grid">
        <div class="amount-box">مبلغ وقدره (كتابة): ${escapeHtml(amountWords)}</div>
        <div class="amount-box">المبلغ (رقماً): ${escapeHtml(formatAmount(cashboxAmount, cashboxCurrency))}</div>
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
            <th class="compact-cell">رقم الحساب</th>
            <th>اسم الحساب</th>
            <th class="compact-cell">رقم الصندوق</th>
            <th>البيان</th>
            <th>المبلغ / العملة</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="compact-cell">${escapeHtml(accountCode)}</td>
            <td>${escapeHtml(operation.account)}</td>
            <td class="compact-cell">${escapeHtml(cashboxCode)}${cashboxRateHtml}</td>
            <td class="statement-cell">${escapeHtml(operation.statement ?? "—")}</td>
            <td>${escapeHtml(formatAmount(accountAmount, accountCurrency))}</td>
          </tr>
        </tbody>
      </table>

      ${includeAttachment && operation.imageUrl ? `<div class="img-wrap"><img src="${escapeHtml(operation.imageUrl)}" alt="attachment" /></div>` : ""}
  `;

  return inner;
}

function buildVoucherHtml(args: {
  operation: OperationItem;
  settings: AppSettings;
  accountCode: string;
  cashboxCode: string;
  includeAttachment: boolean;
}) {
  return paginateStaticPages([buildVoucherInnerHtml(args)]);
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
                <select
                  value={setup.openingCurrency}
                  onChange={(e) => onChange({ ...setup, openingCurrency: e.target.value as CurrencyCode })}
                  className={`rounded-xl border px-3 py-2 ${
                    isDark
                      ? "border-slate-600 bg-slate-800 text-slate-100"
                      : "border-slate-300 bg-white text-slate-900"
                  }`}
                >
                  {[setup.selectedBase, ...BASE_CURRENCY_CHOICES.filter((code) => code !== setup.selectedBase)].map((code) => (
                    <option key={`setup-open-${code}`} value={code}>{code}</option>
                  ))}
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
  useBodyScrollLock(true);
  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-slate-950/70 p-3 sm:p-4"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div
        className={`mx-auto my-4 max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border p-4 sm:p-5 ${
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

/* =========================================================================
   مؤشر "جارٍ التجهيز للطباعة"
   ناشر بسيط يسمح لدوال الطباعة (خارج شجرة React) بتحديث الواجهة
   ========================================================================= */
type PrintProgress = { active: boolean; message: string };
let printProgressListener: ((state: PrintProgress) => void) | null = null;

function setPrintProgress(active: boolean, message = "") {
  printProgressListener?.({ active, message });
}

function PrintOverlay() {
  const [state, setState] = useState<PrintProgress>({ active: false, message: "" });

  useEffect(() => {
    printProgressListener = setState;
    return () => {
      printProgressListener = null;
    };
  }, []);

  // حارس أمان: لا يبقى المؤشر عالقًا إن حدث خطأ غير متوقع
  useEffect(() => {
    if (!state.active) return;
    const timer = window.setTimeout(() => setState({ active: false, message: "" }), 45000);
    return () => window.clearTimeout(timer);
  }, [state.active, state.message]);

  if (!state.active) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-6">
      <div className="w-full max-w-xs rounded-3xl border-2 border-cyan-500/60 bg-slate-900 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 size-12 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
        <p className="text-lg font-bold text-cyan-300">جارٍ التجهيز للطباعة</p>
        <p className="mt-2 text-sm text-slate-300">{state.message}</p>
        <p className="mt-3 text-xs text-slate-500">قد يستغرق بضع ثوانٍ حسب حجم التقرير</p>
      </div>
    </div>
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

function AccountPickerField({
  value,
  onChange,
  accounts,
  placeholder,
  inputClass,
  isDark,
  allowAll,
  allLabel = "كل الحسابات",
}: {
  value: string;
  onChange: (value: string) => void;
  accounts: AccountRecord[];
  placeholder: string;
  inputClass: string;
  isDark: boolean;
  allowAll?: boolean;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLabel = value === "all" ? allLabel : value || placeholder;
  const filtered = accounts.filter((account) =>
    !query.trim() || [account.name, account.accountCode, account.phone].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${inputClass} text-right`}>
        {selectedLabel}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/80 p-3">
          <div className={`mx-auto my-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-hidden rounded-2xl border ${isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}>
            <div className={`sticky top-0 z-10 space-y-2 border-b p-3 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold">{placeholder}</h4>
                <button type="button" onClick={() => setOpen(false)} className={`rounded-lg border px-3 py-1 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إغلاق</button>
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث باسم الحساب أو الرقم أو الهاتف" className={`${inputClass} w-full`} autoFocus />
            </div>
            <div className="max-h-[65vh] overflow-y-auto p-2">
              {allowAll ? (
                <button type="button" onClick={() => choose("all")} className={`w-full rounded-xl px-3 py-3 text-right text-sm font-semibold ${isDark ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}>
                  {allLabel}
                </button>
              ) : null}
              {filtered.map((account) => (
                <button
                  key={`account-picker-${placeholder}-${account.id}`}
                  type="button"
                  onClick={() => choose(account.name)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-right text-sm ${value === account.name ? isDark ? "bg-cyan-500/20 text-cyan-200" : "bg-cyan-100 text-cyan-900" : isDark ? "hover:bg-slate-800" : "hover:bg-slate-50"}`}
                >
                  <span className="font-semibold">{account.name}</span>
                  <span className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>{account.accountCode}</span>
                </button>
              ))}
              {filtered.length === 0 ? (
                <div className={isDark ? "px-3 py-6 text-center text-sm text-slate-400" : "px-3 py-6 text-center text-sm text-slate-500"}>لا توجد حسابات مطابقة</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
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
      className={`flex min-h-[72vh] flex-col rounded-3xl border p-6 ${
        isDark
          ? "border-slate-700/70 bg-[radial-gradient(circle_at_20%_15%,#0ea5e955,transparent_35%),radial-gradient(circle_at_80%_80%,#7c3aed55,transparent_32%),linear-gradient(135deg,#0f172a,#020617)]"
          : "border-slate-300 bg-[radial-gradient(circle_at_20%_15%,#93c5fd66,transparent_35%),radial-gradient(circle_at_80%_80%,#c4b5fd66,transparent_32%),linear-gradient(135deg,#f8fafc,#e2e8f0)]"
      }`}
    >
      <div className="my-auto grid w-full gap-5">
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

      <div className={`mt-auto pt-6 text-center text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
        <p>طور بحب من قبل</p>
        <div className="mt-1 inline-flex items-center justify-center gap-2">
          <a
            href="https://www.facebook.com/ProfessorGold11/"
            target="_blank"
            rel="noreferrer"
            aria-label="فيسبوك"
            className="grid size-5 place-items-center rounded-full transition hover:opacity-80"
          >
            {/* شعار فيسبوك الرسمي */}
            <img src="/brand/facebook.svg" alt="Facebook" width={20} height={20} className="size-5" />
          </a>
          <a
            href="https://t.me/professorgold11"
            target="_blank"
            rel="noreferrer"
            aria-label="تيليجرام"
            className="grid size-5 place-items-center rounded-full transition hover:opacity-80"
          >
            {/* شعار تيليجرام الرسمي */}
            <img src="/brand/telegram.svg" alt="Telegram" width={20} height={20} className="size-5" />
          </a>
          <a
            href="https://www.facebook.com/ProfessorGold11/"
            target="_blank"
            rel="noreferrer"
            className={`rounded-full px-2 py-0.5 font-semibold transition ${
              isDark ? "hover:bg-slate-800 hover:text-cyan-200" : "hover:bg-slate-100 hover:text-blue-700"
            }`}
          >
            professorgold11
          </a>
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(7rem,0.55fr)] gap-2 md:max-w-xl">
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
      </div>
      <div className="flex justify-end">
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
  return (
    <SimpleScreen title="إضافة/تعديل الصناديق" onBack={onBack} isDark={isDark}>
      <div className="flex justify-end">
        <button onClick={onOpenAdd} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">
          + إضافة صندوق
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {cashboxes.map((box) => (
          <article
            key={box.id}
            className={`rounded-xl border p-3 text-sm ${
              isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">
                {box.name} ({box.code})
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
  onCreate: (operation: Omit<OperationItem, "id">) => Promise<boolean> | boolean | void;
  onUpdate: (id: number, operation: Omit<OperationItem, "id">) => Promise<boolean> | boolean | void;
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
  const [accountFilter, setAccountFilter] = useState("all");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OperationItem | null>(null);
  const [savingForm, setSavingForm] = useState(false);

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

  const rateToBaseForForm = (code: CurrencyCode, currentForm = form) => {
    if (code === baseCurrency) return 1;
    const rate =
      code === currentForm.accountCurrency
        ? currentForm.accountExchangeRate
        : code === currentForm.cashboxCurrency
          ? currentForm.cashboxExchangeRate
          : defaultRate(code);
    const parsed = Number(rate);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

  const formAccountOptions = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    return accounts
      .filter((account) => !q || [account.name, account.accountCode, account.phone].join(" ").toLowerCase().includes(q))
      .slice(0, 24);
  }, [accounts, accountSearch]);

  const formAmounts = useMemo(() => {
    const enteredAmount = Number(form.amount);
    const accountRate = rateToBaseForForm(form.accountCurrency);
    const cashboxRate = rateToBaseForForm(form.cashboxCurrency);

    if (!Number.isFinite(enteredAmount) || enteredAmount <= 0 || !accountRate || !cashboxRate) {
      return { accountAmount: 0, cashboxAmount: 0, equivalentAmount: 0 };
    }

    if (type === "صرف") {
      const cashboxAmount = enteredAmount;
      const accountAmount = (cashboxAmount * cashboxRate) / accountRate;
      return { accountAmount, cashboxAmount, equivalentAmount: accountAmount };
    }

    const accountAmount = enteredAmount;
    const cashboxAmount = (accountAmount * accountRate) / cashboxRate;
    return { accountAmount, cashboxAmount, equivalentAmount: cashboxAmount };
  }, [
    form.amount,
    form.accountCurrency,
    form.cashboxCurrency,
    form.accountExchangeRate,
    form.cashboxExchangeRate,
    type,
    baseCurrency,
    currencies,
  ]);

  const amountInputCurrency = type === "صرف" ? form.cashboxCurrency : form.accountCurrency;
  const equivalentCurrency = type === "صرف" ? form.accountCurrency : form.cashboxCurrency;
  const showEquivalent = form.accountCurrency !== form.cashboxCurrency;
  const voucherNumberPreview = editingId ?? Math.max(0, ...operations.map((operation) => operation.id)) + 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return operations
      .filter((item) => {
        const matchesQuery = !q || String(item.id).includes(q);
        const dateOnly = parseDateOnly(item.datetime);
        const matchesDate = (!fromDate || dateOnly >= fromDate) && (!toDate || dateOnly <= toDate);
        const matchesAccount = accountFilter === "all" || item.account === accountFilter;
        return matchesQuery && matchesDate && matchesAccount;
      })
      .sort((a, b) => (sortOrder === "newest" ? compareByDateTimeDesc(a, b) : compareByDateTimeAsc(a, b)));
  }, [operations, search, fromDate, toDate, accountFilter, sortOrder]);

  /* عرض تدريجي (Windowing): يمنع البطء والتهنيج مع مئات الآلاف من السندات */
  const filterSignature = `${search}|${fromDate}|${toDate}|${accountFilter}|${sortOrder}|${operations.length}`;
  const [listWindow, setListWindow] = useState({ signature: filterSignature, count: LIST_PAGE_SIZE });
  // إعادة الضبط أثناء العرض عند تغيّر الفلاتر (نمط React الرسمي: derived state)
  const visibleCount = listWindow.signature === filterSignature ? listWindow.count : LIST_PAGE_SIZE;
  if (listWindow.signature !== filterSignature) {
    setListWindow({ signature: filterSignature, count: LIST_PAGE_SIZE });
  }
  const showMore = () => setListWindow({ signature: filterSignature, count: visibleCount + LIST_PAGE_SIZE });
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

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
    setAccountSearch("");
    setAccountPickerOpen(false);
    setOpenForm(true);
  };

  const openEdit = (op: OperationItem) => {
    const meta = currencyMeta(op);
    const amounts = getOperationAmounts(op);
    setEditingId(op.id);
    setForm({
      account: op.account,
      cashboxId: op.cashboxId,
      amount: String(type === "صرف" ? amounts.cashboxAmount : amounts.accountAmount),
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
    setAccountSearch(op.account);
    setAccountPickerOpen(false);
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

  const selectAccountForForm = (accountName: string) => {
    setAccountSearch(accountName);
    setAccountPickerOpen(false);
    refreshBySelection(accountName, form.cashboxId);
  };

  const closeAccountPicker = () => {
    setAccountSearch("");
    setAccountPickerOpen(false);
  };

  const saveForm = async () => {
    if (savingForm) return;
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
    if (showEquivalent && (!formAmounts.accountAmount || !formAmounts.cashboxAmount)) {
      onToast("يرجى التأكد من المبلغ وسعر الصرف", "error");
      return;
    }

    const accountAmount = showEquivalent ? formAmounts.accountAmount : Number(form.amount);
    const cashboxAmount = showEquivalent ? formAmounts.cashboxAmount : Number(form.amount);

    const payload: Omit<OperationItem, "id"> = {
      type,
      account: form.account,
      cashboxId: form.cashboxId,
      amount: accountAmount,
      accountAmount,
      cashboxAmount,
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

    // لا يُغلق النموذج ولا تُمسح البيانات إلا بعد نجاح الحفظ الفعلي
    setSavingForm(true);
    try {
      const ok = editingId ? await onUpdate(editingId, payload) : await onCreate(payload);
      if (ok === false) return; // فشل الحفظ: يبقى النموذج مفتوحًا بالبيانات
      setOpenForm(false);
      setEditingId(null);
    } finally {
      setSavingForm(false);
    }
  };

  const onImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const originalKb = file.size / 1024;
      const compressed = await compressImageFile(file);
      const finalKb = dataUrlBytes(compressed) / 1024;
      setForm((f) => ({ ...f, imageUrl: compressed }));

      const show = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} ميجا` : `${kb.toFixed(0)} كيلو`);
      const saved = originalKb > 0 ? Math.max(0, Math.round(100 - (finalKb * 100) / originalKb)) : 0;
      onToast(`تم إرفاق الصورة: ${show(originalKb)} ← ${show(finalKb)} (توفير ${saved}%)`, "success");
    } catch {
      onToast("تعذر معالجة الصورة، جرّب صورة أخرى", "error");
    }
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

  // قفل تمرير الخلفية عند فتح نافذة السند أو نافذة تأكيد الحذف
  useBodyScrollLock(openForm || deleteTarget !== null);

  const inputClass = isDark
    ? "min-w-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    : "min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  const rateInputClass = isDark
    ? "min-w-0 rounded-xl border-2 border-blue-400 bg-slate-800 px-3 py-2 text-sm text-slate-100 shadow-[0_0_0_1px_rgba(96,165,250,0.25)]"
    : "min-w-0 rounded-xl border-2 border-blue-500 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_0_0_1px_rgba(37,99,235,0.15)]";

  return (
    <section
      className={`relative overflow-x-hidden space-y-4 rounded-3xl border p-4 sm:p-6 ${
        isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{voucherLabel}</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <input value={search} onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))} placeholder="بحث برقم السند" className={inputClass} />
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className={inputClass}><option value="newest">الفرز: الأحدث</option><option value="oldest">الفرز: الأقدم</option></select>
        <AccountPickerField value={accountFilter} onChange={setAccountFilter} accounts={accounts} placeholder="اختر حساب" inputClass={inputClass} isDark={isDark} allowAll />
      </div>

      <div className="flex justify-end">
        <button onClick={openCreate} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950 shadow-lg">+ إضافة سند</button>
      </div>

      <div className="space-y-3">
        {visibleRows.map((item) => {
          const box = cashboxById.get(item.cashboxId);
          const meta = currencyMeta(item);
          const { accountAmount } = getOperationAmounts(item);
          const exchangeDisplay = meta.accountCurrency !== meta.cashboxCurrency ? meta.accountRate ?? meta.cashboxRate : undefined;
          return (
            <article
              key={`${type}-${item.id}`}
              className={`rounded-2xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.id} - {item.account}</p>
                  <p className={`whitespace-pre-wrap break-words text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>{item.statement || "—"}</p>
                  <p className={`whitespace-pre-wrap break-words text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {formatDateTimeNoSeconds(item.datetime)} | صندوق: {box?.code ?? item.cashboxId}
                    {item.reference ? ` | مرجع: ${item.reference}` : ""}
                    {exchangeDisplay ? ` | سعر الصرف: ${formatNumber(exchangeDisplay)}` : ""}
                  </p>
                </div>

                <div className="relative z-20 shrink-0">
                  <button
                    onClick={() => setActiveMenuId((id) => (id === item.id ? null : item.id))}
                    className={`rounded-lg border px-2 py-1 text-sm ${
                      isDark ? "border-slate-600 bg-slate-700 text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    ☰
                  </button>
                  {activeMenuId === item.id ? (
                    <div className={`absolute left-0 z-30 mt-1 w-44 max-w-[calc(100vw-2rem)] space-y-1 rounded-xl border p-2 shadow-xl ${isDark ? "border-slate-600 bg-slate-900" : "border-slate-300 bg-white"}`}>
                      <button onClick={() => { openEdit(item); setActiveMenuId(null); }} className={`w-full rounded-lg px-2 py-1.5 text-right text-xs ${isDark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-800"}`}>تعديل</button>
                      <button onClick={() => { onNotify(item); setActiveMenuId(null); }} className="w-full rounded-lg bg-violet-500/30 px-2 py-1.5 text-right text-xs text-violet-100">إرسال إشعار</button>
                      <button onClick={() => { onPrint(item); setActiveMenuId(null); }} className="w-full rounded-lg bg-cyan-500/30 px-2 py-1.5 text-right text-xs text-cyan-100">طباعة PDF</button>
                      <button onClick={() => { setDeleteTarget(item); setActiveMenuId(null); }} className="w-full rounded-lg bg-rose-500/30 px-2 py-1.5 text-right text-xs text-rose-100">حذف</button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold text-cyan-300">
                <span>{formatAmount(accountAmount, meta.accountCurrency)}</span>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length > visibleCount ? (
        <div className="flex flex-col items-center gap-2">
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            عرض {formatNumber(visibleCount, 0)} من {formatNumber(filtered.length, 0)} سند
          </p>
          <button
            onClick={showMore}
            className={`rounded-xl border px-4 py-2 text-sm font-bold ${isDark ? "border-slate-600 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}
          >
            عرض المزيد
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? <p className={`rounded-xl border border-dashed p-4 text-center text-sm ${isDark ? "border-slate-600 bg-slate-800/60 text-slate-400" : "border-slate-300 bg-slate-50 text-slate-500"}`}>لا توجد نتائج.</p> : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${isDark ? "border-rose-500/50 bg-slate-900 text-slate-100" : "border-rose-300 bg-white text-slate-900"}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl">⚠️</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-rose-400">تأكيد الحذف</h3>
                <p className="mt-2 text-sm">هل أنت متأكد من حذف هذا السند؟</p>
                <div className={`mt-3 space-y-1 rounded-xl border p-3 text-xs ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}>
                  <p><span className="opacity-70">رقم السند:</span> <span className="font-bold">{deleteTarget.id}</span></p>
                  <p className="break-words"><span className="opacity-70">الحساب:</span> <span className="font-bold">{deleteTarget.account}</span></p>
                  <p><span className="opacity-70">المبلغ:</span> <span className="font-bold">{formatAmount(getOperationAmounts(deleteTarget).accountAmount, currencyMeta(deleteTarget).accountCurrency)}</span></p>
                  <p><span className="opacity-70">التاريخ:</span> {formatDateTimeNoSeconds(deleteTarget.datetime)}</p>
                  {deleteTarget.statement ? <p className="break-words"><span className="opacity-70">البيان:</span> {deleteTarget.statement}</p> : null}
                </div>
                <p className="mt-3 text-xs text-rose-400">لا يمكن التراجع عن هذه العملية.</p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => { const id = deleteTarget.id; setDeleteTarget(null); onDelete(id); }}
                className="flex-1 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                نعم، احذف السند
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold ${isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-700"}`}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openForm ? (
        <div
          className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-slate-950/70 p-3 sm:p-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className={`mx-auto my-4 max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto overflow-x-hidden rounded-2xl border p-3 sm:p-5 ${isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}>
            <h3 className="text-lg font-bold">{editingId ? `تعديل ${voucherLabel}` : `إضافة ${voucherLabel} جديد`}</h3>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(96px,1fr)] gap-2 md:col-span-2">
                <input
                  type="datetime-local"
                  value={form.datetimeInput}
                  onChange={(e) => setForm((f) => ({ ...f, datetimeInput: e.target.value }))}
                  className={`${inputClass} w-full min-w-0 max-w-[190px] self-start px-1.5 py-1.5 text-[11px] leading-tight`}
                />
                <div className="grid gap-2">
                  <input value={voucherNumberPreview} readOnly tabIndex={-1} aria-label="رقم السند" onFocus={(e) => e.currentTarget.blur()} className={`${inputClass} select-none cursor-default text-center opacity-80`} />
                  <input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="المرجع" className={inputClass} />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountSearch("");
                      setAccountPickerOpen((open) => !open);
                    }}
                    className={`${inputClass} text-right`}
                  >
                    {form.account || "اختر حساب"}
                  </button>
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
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={form.cashboxId} onChange={(e) => refreshBySelection(form.account, Number(e.target.value))} className={inputClass}>
                  <option value={0}>اختر صندوق</option>
                  {cashboxes.map((c) => <option key={`box-${c.id}`} value={c.id}>{c.code} - {c.name}</option>)}
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
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder={`المبلغ بعملة ${type === "صرف" ? "الصندوق" : "الحساب"} ${amountInputCurrency}`}
                className={inputClass}
              />

              {form.accountCurrency !== baseCurrency || form.cashboxCurrency !== baseCurrency || showEquivalent ? (
                <div className="grid gap-2 md:col-span-2 md:grid-cols-2">
                {form.accountCurrency !== baseCurrency ? (
                  <input type="number" value={form.accountExchangeRate} onChange={(e) => setForm((f) => ({ ...f, accountExchangeRate: e.target.value, exchangeRate: e.target.value }))} placeholder={`سعر صرف عملة الحساب ${form.accountCurrency}`} className={rateInputClass} />
                ) : null}

                {form.cashboxCurrency !== baseCurrency ? (
                  <input type="number" value={form.cashboxExchangeRate} onChange={(e) => setForm((f) => ({ ...f, cashboxExchangeRate: e.target.value }))} placeholder={`سعر صرف عملة الصندوق ${form.cashboxCurrency}`} className={rateInputClass} />
                ) : null}

                {showEquivalent ? (
                  <input
                    value={form.amount && formAmounts.equivalentAmount ? formatAmount(formAmounts.equivalentAmount, equivalentCurrency) : ""}
                    readOnly
                    tabIndex={-1}
                    placeholder={`المقابل بعملة ${equivalentCurrency}`}
                    className={`${inputClass} cursor-default opacity-80`}
                  />
                ) : null}
                </div>
              ) : null}

              <textarea rows={3} value={form.statement} onChange={(e) => setForm((f) => ({ ...f, statement: e.target.value }))} placeholder="البيان" className={`${inputClass} md:col-span-2`} />
              <input type="file" accept="image/*" className={`${inputClass} md:col-span-2`} onChange={onImageSelect} />
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => { void saveForm(); }} disabled={savingForm} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">{savingForm ? "جارٍ الحفظ..." : "حفظ"}</button>
              <button onClick={() => setOpenForm(false)} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إلغاء</button>
            </div>
          </div>
          {accountPickerOpen ? (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-3">
              <div className={`mx-auto my-4 max-h-[calc(100vh-2rem)] w-full max-w-md overflow-hidden rounded-2xl border ${isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}>
                <div className={`sticky top-0 z-10 space-y-2 border-b p-3 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold">اختر حساب</h4>
                    <button type="button" onClick={closeAccountPicker} className={`rounded-lg border px-3 py-1 text-sm ${isDark ? "border-slate-600" : "border-slate-300"}`}>إغلاق</button>
                  </div>
                  <input value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="بحث باسم الحساب أو الرقم أو الهاتف" className={`${inputClass} w-full`} autoFocus />
                </div>
                <div className="max-h-[65vh] overflow-y-auto p-2">
                  {formAccountOptions.map((account) => (
                    <button
                      key={`pick-acc-modal-${account.id}`}
                      type="button"
                      onClick={() => selectAccountForForm(account.name)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-right text-sm ${
                        form.account === account.name
                          ? isDark
                            ? "bg-cyan-500/20 text-cyan-200"
                            : "bg-cyan-100 text-cyan-900"
                          : isDark
                            ? "hover:bg-slate-800"
                            : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-semibold">{account.name}</span>
                      <span className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>{account.accountCode}</span>
                    </button>
                  ))}
                  {formAccountOptions.length === 0 ? (
                    <div className={isDark ? "px-3 py-6 text-center text-sm text-slate-400" : "px-3 py-6 text-center text-sm text-slate-500"}>لا توجد حسابات مطابقة</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
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
  const availableAccounts = useMemo(
    () => accounts.filter((account) => sectionFilter === "all" || account.type === sectionFilter),
    [accounts, sectionFilter],
  );
  const availableAccountNames = availableAccounts.map((account) => account.name);

  const buildRows = () =>
    operations
      .filter((op) => (includePayment && op.type === "صرف") || (includeReceipt && op.type === "قبض"))
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => accountInRange(op.account, fromAccount, toAccount, availableAccountNames))
      .filter((op) => operationMatchesCurrency(op, currency))
      .filter((op) => sectionFilter === "all" || accountByName.get(op.account)?.type === sectionFilter)
      .sort(compareByDateTimeDesc);

  const viewReport = () => setRows(buildRows());

  const printReport = async () => {
    setPrintProgress(true, "جارٍ حساب بيانات التقرير...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const built = buildRows();
    const printRows = [...built].sort(compareByDateTimeAsc);
    setRows(built);

    if (reportMode === "تحليلي") {
      const voucherPages = printRows.map((op) => {
        const accCode = accountByName.get(op.account)?.accountCode ?? "—";
        const boxCode = cashboxById.get(op.cashboxId)?.code ?? String(op.cashboxId);
        return buildVoucherInnerHtml({
          operation: op,
          settings,
          accountCode: accCode,
          cashboxCode: boxCode,
          includeAttachment: Boolean(op.imageUrl),
        });
      });

      const ok = await renderPrintWindow("تقارير العمليات - تحليلي", paginateStaticPages(voucherPages));
      onPrinted(ok);
      return;
    }

    const byCurrency = new Map<CurrencyCode, OperationItem[]>();
    printRows.forEach((op) => {
      const curr = getOperationCurrencyMeta(op).accountCurrency;
      byCurrency.set(curr, [...(byCurrency.get(curr) ?? []), op]);
    });

    const blocks: PrintPageBlock[] = Array.from(byCurrency.entries()).map(([curr, currencyRows]) => {
      const rowsHtml = currencyRows.map((op) => {
        const { accountAmount } = getOperationAmounts(op);
        const debit = op.type === "صرف" ? accountAmount : 0;
        const credit = op.type === "قبض" ? accountAmount : 0;
        const boxCode = cashboxById.get(op.cashboxId)?.code ?? String(op.cashboxId);
        const meta = getOperationCurrencyMeta(op);
        const exchangeDisplay = meta.accountCurrency !== meta.cashboxCurrency ? meta.accountRate ?? meta.cashboxRate : undefined;
        const cashboxRateHtml = exchangeDisplay ? `<br/><small>سعر الصرف: ${escapeHtml(formatNumber(exchangeDisplay))}</small>` : "";
        return `<tr>
              <td class="compact-cell">${escapeHtml(op.id)}</td>
              <td class="compact-cell">${escapeHtml(parseDateOnly(op.datetime))}</td>
              <td class="compact-cell">${escapeHtml(op.type)}</td>
              <td>${escapeHtml(op.account)}</td>
              <td class="compact-cell">${escapeHtml(boxCode)}${cashboxRateHtml}</td>
              <td class="compact-cell">${escapeHtml(curr)}</td>
              <td>${escapeHtml(debit ? formatNumber(debit) : "0")}</td>
              <td>${escapeHtml(credit ? formatNumber(credit) : "0")}</td>
            </tr>`;
      });
      const totalDebit = currencyRows.filter((x) => x.type === "صرف").reduce((s, x) => s + getOperationAmounts(x).accountAmount, 0);
      const totalCredit = currencyRows.filter((x) => x.type === "قبض").reduce((s, x) => s + getOperationAmounts(x).accountAmount, 0);
      return {
        titleHtml: `<div class="voucher-title"><div class="voucher-box">تقرير العمليات إجمالي</div><div class="meta">العملة: ${escapeHtml(curr)}</div></div>`,
        colgroupHtml: `<colgroup>
                <col style="width: 9%" />
                <col style="width: 11%" />
                <col style="width: 8%" />
                <col style="width: 22%" />
                <col style="width: 12%" />
                <col style="width: 8%" />
                <col style="width: 15%" />
                <col style="width: 15%" />
              </colgroup>`,
        theadHtml: `<thead><tr><th>رقم السند</th><th>التاريخ</th><th>النوع</th><th>الحساب</th><th>الصندوق</th><th>العملة</th><th>مدين</th><th>دائن</th></tr></thead>`,
        rowsHtml,
        footerHtml: `<tr><td colspan="6">الإجمالي</td><td>${escapeHtml(formatNumber(totalDebit))}</td><td>${escapeHtml(formatNumber(totalCredit))}</td></tr>`,
      };
    });

    const ok = await renderPrintWindow("تقارير العمليات - إجمالي", buildPaginatedReport(blocks, settings));
    onPrinted(ok);
  };

  const totals = useMemo(() => {
    const debit = rows.filter((x) => x.type === "صرف").reduce((s, x) => s + getOperationAmounts(x).accountAmount, 0);
    const credit = rows.filter((x) => x.type === "قبض").reduce((s, x) => s + getOperationAmounts(x).accountAmount, 0);
    return { debit, credit };
  }, [rows]);

  const inputClass = isDark
    ? "min-w-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    : "min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <section className={`overflow-x-hidden space-y-4 rounded-3xl border p-4 sm:p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)} className={inputClass}><option>تحليلي</option><option>إجمالي</option></select>
        <select value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value as "all" | AccountType); setFromAccount(""); setToAccount(""); }} className={inputClass}><option value="all">كل الأقسام</option><option value="عملاء">عملاء</option><option value="موردين">موردين</option><option value="بنك">بنك</option><option value="موظفين">موظفين</option></select>
        <AccountPickerField value={fromAccount} onChange={setFromAccount} accounts={availableAccounts} placeholder="من حساب" inputClass={inputClass} isDark={isDark} />
        <AccountPickerField value={toAccount} onChange={setToAccount} accounts={availableAccounts} placeholder="إلى حساب" inputClass={inputClass} isDark={isDark} />
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
                {reportMode === "إجمالي" ? <th className="px-3 py-2 text-right">العملة</th> : null}
                {reportMode === "تحليلي" ? <th className="px-3 py-2 text-right min-w-[280px]">البيان</th> : null}
                <th className="px-3 py-2 text-right">مدين</th>
                <th className="px-3 py-2 text-right">دائن</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((op) => {
                const boxCode = cashboxById.get(op.cashboxId)?.code ?? String(op.cashboxId);
                const meta = getOperationCurrencyMeta(op);
                const { accountAmount } = getOperationAmounts(op);
                const exchangeDisplay = meta.accountCurrency !== meta.cashboxCurrency ? meta.accountRate ?? meta.cashboxRate : undefined;
                return (
                  <tr key={`op-${op.type}-${op.id}-${op.datetime}`} className="border-t border-slate-700/30">
                    <td className="px-3 py-2">{op.id}</td>
                    <td className="px-3 py-2">{formatDateTimeNoSeconds(op.datetime)}</td>
                    <td className="px-3 py-2">{op.type}</td>
                    <td className="px-3 py-2">
                      <div>{op.account}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{boxCode}</div>
                      {exchangeDisplay ? <div className={isDark ? "text-xs text-slate-400" : "text-xs text-slate-500"}>سعر الصرف: {formatNumber(exchangeDisplay)}</div> : null}
                    </td>
                    {reportMode === "إجمالي" ? <td className="px-3 py-2">{meta.accountCurrency}</td> : null}
                    {reportMode === "تحليلي" ? <td className="px-3 py-2 max-w-[26rem] whitespace-pre-wrap break-words">{op.statement ?? "—"}</td> : null}
                    <td className="px-3 py-2 text-emerald-300">{op.type === "صرف" ? (reportMode === "إجمالي" ? formatNumber(accountAmount) : formatAmount(accountAmount, meta.accountCurrency)) : "0"}</td>
                    <td className="px-3 py-2 text-rose-300">{op.type === "قبض" ? (reportMode === "إجمالي" ? formatNumber(accountAmount) : formatAmount(accountAmount, meta.accountCurrency)) : "0"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                <td colSpan={6} className="px-3 py-2 text-right font-bold">الإجمالي</td>
                <td className="px-3 py-2 font-bold text-emerald-300">{formatNumber(totals.debit)}</td>
                <td className="px-3 py-2 font-bold text-rose-300">{formatNumber(totals.credit)}</td>
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
    Array<{ account: string; currency: CurrencyCode; entries: OperationItem[]; openingDebit: number; openingCredit: number; debit: number; credit: number; balance: number; nature: string }>
  >([]);
  const [aggregateRows, setAggregateRows] = useState<
    Array<{ account: string; currency: CurrencyCode; debit: number; credit: number; balance: number; nature: string }>
  >([]);

  const accountByName = useMemo(() => new Map(accounts.map((a) => [a.name, a])), [accounts]);
  const availableAccounts = useMemo(
    () => accounts.filter((account) => sectionFilter === "all" || account.type === sectionFilter),
    [accounts, sectionFilter],
  );
  const availableAccountNames = availableAccounts.map((account) => account.name);

  const build = () => {
    const filtered = operations
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => accountInRange(op.account, fromAccount, toAccount, availableAccountNames))
      .filter((op) => operationMatchesCurrency(op, currency))
      .filter((op) => sectionFilter === "all" || accountByName.get(op.account)?.type === sectionFilter)
      .sort(compareByDateTimeAsc);

    const grouped = new Map<string, OperationItem[]>();
    filtered.forEach((op) => {
      const key = `${op.account}__${getOperationCurrencyMeta(op).accountCurrency}`;
      grouped.set(key, [...(grouped.get(key) ?? []), op]);
    });

    availableAccounts
      .filter((account) => account.openingBalance)
      .filter((account) => accountInRange(account.name, fromAccount, toAccount, availableAccountNames))
      .filter((account) => currency === "all" || (account.openingCurrency ?? settings.baseCurrency) === currency)
      .forEach((account) => {
        const key = `${account.name}__${account.openingCurrency ?? settings.baseCurrency}`;
        if (!grouped.has(key)) grouped.set(key, []);
      });

    const sortByBaseCurrency = (a: { account: string; currency: CurrencyCode }, b: { account: string; currency: CurrencyCode }) => {
      const rank = (code: CurrencyCode) => (code === settings.baseCurrency ? 0 : 1);
      return rank(a.currency) - rank(b.currency) || a.currency.localeCompare(b.currency) || a.account.localeCompare(b.account);
    };

    const analytical = Array.from(grouped.entries()).map(([key, entries]) => {
      const [account, curr] = key.split("__") as [string, CurrencyCode];
      const accountRecord = accountByName.get(account);
      const openingBalance = accountRecord?.openingCurrency === curr || (!accountRecord?.openingCurrency && curr === settings.baseCurrency)
        ? accountRecord?.openingBalance ?? 0
        : 0;
      const openingDebit = openingBalance && accountRecord?.openingSide === "عليه" ? openingBalance : 0;
      const openingCredit = openingBalance && accountRecord?.openingSide !== "عليه" ? openingBalance : 0;
      const debit = entries.filter((e) => e.type === "صرف").reduce((s, e) => s + getOperationAmounts(e).accountAmount, 0);
      const credit = entries.filter((e) => e.type === "قبض").reduce((s, e) => s + getOperationAmounts(e).accountAmount, 0);
      const totalDebit = openingDebit + debit;
      const totalCredit = openingCredit + credit;
      const balance = totalDebit - totalCredit;
      return { account, currency: curr, entries, openingDebit, openingCredit, debit: totalDebit, credit: totalCredit, balance, nature: accountBalanceNature(balance) };
    }).sort(sortByBaseCurrency);

    const aggregate = analytical.map((row) => ({
      account: row.account,
      currency: row.currency,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
      nature: row.nature,
    })).sort(sortByBaseCurrency);

    return { analytical, aggregate };
  };

  const viewReport = () => {
    const built = build();
    setAnalyticalRows(built.analytical);
    setAggregateRows(built.aggregate);
  };

  const printReport = async () => {
    setPrintProgress(true, "جارٍ حساب بيانات التقرير...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const built = build();
    const printAnalytical = built.analytical.map((group) => ({ ...group, entries: [...group.entries].sort(compareByDateTimeAsc) }));
    setAnalyticalRows(built.analytical);
    setAggregateRows(built.aggregate);

    if (reportMode === "تحليلي") {
      const blocks: PrintPageBlock[] = printAnalytical.map((group) => {
        const rows = group.entries.map((entry) => {
          const { accountAmount } = getOperationAmounts(entry);
          const debit = entry.type === "صرف" ? accountAmount : 0;
          const credit = entry.type === "قبض" ? accountAmount : 0;
          return `<tr>
                <td class="compact-cell">${escapeHtml(parseDateOnly(entry.datetime))}</td>
                <td class="compact-cell">${escapeHtml(entry.type)}</td>
                <td class="compact-cell">${escapeHtml(entry.id)}</td>
                <td class="statement-cell">${escapeHtml(entry.statement ?? "—")}</td>
                <td>${escapeHtml(debit ? formatNumber(debit) : "0")}</td>
                <td>${escapeHtml(credit ? formatNumber(credit) : "0")}</td>
              </tr>`;
        });
        const openingRow = group.openingDebit || group.openingCredit
          ? `<tr><td></td><td></td><td></td><td class="statement-cell">رصيد افتتاحي</td><td>${escapeHtml(group.openingDebit ? formatNumber(group.openingDebit) : "0")}</td><td>${escapeHtml(group.openingCredit ? formatNumber(group.openingCredit) : "0")}</td></tr>`
          : "";

        return {
          titleHtml: `<div class="voucher-title"><div class="voucher-box">تقرير حساب تحليلي</div><div class="meta">الحساب: ${escapeHtml(group.account)} (${escapeHtml(group.currency)})</div></div>`,
          colgroupHtml: `<colgroup>
                  <col style="width: 12%" />
                  <col style="width: 9%" />
                  <col style="width: 10%" />
                  <col style="width: 43%" />
                  <col style="width: 13%" />
                  <col style="width: 13%" />
                </colgroup>`,
          theadHtml: `<thead><tr><th>التاريخ</th><th>النوع</th><th>رقم العملية</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead>`,
          leadingRowsHtml: openingRow,
          rowsHtml: rows,
          footerHtml: `<tr><td colspan="4">الإجمالي</td><td>${escapeHtml(formatNumber(group.debit))}</td><td>${escapeHtml(formatNumber(group.credit))}</td></tr>`,
          tailHtml: `<div class="line">الرصيد: ${escapeHtml(formatBalanceWithNature(group.balance, group.currency, group.nature))}</div>`,
        };
      });

      const ok = await renderPrintWindow("تقارير الحسابات - تحليلي", buildPaginatedReport(blocks, settings));
      onPrinted(ok);
      return;
    }

    const aggregateByCurrency = new Map<CurrencyCode, typeof built.aggregate>();
    built.aggregate.forEach((row) => aggregateByCurrency.set(row.currency, [...(aggregateByCurrency.get(row.currency) ?? []), row]));
    const blocks: PrintPageBlock[] = Array.from(aggregateByCurrency.entries()).map(([curr, currencyRows]) => {
      const rows = currencyRows.map(
        (row) =>
          `<tr><td>${escapeHtml(row.account)}</td><td class="compact-cell">${escapeHtml(row.currency)}</td><td>${escapeHtml(formatNumber(row.debit))}</td><td>${escapeHtml(formatNumber(row.credit))}</td><td>${escapeHtml(formatBalanceWithNature(row.balance, row.currency, row.nature))}</td></tr>`,
      );
      const totalDebit = currencyRows.reduce((s, r) => s + r.debit, 0);
      const totalCredit = currencyRows.reduce((s, r) => s + r.credit, 0);
      return {
        titleHtml: `<div class="voucher-title"><div class="voucher-box">تقرير الحسابات إجمالي</div><div class="meta">العملة: ${escapeHtml(curr)}</div></div>`,
        colgroupHtml: "",
        theadHtml: `<thead><tr><th>الحساب</th><th>العملة</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>`,
        rowsHtml: rows,
        footerHtml: `<tr><td colspan="2">الإجمالي</td><td>${escapeHtml(formatNumber(totalDebit))}</td><td>${escapeHtml(formatNumber(totalCredit))}</td><td></td></tr>`,
      };
    });

    const ok = await renderPrintWindow("تقارير الحسابات - إجمالي", buildPaginatedReport(blocks, settings));
    onPrinted(ok);
  };

  const totalFooter = useMemo(
    () => ({ debit: aggregateRows.reduce((s, r) => s + r.debit, 0), credit: aggregateRows.reduce((s, r) => s + r.credit, 0) }),
    [aggregateRows],
  );

  const inputClass = isDark
    ? "min-w-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    : "min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <section className={`overflow-x-hidden space-y-4 rounded-3xl border p-4 sm:p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تقارير الحسابات</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={reportMode} onChange={(e) => setReportMode(e.target.value as ReportMode)} className={inputClass}><option>تحليلي</option><option>إجمالي</option></select>
        <select value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value as "all" | AccountType); setFromAccount(""); setToAccount(""); }} className={inputClass}><option value="all">كل الأقسام</option><option value="عملاء">عملاء</option><option value="موردين">موردين</option><option value="بنك">بنك</option><option value="موظفين">موظفين</option></select>
        <AccountPickerField value={fromAccount} onChange={setFromAccount} accounts={availableAccounts} placeholder="من حساب" inputClass={inputClass} isDark={isDark} />
        <AccountPickerField value={toAccount} onChange={setToAccount} accounts={availableAccounts} placeholder="إلى حساب" inputClass={inputClass} isDark={isDark} />
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
                    {group.openingDebit || group.openingCredit ? (
                      <tr className="border-t border-slate-700/30">
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1 max-w-[24rem] whitespace-pre-wrap break-words">رصيد افتتاحي</td>
                        <td className="px-2 py-1 text-emerald-300">{group.openingDebit ? formatNumber(group.openingDebit) : "0"}</td>
                        <td className="px-2 py-1 text-rose-300">{group.openingCredit ? formatNumber(group.openingCredit) : "0"}</td>
                      </tr>
                    ) : null}
                    {group.entries.map((entry) => {
                      const { accountAmount } = getOperationAmounts(entry);
                      return (
                        <tr key={`ar-${group.account}-${entry.type}-${entry.id}-${entry.datetime}`} className="border-t border-slate-700/30">
                          <td className="px-2 py-1">{formatDateTimeNoSeconds(entry.datetime)}</td>
                          <td className="px-2 py-1">{entry.type}</td>
                          <td className="px-2 py-1">{entry.id}</td>
                          <td className="px-2 py-1 max-w-[24rem] whitespace-pre-wrap break-words">{entry.statement ?? "—"}</td>
                          <td className="px-2 py-1 text-emerald-300">{entry.type === "صرف" ? formatNumber(accountAmount) : "0"}</td>
                          <td className="px-2 py-1 text-rose-300">{entry.type === "قبض" ? formatNumber(accountAmount) : "0"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                      <td colSpan={4} className="px-2 py-1 font-bold">الإجمالي</td>
                      <td className="px-2 py-1 font-bold text-emerald-300">{formatNumber(group.debit)}</td>
                      <td className="px-2 py-1 font-bold text-rose-300">{formatNumber(group.credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-sm text-cyan-300">الرصيد: {formatBalanceWithNature(group.balance, group.currency, group.nature)}</p>
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
                  <td className="px-3 py-2 text-emerald-300">{formatNumber(row.debit)}</td>
                  <td className="px-3 py-2 text-rose-300">{formatNumber(row.credit)}</td>
                  <td className="px-3 py-2 text-cyan-300">{formatBalanceWithNature(row.balance, row.currency, row.nature)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                <td colSpan={2} className="px-3 py-2 font-bold">الإجمالي</td>
                <td className="px-3 py-2 font-bold text-emerald-300">{formatNumber(totalFooter.debit)}</td>
                <td className="px-3 py-2 font-bold text-rose-300">{formatNumber(totalFooter.credit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function CashboxesReportScreen({
  operations,
  settings,
  cashboxes,
  accounts,
  currencyCodes,
  onPrinted,
  onBack,
  isDark,
}: {
  operations: OperationItem[];
  settings: AppSettings;
  cashboxes: CashboxRecord[];
  accounts: AccountRecord[];
  currencyCodes: CurrencyCode[];
  onPrinted: (ok: boolean) => void;
  onBack: () => void;
  isDark: boolean;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [currency, setCurrency] = useState<"all" | CurrencyCode>("all");
  const [fromCashbox, setFromCashbox] = useState("");
  const [toCashbox, setToCashbox] = useState("");
  const [rows, setRows] = useState<
    Array<{ cashboxId: number; code: string; name: string; currency: CurrencyCode; entries: OperationItem[]; openingDebit: number; openingCredit: number; debit: number; credit: number; balance: number; nature: string }>
  >([]);

  const accountByName = useMemo(() => new Map(accounts.map((account) => [account.name, account])), [accounts]);
  const cashboxById = useMemo(() => new Map(cashboxes.map((cashbox) => [cashbox.id, cashbox])), [cashboxes]);
  const cashboxCodes = cashboxes.map((cashbox) => cashbox.code);

  const build = () => {
    const filtered = operations
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => {
        const box = cashboxById.get(op.cashboxId);
        return box ? valueInRange(box.code, fromCashbox, toCashbox, cashboxCodes) : true;
      })
      .filter((op) => currency === "all" || getOperationCurrencyMeta(op).cashboxCurrency === currency)
      .sort((a, b) => (sortOrder === "newest" ? compareByDateTimeDesc(a, b) : compareByDateTimeAsc(a, b)));

    const grouped = new Map<string, OperationItem[]>();
    filtered.forEach((op) => {
      const meta = getOperationCurrencyMeta(op);
      const key = `${op.cashboxId}__${meta.cashboxCurrency}`;
      grouped.set(key, [...(grouped.get(key) ?? []), op]);
    });

    cashboxes
      .filter((cashbox) => cashbox.openingBalance)
      .filter((cashbox) => valueInRange(cashbox.code, fromCashbox, toCashbox, cashboxCodes))
      .filter((cashbox) => currency === "all" || (cashbox.openingCurrency ?? settings.baseCurrency) === currency)
      .forEach((cashbox) => {
        const key = `${cashbox.id}__${cashbox.openingCurrency ?? settings.baseCurrency}`;
        if (!grouped.has(key)) grouped.set(key, []);
      });

    return Array.from(grouped.entries()).map(([key, entries]) => {
      const [cashboxIdRaw, curr] = key.split("__") as [string, CurrencyCode];
      const cashboxId = Number(cashboxIdRaw);
      const cashbox = cashboxById.get(cashboxId);
      const openingBalance = cashbox?.openingCurrency === curr || (!cashbox?.openingCurrency && curr === settings.baseCurrency)
        ? cashbox?.openingBalance ?? 0
        : 0;
      const openingDebit = openingBalance && cashbox?.openingSide === "عليه" ? openingBalance : 0;
      const openingCredit = openingBalance && cashbox?.openingSide !== "عليه" ? openingBalance : 0;
      const debit = entries.filter((entry) => entry.type === "قبض").reduce((sum, entry) => sum + getOperationAmounts(entry).cashboxAmount, 0);
      const credit = entries.filter((entry) => entry.type === "صرف").reduce((sum, entry) => sum + getOperationAmounts(entry).cashboxAmount, 0);
      const totalDebit = openingDebit + debit;
      const totalCredit = openingCredit + credit;
      const balance = totalDebit - totalCredit;
      return {
        cashboxId,
        code: cashbox?.code ?? String(cashboxId),
        name: cashbox?.name ?? "—",
        currency: curr,
        entries,
        openingDebit,
        openingCredit,
        debit: totalDebit,
        credit: totalCredit,
        balance,
        nature: cashboxBalanceNature(balance),
      };
    });
  };

  const viewReport = () => setRows(build());

  const printReport = async () => {
    setPrintProgress(true, "جارٍ حساب بيانات التقرير...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const built = build();
    const printRows = built.map((group) => ({ ...group, entries: [...group.entries].sort(compareByDateTimeAsc) }));
    setRows(built);

    const blocks: PrintPageBlock[] = printRows.map((group) => {
      const tableRows = group.entries.map((entry) => {
        const account = accountByName.get(entry.account);
        const { cashboxAmount } = getOperationAmounts(entry);
        const debit = entry.type === "قبض" ? cashboxAmount : 0;
        const credit = entry.type === "صرف" ? cashboxAmount : 0;
        return `<tr>
              <td class="compact-cell">${escapeHtml(parseDateOnly(entry.datetime))}</td>
              <td class="compact-cell">${escapeHtml(entry.type)}</td>
              <td class="compact-cell">${escapeHtml(entry.id)}</td>
              <td class="compact-cell">${escapeHtml(account?.accountCode ?? "—")}</td>
              <td>${escapeHtml(entry.account)}</td>
              <td class="statement-cell">${escapeHtml(entry.statement ?? "—")}</td>
              <td>${escapeHtml(debit ? formatNumber(debit) : "0")}</td>
              <td>${escapeHtml(credit ? formatNumber(credit) : "0")}</td>
            </tr>`;
      });
      const openingRow = group.openingDebit || group.openingCredit
        ? `<tr><td></td><td></td><td></td><td></td><td></td><td class="statement-cell">رصيد افتتاحي</td><td>${escapeHtml(group.openingDebit ? formatNumber(group.openingDebit) : "0")}</td><td>${escapeHtml(group.openingCredit ? formatNumber(group.openingCredit) : "0")}</td></tr>`
        : "";

      return {
        titleHtml: `<div class="voucher-title"><div class="voucher-box">تقرير صندوق تحليلي</div><div class="meta">الصندوق: ${escapeHtml(group.code)} - ${escapeHtml(group.name)} (${escapeHtml(group.currency)})</div></div>`,
        colgroupHtml: `<colgroup>
                <col style="width: 10%" />
                <col style="width: 8%" />
                <col style="width: 9%" />
                <col style="width: 10%" />
                <col style="width: 16%" />
                <col style="width: 31%" />
                <col style="width: 8%" />
                <col style="width: 8%" />
              </colgroup>`,
        theadHtml: `<thead><tr><th>التاريخ</th><th>النوع</th><th>رقم العملية</th><th>رقم الحساب</th><th>اسم الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr></thead>`,
        leadingRowsHtml: openingRow,
        rowsHtml: tableRows,
        footerHtml: `<tr><td colspan="6">الإجمالي</td><td>${escapeHtml(formatNumber(group.debit))}</td><td>${escapeHtml(formatNumber(group.credit))}</td></tr>`,
        tailHtml: `<div class="line">الرصيد: ${escapeHtml(formatBalanceWithNature(group.balance, group.currency, group.nature))}</div>`,
      };
    });

    const ok = await renderPrintWindow("تقارير الصناديق", buildPaginatedReport(blocks, settings));
    onPrinted(ok);
  };

  const inputClass = isDark
    ? "min-w-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    : "min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <section className={`overflow-x-hidden space-y-4 rounded-3xl border p-4 sm:p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تقارير الصناديق</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)} className={inputClass}><option value="newest">الفرز: الأحدث</option><option value="oldest">الفرز: الأقدم</option></select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "all" | CurrencyCode)} className={inputClass}><option value="all">كل العملات</option>{currencyCodes.map((code) => <option key={`cbrc-${code}`} value={code}>{code}</option>)}</select>
        <select value={fromCashbox} onChange={(e) => setFromCashbox(e.target.value)} className={inputClass}><option value="">من صندوق</option>{cashboxes.map((box) => <option key={`cbf-${box.id}`} value={box.code}>{box.code} - {box.name}</option>)}</select>
        <select value={toCashbox} onChange={(e) => setToCashbox(e.target.value)} className={inputClass}><option value="">إلى صندوق</option>{cashboxes.map((box) => <option key={`cbt-${box.id}`} value={box.code}>{box.code} - {box.name}</option>)}</select>
      </div>

      <div className="flex gap-2">
        <button onClick={viewReport} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-cyan-950">عرض التقرير</button>
        <button onClick={printReport} className={`rounded-xl border px-4 py-2 text-sm font-bold ${isDark ? "border-slate-500 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}>طباعة PDF</button>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-4">
          {rows.map((group) => (
            <article key={`cbr-${group.cashboxId}-${group.currency}`} className={`rounded-xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}>
              <p className="mb-2 font-bold">{group.code} - {group.name} - {group.currency}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className={isDark ? "bg-slate-700 text-slate-100" : "bg-slate-100 text-slate-700"}>
                    <tr>
                      <th className="px-2 py-1 text-right">التاريخ والوقت</th>
                      <th className="px-2 py-1 text-right">النوع</th>
                      <th className="px-2 py-1 text-right">رقم العملية</th>
                      <th className="px-2 py-1 text-right">رقم الحساب</th>
                      <th className="px-2 py-1 text-right">اسم الحساب</th>
                      <th className="px-2 py-1 text-right">البيان</th>
                      <th className="px-2 py-1 text-right">مدين</th>
                      <th className="px-2 py-1 text-right">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.openingDebit || group.openingCredit ? (
                      <tr className="border-t border-slate-700/30">
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1 max-w-[24rem] whitespace-pre-wrap break-words">رصيد افتتاحي</td>
                        <td className="px-2 py-1 text-emerald-300">{group.openingDebit ? formatNumber(group.openingDebit) : "0"}</td>
                        <td className="px-2 py-1 text-rose-300">{group.openingCredit ? formatNumber(group.openingCredit) : "0"}</td>
                      </tr>
                    ) : null}
                    {group.entries.map((entry) => {
                      const account = accountByName.get(entry.account);
                      const { cashboxAmount } = getOperationAmounts(entry);
                      return (
                        <tr key={`cbr-${group.cashboxId}-${group.currency}-${entry.type}-${entry.id}-${entry.datetime}`} className="border-t border-slate-700/30">
                          <td className="px-2 py-1">{formatDateTimeNoSeconds(entry.datetime)}</td>
                          <td className="px-2 py-1">{entry.type}</td>
                          <td className="px-2 py-1">{entry.id}</td>
                          <td className="px-2 py-1">{account?.accountCode ?? "—"}</td>
                          <td className="px-2 py-1">{entry.account}</td>
                          <td className="px-2 py-1 max-w-[24rem] whitespace-pre-wrap break-words">{entry.statement ?? "—"}</td>
                          <td className="px-2 py-1 text-emerald-300">{entry.type === "قبض" ? formatNumber(cashboxAmount) : "0"}</td>
                          <td className="px-2 py-1 text-rose-300">{entry.type === "صرف" ? formatNumber(cashboxAmount) : "0"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={isDark ? "border-t border-slate-500 bg-slate-800 text-slate-100" : "border-t border-slate-300 bg-slate-100 text-slate-700"}>
                      <td colSpan={6} className="px-2 py-1 font-bold">الإجمالي</td>
                      <td className="px-2 py-1 font-bold text-emerald-300">{formatNumber(group.debit)}</td>
                      <td className="px-2 py-1 font-bold text-rose-300">{formatNumber(group.credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2 text-sm text-cyan-300">الرصيد: {formatBalanceWithNature(group.balance, group.currency, group.nature)}</p>
            </article>
          ))}
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
  onDownload: (message: string, type: "success" | "error") => void;
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
  const availableAccounts = useMemo(
    () => accounts.filter((account) => sectionFilter === "all" || account.type === sectionFilter),
    [accounts, sectionFilter],
  );
  const availableAccountNames = availableAccounts.map((account) => account.name);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operations
      .filter((op) => Boolean(op.imageUrl))
      .filter((op) => typeFilter === "all" || op.type === typeFilter)
      .filter((op) => (!fromDate || parseDateOnly(op.datetime) >= fromDate) && (!toDate || parseDateOnly(op.datetime) <= toDate))
      .filter((op) => accountInRange(op.account, fromAccount, toAccount, availableAccountNames))
      .filter((op) => operationMatchesCurrency(op, currency))
      .filter((op) => sectionFilter === "all" || accountByName.get(op.account)?.type === sectionFilter)
      .filter((op) => !q || String(op.id).includes(q))
      .sort(compareByDateTimeAsc);
  }, [operations, typeFilter, fromDate, toDate, fromAccount, toAccount, currency, sectionFilter, query, availableAccountNames, accountByName]);

  const inputClass = isDark
    ? "min-w-0 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    : "min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  return (
    <section className={`overflow-x-hidden space-y-4 rounded-3xl border p-4 sm:p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">تقارير الصور المرفقة</h2>
        <BackButton onBack={onBack} isDark={isDark} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-8">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | VoucherType)} className={inputClass}><option value="all">كل العمليات</option><option value="صرف">سندات الصرف</option><option value="قبض">سندات القبض</option></select>
        <select value={sectionFilter} onChange={(e) => { setSectionFilter(e.target.value as "all" | AccountType); setFromAccount(""); setToAccount(""); }} className={inputClass}><option value="all">كل الأقسام</option><option value="عملاء">عملاء</option><option value="موردين">موردين</option><option value="بنك">بنك</option><option value="موظفين">موظفين</option></select>
        <input value={query} onChange={(e) => setQuery(e.target.value.replace(/\D/g, ""))} placeholder="بحث برقم السند" className={inputClass} />
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "all" | CurrencyCode)} className={inputClass}><option value="all">كل العملات</option>{currencyCodes.map((code) => <option key={`imgc-${code}`} value={code}>{code}</option>)}</select>
        <DateInput value={fromDate} onChange={setFromDate} label="من تاريخ" className={inputClass} />
        <DateInput value={toDate} onChange={setToDate} label="إلى تاريخ" className={inputClass} />
        <AccountPickerField value={fromAccount} onChange={setFromAccount} accounts={availableAccounts} placeholder="من حساب" inputClass={inputClass} isDark={isDark} />
        <AccountPickerField value={toAccount} onChange={setToAccount} accounts={availableAccounts} placeholder="إلى حساب" inputClass={inputClass} isDark={isDark} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article key={`img-${row.type}-${row.id}-${row.datetime}`} className={`rounded-2xl border p-3 ${isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"}`}>
            <p className="text-sm font-bold">سند {row.id} - {row.type}</p>
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
                const result = await downloadImageToDevice(selectedImage, `voucher-image-${Date.now()}.jpg`);
                onDownload(saveResultMessage(result, "الصورة"), result === "cancelled" ? "error" : "success");
              } catch {
                onDownload("تعذر حفظ الصورة", "error");
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
  onCreatePayment: (operation: Omit<OperationItem, "id">) => Promise<boolean> | boolean | void;
  onCreateReceipt: (operation: Omit<OperationItem, "id">) => Promise<boolean> | boolean | void;
  onUpdatePayment: (id: number, operation: Omit<OperationItem, "id">) => Promise<boolean> | boolean | void;
  onUpdateReceipt: (id: number, operation: Omit<OperationItem, "id">) => Promise<boolean> | boolean | void;
  onDeletePayment: (id: number) => void;
  onDeleteReceipt: (id: number) => void;
  onNotify: (operation: OperationItem) => void;
  onPrint: (operation: OperationItem) => void;
  onPrinted: (ok: boolean) => void;
  onImageDownload: (message: string, type: "success" | "error") => void;
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
    return null;
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

  if (screen === "report-cashboxes") {
    return (
      <CashboxesReportScreen
        operations={allOperations}
        settings={settings}
        cashboxes={cashboxes}
        accounts={accounts}
        currencyCodes={currencyCodes}
        onPrinted={onPrinted}
        onBack={() => onSelect("home")}
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
    openingCurrency: "YER",
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [companyModalOpen, setCompanyModalOpen] = useState(false);

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
    openingCurrency: CurrencyCode;
  }>({
    mode: "create",
    type: "عملاء",
    name: "",
    phone: "",
    enabledCurrencies: ["YER"],
    openingBalance: "",
    openingSide: "له",
    openingCurrency: "YER",
  });

  const [cashboxModalOpen, setCashboxModalOpen] = useState(false);
  const [cashboxForm, setCashboxForm] = useState<{
    mode: "create" | "edit";
    id?: number;
    name: string;
    enabledCurrencies: CurrencyCode[];
    openingBalance: string;
    openingSide: BalanceSide;
    openingCurrency: CurrencyCode;
  }>({
    mode: "create",
    name: "",
    enabledCurrencies: ["YER"],
    openingBalance: "",
    openingSide: "له",
    openingCurrency: "YER",
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
  const selectedScreenRef = useRef<ScreenKey>("home");

  /* حالة المساحة والنسخ الاحتياطي */
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({ supported: false, usage: 0, quota: 0, available: Number.MAX_SAFE_INTEGER, low: false });
  const [persistentGranted, setPersistentGranted] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupReminderOpen, setBackupReminderOpen] = useState(false);
  const [backupOverdueDays, setBackupOverdueDays] = useState(0);
  const [lowSpaceNoticeOpen, setLowSpaceNoticeOpen] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  /* نافذة كلمة سر الاستعادة (منفصلة تمامًا عن خانة إنشاء النسخة) */
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const [restoreFileText, setRestoreFileText] = useState<string | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const pendingMetaRef = useRef<AppSnapshot | null>(null);

  const isDark = theme === "dark";

  // قفل تمرير الخلفية لكل النوافذ المنبثقة على مستوى التطبيق
  useBodyScrollLock(backupReminderOpen || lowSpaceNoticeOpen || restorePromptOpen);

  const buildSnapshot = (): AppSnapshot => ({
    storageVersion: STORAGE_VERSION,
    appVersion: APP_VERSION,
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
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), type === "error" ? 5200 : 2600);
  };

  /* فحص المساحة قبل أي كتابة — يمنع الحفظ عند بقاء أقل من 200 ميجابايت */
  const refreshStorageStatus = async () => {
    const status = await getStorageStatus();
    setStorageStatus(status);
    return status;
  };

  const ensureSpaceForWrite = async () => {
    const status = await refreshStorageStatus();
    if (status.supported && status.low) {
      setLowSpaceNoticeOpen(true);
      addToast(
        `⛔ لا يمكن الحفظ: ذاكرة الهاتف ممتلئة (المتاح ${formatBytes(status.available)}). خذ نسخة احتياطية وأفرغ مساحة`,
        "error",
      );
      return false;
    }
    return true;
  };

  const navigateToScreen = (screen: ScreenKey) => {
    setSelectedScreen(screen);
    selectedScreenRef.current = screen;

    if (typeof window === "undefined") return;

    const currentScreen = (window.history.state as { screen?: ScreenKey } | null)?.screen;
    if (currentScreen !== screen) {
      window.history.pushState({ screen }, "", window.location.href);
    }
  };

  const pickAccountPhone = async () => {
    if (isAndroidApp()) {
      try {
        const result = await NativeTools.pickPhone();
        const phone = sanitizePhone(result.phone ?? "");

        if (result.status === "cancelled") {
          addToast("لم يتم اختيار رقم هاتف", "error");
          return;
        }

        if (!phone) {
          addToast("لم يتم العثور على رقم في جهة الاتصال", "error");
          return;
        }

        setAccountForm((form) => ({ ...form, phone }));
        addToast("تم جلب رقم الهاتف", "success");
      } catch {
        addToast("تعذر فتح الأسماء أو لم يتم منح الصلاحية", "error");
      }
      return;
    }

    const contactPicker = navigator as Navigator & ContactPicker;

    if (!contactPicker.select) {
      addToast("اختيار الرقم من الأسماء غير مدعوم على هذا الجهاز", "error");
      return;
    }

    try {
      const contacts = await contactPicker.select(["tel"], { multiple: false });
      const phone = sanitizePhone(contacts[0]?.tel?.[0] ?? "");

      if (!phone) {
        addToast("لم يتم العثور على رقم في جهة الاتصال", "error");
        return;
      }

      setAccountForm((form) => ({ ...form, phone }));
      addToast("تم جلب رقم الهاتف", "success");
    } catch {
      addToast("لم يتم اختيار رقم هاتف", "error");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let parsed: Partial<AppSnapshot> | null = null;

        if (hasIndexedDb()) {
          const meta = await getStoreValue<Partial<AppSnapshot>>(META_STORE, META_STATE_KEY);
          const paymentRows = await getAllOperations(PAYMENT_STORE);
          const receiptRows = await getAllOperations(RECEIPT_STORE);
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

    /* تفعيل التخزين الدائم: يمنع تطبيقات تنظيف الملفات المؤقتة
       ونظام أندرويد من مسح بيانات التطبيق تلقائيًا.
       بعدها لا تُحذف البيانات إلا بإلغاء التثبيت أو "مسح التخزين" من الإعدادات. */
    void requestPersistentStorage().then((granted) => {
      if (!cancelled) setPersistentGranted(granted);
    });

    void getStorageStatus().then((status) => {
      if (cancelled) return;
      setStorageStatus(status);
      if (status.supported && status.low) setLowSpaceNoticeOpen(true);
    });

    /* تذكير النسخ الاحتياطي كل 7 أيام */
    const evaluateBackupReminder = () => {
      try {
        const stored = localStorage.getItem(LAST_BACKUP_KEY);
        const snoozedAt = localStorage.getItem(REMINDER_SNOOZE_KEY);
        const reference = stored ? new Date(stored).getTime() : null;
        const now = Date.now();
        const daysSince = reference === null ? null : Math.floor((now - reference) / 86400000);
        const snoozedRecently = snoozedAt ? now - new Date(snoozedAt).getTime() < 86400000 : false;

        if (cancelled) return;
        setLastBackupAt(stored);

        if (snoozedRecently) return;
        if (reference === null) {
          setBackupOverdueDays(0);
          setBackupReminderOpen(true);
        } else if (daysSince !== null && daysSince >= BACKUP_REMINDER_DAYS) {
          setBackupOverdueDays(daysSince);
          setBackupReminderOpen(true);
        }
      } catch {
        /* التخزين غير متاح */
      }
    };
    const reminderTimer = window.setTimeout(evaluateBackupReminder, 0);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    /* التقاط أي خطأ غير معالج — لا يُترك عطل صامت أبدًا */
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof DOMException && (reason.name === "QuotaExceededError" || reason.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
        setLowSpaceNoticeOpen(true);
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    /* مراقبة دورية للمساحة كل دقيقتين */
    const spaceTimer = window.setInterval(() => {
      void getStorageStatus().then((status) => {
        if (cancelled) return;
        setStorageStatus(status);
        if (status.supported && status.low) setLowSpaceNoticeOpen(true);
      });
    }, 120000);

    return () => {
      cancelled = true;
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.clearInterval(spaceTimer);
      window.clearTimeout(reminderTimer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (metaPersistTimerRef.current) window.clearTimeout(metaPersistTimerRef.current);

    const snapshot = buildSnapshot();
    pendingMetaRef.current = snapshot;

    const flush = () => {
      const pending = pendingMetaRef.current;
      if (!pending) return;
      pendingMetaRef.current = null;

      if (hasIndexedDb()) {
        const { paymentOperations: _paymentOperations, receiptOperations: _receiptOperations, ...meta } = pending;
        void putStoreValue(META_STORE, META_STATE_KEY, meta).catch((error) => {
          pendingMetaRef.current = pending;
          addToast(storageErrorMessage(error), "error");
        });
        return;
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
      } catch (error) {
        pendingMetaRef.current = pending;
        addToast(storageErrorMessage(error), "error");
      }
    };

    metaPersistTimerRef.current = window.setTimeout(flush, 250);

    /* حفظ فوري عند مغادرة الشاشة أو إغلاق التطبيق — يمنع ضياع آخر تعديل */
    const flushNow = () => {
      if (metaPersistTimerRef.current) window.clearTimeout(metaPersistTimerRef.current);
      flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", flushNow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      if (metaPersistTimerRef.current) window.clearTimeout(metaPersistTimerRef.current);
    };
  }, [hydrated, theme, settings, currencies, accounts, cashboxes, paymentOperations, receiptOperations, nextPaymentId, nextReceiptId, setup]);

  useEffect(() => {
    selectedScreenRef.current = selectedScreen;
  }, [selectedScreen]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;

    window.history.replaceState({ screen: selectedScreenRef.current }, "", window.location.href);

    const onPopState = (event: PopStateEvent) => {
      const nextScreen = (event.state as { screen?: ScreenKey } | null)?.screen ?? "home";
      selectedScreenRef.current = nextScreen;
      setSelectedScreen(nextScreen);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hydrated]);

  const activeCurrencies = useMemo(() => currencies.filter((c) => c.active).map((c) => c.code), [currencies]);

  const accountCodeByName = useMemo(() => new Map(accounts.map((a) => [a.name, a.accountCode])), [accounts]);
  const cashboxById = useMemo(() => new Map(cashboxes.map((c) => [c.id, c])), [cashboxes]);

  const buildNotifyMessage = (operation: OperationItem) => {
    const head = operation.type === "صرف" ? settings.paymentNoticeTemplate : settings.receiptNoticeTemplate;
    const sideWord = operation.type === "صرف" ? "عليكم" : "لكم";
    const accountCurrency = operation.accountCurrency ?? operation.currency;
    const { accountAmount } = getOperationAmounts(operation);
    return `${head}\n${sideWord} مبلغ وقدره ${formatAmount(accountAmount, accountCurrency)}\nوذلك مقابل / ${operation.statement ?? "—"}`;
  };

  const handleTreeSelect = (node: TreeNode) => {
    if (node.action === "open-company") {
      setCompanyModalOpen(true);
      return;
    }
    if (node.screen) navigateToScreen(node.screen);
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

  const printNow = async (operation: OperationItem, includeAttachment: boolean) => {
    const accountCode = accountCodeByName.get(operation.account) ?? "—";
    const cashboxCode = cashboxById.get(operation.cashboxId)?.code ?? String(operation.cashboxId);

    const html = buildVoucherHtml({
      operation,
      settings,
      accountCode,
      cashboxCode,
      includeAttachment,
    });
    const ok = await renderPrintWindow("طباعة سند", html);
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

  /* ==========================================================
     إنشاء سند — الحماية من "شبح البيانات":
     لا تُحدَّث الشاشة ولا يظهر إشعار النجاح إلا بعد نجاح
     الكتابة الفعلية في قاعدة البيانات.
     ========================================================== */
  const createOperation = async (
    type: VoucherType,
    operation: Omit<OperationItem, "id">,
    target: "payment" | "receipt",
  ) => {
    const allowed = await ensureSpaceForWrite();
    if (!allowed) return false;

    const storeName = target === "payment" ? PAYMENT_STORE : RECEIPT_STORE;
    const created: OperationItem = {
      ...operation,
      type,
      id: target === "payment" ? nextPaymentId : nextReceiptId,
    };

    if (hasIndexedDb()) {
      try {
        await putOperationRecord(storeName, created); // ← ننتظر التأكيد أولًا
      } catch (error) {
        addToast(storageErrorMessage(error), "error");
        void refreshStorageStatus();
        return false; // لا تحديث للشاشة ولا إشعار نجاح
      }
    } else {
      try {
        const probe = buildSnapshot();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...probe,
          paymentOperations: target === "payment" ? [created, ...paymentOperations] : paymentOperations,
          receiptOperations: target === "receipt" ? [created, ...receiptOperations] : receiptOperations,
        }));
      } catch (error) {
        addToast(storageErrorMessage(error), "error");
        return false;
      }
    }

    // نجح الحفظ فعليًا → الآن فقط نحدّث الواجهة
    if (target === "payment") {
      setPaymentOperations((prev) => [created, ...prev]);
      setNextPaymentId((n) => n + 1);
    } else {
      setReceiptOperations((prev) => [created, ...prev]);
      setNextReceiptId((n) => n + 1);
    }
    setPostSaveOperation(created);
    setPostSaveModalOpen(true);
    addToast(type === "صرف" ? "تم حفظ سند الصرف" : "تم حفظ سند القبض", "success");
    void refreshStorageStatus();
    return true;
  };

  const updateOperation = async (
    id: number,
    operation: Omit<OperationItem, "id">,
    target: "payment" | "receipt",
  ) => {
    const allowed = await ensureSpaceForWrite();
    if (!allowed) return false;

    const storeName = target === "payment" ? PAYMENT_STORE : RECEIPT_STORE;
    const existing = (target === "payment" ? paymentOperations : receiptOperations).find((item) => item.id === id);
    const updatedOperation: OperationItem = existing ? { ...existing, ...operation } : ({ ...operation, id } as OperationItem);

    if (hasIndexedDb()) {
      try {
        await putOperationRecord(storeName, updatedOperation); // ← ننتظر التأكيد أولًا
      } catch (error) {
        addToast(storageErrorMessage(error), "error");
        void refreshStorageStatus();
        return false;
      }
    }

    const updater = (item: OperationItem) => (item.id === id ? { ...item, ...operation } : item);
    if (target === "payment") setPaymentOperations((prev) => prev.map(updater));
    else setReceiptOperations((prev) => prev.map(updater));
    addToast("تم تعديل السند", "success");
    void refreshStorageStatus();
    return true;
  };

  const deleteOperation = async (id: number, target: "payment" | "receipt") => {
    const storeName = target === "payment" ? PAYMENT_STORE : RECEIPT_STORE;
    if (hasIndexedDb()) {
      try {
        await deleteOperationRecord(storeName, id); // ← ننتظر التأكيد أولًا
      } catch {
        addToast("⛔ تعذر حذف السند من قاعدة البيانات. لم يُحذف السند", "error");
        return false;
      }
    }
    if (target === "payment") setPaymentOperations((prev) => prev.filter((op) => op.id !== id));
    else setReceiptOperations((prev) => prev.filter((op) => op.id !== id));
    addToast(target === "payment" ? "تم حذف سند الصرف" : "تم حذف سند القبض", "success");
    void refreshStorageStatus();
    return true;
  };

  const markBackupDone = () => {
    const stamp = new Date().toISOString();
    try {
      localStorage.setItem(LAST_BACKUP_KEY, stamp);
      localStorage.removeItem(REMINDER_SNOOZE_KEY);
    } catch {
      /* التخزين غير متاح */
    }
    setLastBackupAt(stamp);
    setBackupReminderOpen(false);
  };

  /* نسخة احتياطية مشفّرة AES-256-GCM بكلمة سر يختارها المستخدم */
  const [backupBusy, setBackupBusy] = useState(false);

  const backupNow = async (passphrase?: string) => {
    if (backupBusy) return false;
    setBackupBusy(true);
    try {
      const payload = buildSnapshot();
      // بلا مسافات زائدة: يقلّل الحجم كثيرًا ويمنع نفاد الذاكرة مع آلاف السندات
      const plain = JSON.stringify(payload);
      let fileText = plain;
      let filename = `proof-daftar-backup-${Date.now()}.json`;

      if (passphrase && passphrase.length > 0 && hasWebCrypto()) {
        const encrypted = await encryptWithPassphrase(plain, passphrase);
        fileText = JSON.stringify({ proofDaftar: true, appVersion: APP_VERSION, encrypted });
        filename = `proof-daftar-backup-${Date.now()}.pdbk.json`;
      }

      // إفساح المجال للواجهة قبل عملية الحفظ الثقيلة
      await new Promise((resolve) => setTimeout(resolve, 30));

      let result: SaveResult;

      if (isAndroidApp()) {
        /* الكتابة على دفعات صغيرة إلى ملف مؤقت في الجهاز.
           تمرير عدة ميجابايت في استدعاء واحد عبر جسر Capacitor كان
           يستنفد ذاكرة الجسر فيقتل النظامُ التطبيقَ (توقف وإغلاق مفاجئ). */
        const CHUNK = 512 * 1024; // نصف ميجابايت لكل استدعاء
        await NativeTools.beginStage();
        for (let i = 0; i < fileText.length; i += CHUNK) {
          await NativeTools.appendStage({ chunk: fileText.slice(i, i + CHUNK) });
          // إفساح المجال بين الدفعات حتى لا تتجمد الواجهة
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const staged = await NativeTools.saveStaged({ filename, mimeType: "application/json" });
        result = staged.status;
      } else {
        const blob = new Blob([fileText], { type: "application/json" });
        result = await saveBlobToDevice(blob, filename, "ملف نسخة احتياطية", {
          "application/json": [".json"],
        });
      }

      if (result !== "cancelled") markBackupDone();
      addToast(
        `${saveResultMessage(result, "النسخة الاحتياطية")}${passphrase ? " (مشفّرة)" : ""}`,
        result === "cancelled" ? "error" : "success",
      );
      return result !== "cancelled";
    } catch (error) {
      addToast(
        error instanceof DOMException && error.name === "QuotaExceededError"
          ? "⛔ لا توجد مساحة كافية لإنشاء النسخة الاحتياطية"
          : "تعذر حفظ النسخة الاحتياطية، أعد المحاولة",
        "error",
      );
      return false;
    } finally {
      setBackupBusy(false);
    }
  };

  /* الخطوة الأولى: فحص الملف — إن كان مشفّرًا تُفتح نافذة كلمة السر المنفصلة */
  const beginRestore = async (file: File) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;
      const maybeEncrypted = (raw.encrypted ?? raw) as unknown;

      if (isEncryptedPayload(maybeEncrypted)) {
        setRestoreFileText(text);
        setRestorePassphrase("");
        setRestoreError("");
        setRestorePromptOpen(true);
        return;
      }

      await applyRestore(text);
    } catch {
      addToast("ملف النسخة غير صالح أو تالف", "error");
    }
  };

  const restoreFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await beginRestore(file);
  };

  /* الخطوة الثانية: تنفيذ الاستعادة (بعد فك التشفير إن لزم) */
  const applyRestore = async (text: string, passphrase?: string) => {
    try {
      let raw = JSON.parse(text) as Record<string, unknown>;

      const maybeEncrypted = (raw.encrypted ?? raw) as unknown;
      if (isEncryptedPayload(maybeEncrypted)) {
        if (!passphrase) {
          setRestoreError("أدخل كلمة السر");
          return false;
        }
        try {
          raw = JSON.parse(await decryptWithPassphrase(maybeEncrypted, passphrase)) as Record<string, unknown>;
        } catch {
          setRestoreError("⛔ كلمة السر غير صحيحة");
          return false;
        }
      }

      const parsed = raw as unknown as Partial<AppSnapshot>;

      if (!parsed.settings || !parsed.accounts || !parsed.currencies || !parsed.cashboxes) {
        addToast("ملف النسخة غير صالح", "error");
        setRestoreError("ملف النسخة غير صالح");
        return false;
      }

      // نسخة أمان تلقائية قبل الاستعادة — حماية من فقدان البيانات الحالية
      try {
        const safety = buildSnapshot();
        localStorage.setItem("proof-daftar-pre-restore", JSON.stringify(safety));
      } catch {
        /* المساحة غير كافية لنسخة الأمان */
      }

      const restoredPayments = parsed.paymentOperations ?? [];
      const restoredReceipts = parsed.receiptOperations ?? [];
      const restoredSnapshot: AppSnapshot = {
        storageVersion: STORAGE_VERSION,
        appVersion: APP_VERSION,
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

      // الكتابة أولًا: إن فشلت لا نُحدّث الشاشة ولا نُعيد التشغيل
      try {
        if (hasIndexedDb()) await saveSnapshotToIndexedDb(restoredSnapshot);
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredSnapshot));
      } catch (error) {
        addToast(storageErrorMessage(error), "error");
        setRestoreError("تعذر الحفظ في قاعدة البيانات");
        return false;
      }

      setRestorePromptOpen(false);
      setRestoreFileText(null);
      setRestorePassphrase("");
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
      navigateToScreen("home");
      addToast("تمت استعادة النسخة الاحتياطية، سيتم إغلاق وفتح التطبيق تلقائيا بعد 3 ثواني", "success");
      window.setTimeout(() => {
        if (isAndroidApp()) {
          void NativeTools.restartApp().catch(() => window.location.reload());
          return;
        }
        window.location.reload();
      }, 3000);
      return true;
    } catch {
      addToast("فشلت عملية الاستعادة", "error");
      setRestoreError("فشلت عملية الاستعادة");
      return false;
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

      setSetup((s) => ({ ...s, step: 2, openingCurrency: s.selectedBase }));
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
      openingCurrency: setup.openingBalance ? setup.openingCurrency : setup.selectedBase,
    };

    setCashboxes([firstCashbox]);
    setSetup((s) => ({ ...s, done: true }));
    navigateToScreen("home");
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
              onClick={() => navigateToScreen("home")}
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
          onSelect={navigateToScreen}
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
              openingCurrency: settings.baseCurrency,
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
              openingCurrency: account.openingCurrency ?? settings.baseCurrency,
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
              openingCurrency: settings.baseCurrency,
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
              openingCurrency: box.openingCurrency ?? settings.baseCurrency,
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
          onDeletePayment={(id) => { void deleteOperation(id, "payment"); }}
          onDeleteReceipt={(id) => { void deleteOperation(id, "receipt"); }}
          onNotify={beginNotify}
          onPrint={beginPrint}
          onPrinted={(ok) => addToast(ok ? "تم تجهيز الطباعة" : "فشل تجهيز الطباعة", ok ? "success" : "error")}
          onImageDownload={addToast}
          onToast={addToast}
          isDark={isDark}
        />

        {selectedScreen === "system-backup" ? (
          <section className={`space-y-4 rounded-3xl border p-4 sm:p-6 ${isDark ? "border-slate-700/70 bg-slate-900/60 text-slate-100" : "border-slate-300 bg-white/95 text-slate-900"}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">النسخ الاحتياطي والاستعادة</h2>
              <BackButton onBack={() => navigateToScreen("home")} isDark={isDark} />
            </div>
            {/* حالة الحماية والتخزين */}
            <div className={`grid gap-2 rounded-2xl border p-4 text-sm sm:grid-cols-2 ${isDark ? "border-slate-700 bg-slate-800/60" : "border-slate-300 bg-slate-50"}`}>
              <p>💾 المساحة المستخدمة: <span className="font-bold">{storageStatus.supported ? formatBytes(storageStatus.usage) : "—"}</span></p>
              <p>📊 المساحة المتاحة: <span className={`font-bold ${storageStatus.low ? "text-rose-400" : "text-emerald-400"}`}>{storageStatus.supported ? formatBytes(storageStatus.available) : "—"}</span></p>
              <p className="sm:col-span-2">🕒 آخر نسخة احتياطية: <span className="font-bold">{lastBackupAt ? formatDateTimeNoSeconds(lastBackupAt.replace("T", " ").slice(0, 16)) : "لا توجد نسخة بعد"}</span></p>
            </div>

            {/* كلمة سر تشفير النسخة الجديدة */}
            <div className={`space-y-2 rounded-2xl border p-4 ${isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-300 bg-white"}`}>
              <label className="block text-sm font-bold">كلمة سر تشفير النسخة الاحتياطية (اختيارية)</label>
              <input
                type="password"
                value={backupPassphrase}
                onChange={(e) => setBackupPassphrase(e.target.value)}
                placeholder="اتركها فارغة لنسخة غير مشفّرة"
                className={`w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
              />
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                هذه الخانة لإنشاء نسخة جديدة فقط. عند الاستعادة ستُطلب كلمة السر في نافذة منفصلة.
                ⚠️ نسيان كلمة السر يعني عدم القدرة على استرجاع النسخة نهائيًا.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { void backupNow(backupPassphrase || undefined); }}
                disabled={backupBusy}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {backupBusy ? "جارٍ إنشاء النسخة..." : backupPassphrase ? "نسخ احتياطي مشفّر الآن" : "نسخ احتياطي الآن"}
              </button>
              <button onClick={() => restoreInputRef.current?.click()} className={`rounded-xl border px-4 py-2 text-sm ${isDark ? "border-slate-500 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}>استعادة نسخة</button>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = "";
                  if (file) void beginRestore(file);
                }}
              />
            </div>
          </section>
        ) : null}
      </div>

      {companyModalOpen ? (
        <ModalShell title="بيانات الشركة" onClose={() => setCompanyModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <input dir="rtl" value={settings.companyAr} onChange={(e) => setSettings((s) => ({ ...s, companyAr: e.target.value }))} placeholder="اسم الشركة بالعربي" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-right" : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-right"} />
            <input dir="ltr" value={settings.companyEn} onChange={(e) => setSettings((s) => ({ ...s, companyEn: e.target.value }))} placeholder="Company name" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left" : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-left"} />
            <input value={settings.phone1} onChange={(e) => setSettings((s) => ({ ...s, phone1: e.target.value }))} placeholder="هاتف 1" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input value={settings.phone2} onChange={(e) => setSettings((s) => ({ ...s, phone2: e.target.value }))} placeholder="هاتف 2" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <input dir="ltr" value={settings.reserve1} onChange={(e) => setSettings((s) => ({ ...s, reserve1: e.target.value }))} placeholder="Info line (EN)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-left" : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-left"} />
            <input dir="rtl" value={settings.reserve2} onChange={(e) => setSettings((s) => ({ ...s, reserve2: e.target.value }))} placeholder="سطر معلومات (AR)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-right" : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-right"} />
            <label className={`md:col-span-2 rounded-xl border border-dashed px-3 py-2 text-sm ${isDark ? "border-slate-600 bg-slate-800 text-slate-300" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
              شعار الشركة
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const original = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result ?? ""));
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                  });
                  setSettings((s) => ({ ...s, companyLogoUrl: original }));
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

      {accountModalOpen ? (
        <ModalShell title={accountForm.mode === "create" ? "إضافة حساب" : "تعديل حساب"} onClose={() => setAccountModalOpen(false)} isDark={isDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <select value={accountForm.type} onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value as AccountType }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}><option>عملاء</option><option>موردين</option><option>بنك</option><option>موظفين</option></select>
            <input value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم الحساب" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input value={accountForm.phone} onChange={(e) => setAccountForm((f) => ({ ...f, phone: e.target.value }))} placeholder="رقم الهاتف" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
              <button type="button" onClick={pickAccountPhone} className={`rounded-xl border px-3 py-2 text-sm font-bold ${isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-700"}`}>
                الأسماء
              </button>
            </div>
            <input value={accountForm.openingBalance} onChange={(e) => setAccountForm((f) => ({ ...f, openingBalance: e.target.value }))} placeholder="رصيد افتتاحي (اختياري)" className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"} />
            <select value={accountForm.openingSide} onChange={(e) => setAccountForm((f) => ({ ...f, openingSide: e.target.value as BalanceSide }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}><option>له</option><option>عليه</option></select>
            <select value={accountForm.openingCurrency} onChange={(e) => setAccountForm((f) => ({ ...f, openingCurrency: e.target.value as CurrencyCode }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}>
              {currencies.filter((c) => c.active).map((currency) => <option key={`acc-open-cur-${currency.code}`} value={currency.code}>{currency.code}</option>)}
            </select>
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
                      openingCurrency: accountForm.openingBalance ? accountForm.openingCurrency : undefined,
                    },
                  ]);
                  addToast("تم إضافة الحساب", "success");
                } else {
                  setAccounts((prev) => prev.map((a) => a.id === accountForm.id ? { ...a, type: accountForm.type, name: accountForm.name, phone: accountForm.phone, enabledCurrencies: accountForm.enabledCurrencies, openingBalance: accountForm.openingBalance ? Number(accountForm.openingBalance) : undefined, openingSide: accountForm.openingBalance ? accountForm.openingSide : undefined, openingCurrency: accountForm.openingBalance ? accountForm.openingCurrency : undefined } : a));
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
            <select value={cashboxForm.openingCurrency} onChange={(e) => setCashboxForm((f) => ({ ...f, openingCurrency: e.target.value as CurrencyCode }))} className={isDark ? "rounded-xl border border-slate-600 bg-slate-800 px-3 py-2" : "rounded-xl border border-slate-300 bg-white px-3 py-2"}>
              {currencies.filter((c) => c.active).map((currency) => <option key={`box-open-cur-${currency.code}`} value={currency.code}>{currency.code}</option>)}
            </select>
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
                  setCashboxes((prev) => [...prev, { id: Date.now(), code: nextCode, name: cashboxForm.name, enabledCurrencies: cashboxForm.enabledCurrencies, openingBalance: cashboxForm.openingBalance ? Number(cashboxForm.openingBalance) : undefined, openingSide: cashboxForm.openingBalance ? cashboxForm.openingSide : undefined, openingCurrency: cashboxForm.openingBalance ? cashboxForm.openingCurrency : undefined }]);
                  addToast("تم إضافة الصندوق", "success");
                } else {
                  setCashboxes((prev) => prev.map((c) => c.id === cashboxForm.id ? { ...c, name: cashboxForm.name, enabledCurrencies: cashboxForm.enabledCurrencies, openingBalance: cashboxForm.openingBalance ? Number(cashboxForm.openingBalance) : undefined, openingSide: cashboxForm.openingBalance ? cashboxForm.openingSide : undefined, openingCurrency: cashboxForm.openingBalance ? cashboxForm.openingCurrency : undefined } : c));
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

      {/* ===== نافذة كلمة سر الاستعادة (منفصلة) ===== */}
      {restorePromptOpen ? (
        <div className="fixed inset-0 z-[62] flex items-center justify-center bg-slate-950/85 p-4">
          <div className={`w-full max-w-md rounded-3xl border-2 p-6 shadow-2xl ${isDark ? "border-cyan-500/60 bg-slate-900 text-slate-100" : "border-cyan-400 bg-white text-slate-900"}`}>
            <div className="text-center">
              <div className="mb-2 text-5xl">🔐</div>
              <h2 className="text-xl font-extrabold text-cyan-400">نسخة احتياطية مشفّرة</h2>
              <p className="mt-2 text-sm leading-relaxed">
                هذا الملف محمي بكلمة سر. أدخل كلمة السر التي استخدمتها عند إنشاء هذه النسخة.
              </p>
            </div>

            <input
              type="password"
              autoFocus
              value={restorePassphrase}
              onChange={(e) => { setRestorePassphrase(e.target.value); setRestoreError(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && restorePassphrase && !restoreBusy && restoreFileText) {
                  setRestoreBusy(true);
                  void applyRestore(restoreFileText, restorePassphrase).finally(() => setRestoreBusy(false));
                }
              }}
              placeholder="كلمة سر النسخة الاحتياطية"
              className={`mt-4 w-full rounded-xl border px-3 py-3 text-center text-base ${isDark ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
            />

            {restoreError ? <p className="mt-2 text-center text-sm font-bold text-rose-400">{restoreError}</p> : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => {
                  if (!restoreFileText || !restorePassphrase) { setRestoreError("أدخل كلمة السر"); return; }
                  setRestoreBusy(true);
                  void applyRestore(restoreFileText, restorePassphrase).finally(() => setRestoreBusy(false));
                }}
                disabled={restoreBusy}
                className="rounded-2xl bg-cyan-500 px-4 py-3 text-base font-extrabold text-cyan-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
              >
                {restoreBusy ? "جارٍ فك التشفير..." : "استعادة"}
              </button>
              <button
                onClick={() => { setRestorePromptOpen(false); setRestoreFileText(null); setRestorePassphrase(""); setRestoreError(""); }}
                disabled={restoreBusy}
                className={`rounded-2xl border px-4 py-3 text-base font-bold ${isDark ? "border-slate-600 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== شعار تذكير النسخ الاحتياطي كل 7 أيام ===== */}
      {backupReminderOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4">
          <div className={`w-full max-w-lg rounded-3xl border-2 p-6 shadow-2xl ${isDark ? "border-amber-500/70 bg-slate-900 text-slate-100" : "border-amber-400 bg-white text-slate-900"}`}>
            <div className="text-center">
              <div className="mx-auto mb-3 text-6xl">🛡️</div>
              <h2 className="text-2xl font-extrabold text-amber-400">نسخة احتياطية مطلوبة</h2>
              <p className="mt-3 text-base leading-relaxed">
                {backupOverdueDays > 0
                  ? `مضى ${backupOverdueDays} يومًا منذ آخر نسخة احتياطية.`
                  : "لم تقم بأخذ أي نسخة احتياطية حتى الآن."}
              </p>
              <div className={`mt-4 rounded-2xl border p-4 text-sm leading-relaxed ${isDark ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                <p className="font-bold">⚠️ بياناتك محفوظة على هذا الجهاز فقط.</p>
                <p className="mt-1">
                  في حال ضياع الهاتف أو تلفه أو إلغاء تثبيت التطبيق، ستفقد جميع السندات والحسابات نهائيًا.
                  النسخة الاحتياطية هي وسيلتك الوحيدة لاستعادة بياناتك.
                </p>
              </div>
              {lastBackupAt ? (
                <p className="mt-3 text-xs opacity-70">آخر نسخة احتياطية: {formatDateTimeNoSeconds(lastBackupAt.replace("T", " ").slice(0, 16))}</p>
              ) : null}
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => {
                  setBackupReminderOpen(false);
                  navigateToScreen("system-backup");
                }}
                className="rounded-2xl bg-amber-500 px-4 py-3 text-base font-extrabold text-amber-950 shadow-lg"
              >
                النسخ الآن
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.setItem(REMINDER_SNOOZE_KEY, new Date().toISOString());
                  } catch {
                    /* التخزين غير متاح */
                  }
                  setBackupReminderOpen(false);
                }}
                className={`rounded-2xl border px-4 py-3 text-base font-bold ${isDark ? "border-slate-600 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}
              >
                التخطي الآن والتذكير لاحقًا
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== تنبيه امتلاء ذاكرة الهاتف ===== */}
      {lowSpaceNoticeOpen ? (
        <div className="fixed inset-0 z-[61] flex items-center justify-center bg-slate-950/85 p-4">
          <div className={`w-full max-w-lg rounded-3xl border-2 p-6 shadow-2xl ${isDark ? "border-rose-500/70 bg-slate-900 text-slate-100" : "border-rose-400 bg-white text-slate-900"}`}>
            <div className="text-center">
              <div className="mx-auto mb-3 text-6xl">🚨</div>
              <h2 className="text-2xl font-extrabold text-rose-400">ذاكرة الهاتف ممتلئة</h2>
              <p className="mt-3 text-base leading-relaxed">
                المساحة المتاحة للتطبيق أقل من 200 ميجابايت
                {storageStatus.supported ? ` (المتاح حاليًا: ${formatBytes(storageStatus.available)})` : ""}.
              </p>
              <div className={`mt-4 rounded-2xl border p-4 text-sm leading-relaxed ${isDark ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-rose-300 bg-rose-50 text-rose-900"}`}>
                <p className="font-bold">⛔ لا يمكن إضافة أي سند جديد.</p>
                <p className="mt-1">
                  خذ نسخة احتياطية من بياناتك فورًا، ثم أفرغ مساحة من ذاكرة الهاتف
                  (احذف صورًا أو ملفات أو تطبيقات غير مستخدمة) لتتمكن من متابعة العمل.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => {
                  setLowSpaceNoticeOpen(false);
                  navigateToScreen("system-backup");
                }}
                className="rounded-2xl bg-rose-500 px-4 py-3 text-base font-extrabold text-white shadow-lg"
              >
                النسخ الاحتياطي الآن
              </button>
              <button
                onClick={() => { setLowSpaceNoticeOpen(false); void refreshStorageStatus(); }}
                className={`rounded-2xl border px-4 py-3 text-base font-bold ${isDark ? "border-slate-600 bg-slate-800 text-slate-200" : "border-slate-300 bg-white text-slate-700"}`}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PrintOverlay />
      <Toasts toasts={toasts} />
    </main>
  );
}
