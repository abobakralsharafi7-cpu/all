export type ScreenKey =
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

export type VoucherType = "صرف" | "قبض";
export type SortOrder = "newest" | "oldest";
export type ReportMode = "تحليلي" | "إجمالي";
export type AccountType = "عملاء" | "موردين" | "بنك" | "موظفين";
export type BalanceSide = "له" | "عليه";
export type ThemeMode = "dark" | "light";

export type CurrencyCode = "YER" | "SAR" | "USD" | "AED" | "EUR";

export type CurrencyRecord = {
  code: CurrencyCode;
  name: string;
  rateToBase: number | null;
  active: boolean;
};

export type AccountRecord = {
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

export type CashboxRecord = {
  id: number;
  code: string;
  name: string;
  enabledCurrencies: CurrencyCode[];
  openingBalance?: number;
  openingSide?: BalanceSide;
};

export type OperationItem = {
  id: number;
  type: VoucherType;
  account: string;
  cashboxId: number;
  amount: number;
  currency: CurrencyCode;
  exchangeRate?: number;
  statement?: string;
  reference?: string;
  datetime: string;
  imageUrl?: string;
};

export type OperationForm = {
  account: string;
  cashboxId: number;
  amount: string;
  currency: CurrencyCode;
  exchangeRate: string;
  statement: string;
  reference: string;
  datetimeInput: string;
  imageUrl?: string;
};

export type AppSettings = {
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

export type TreeNode = {
  id: string;
  label: string;
  screen?: ScreenKey;
  action?: "open-company" | "open-labels";
  children?: TreeNode[];
};

export type Toast = {
  id: number;
  message: string;
  type: "success" | "error";
};

export type SetupState = {
  done: boolean;
  step: 1 | 2;
  selectedBase: CurrencyCode;
  cashboxName: string;
  openingBalance: string;
  openingSide: BalanceSide;
};
