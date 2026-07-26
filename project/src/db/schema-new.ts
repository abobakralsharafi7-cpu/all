/**
 * Drizzle Schema مقترح لتطبيق بروف دفتر
 * عندما تريد الانتقال من Offline (IndexedDB) إلى Online (Postgres)
 * 
 * انسخ هذا الملف إلى schema.ts بعد المراجعة
 */

import { pgTable, serial, varchar, integer, timestamp, boolean, text, doublePrecision, pgEnum } from 'drizzle-orm/pg-core';

export const accountTypeEnum = pgEnum('account_type', ['عملاء', 'موردين', 'بنك', 'موظفين']);
export const voucherTypeEnum = pgEnum('voucher_type', ['صرف', 'قبض']);
export const balanceSideEnum = pgEnum('balance_side', ['له', 'عليه']);
export const currencyCodeEnum = pgEnum('currency_code', ['YER', 'SAR', 'USD', 'AED', 'EUR']);

export const currencies = pgTable('currencies', {
  id: serial('id').primaryKey(),
  code: currencyCodeEnum('code').notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  rateToBase: doublePrecision('rate_to_base'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  type: accountTypeEnum('type').notNull(),
  sectionCode: varchar('section_code', { length: 10 }).notNull(), // 11,22,33,44
  serialNumber: integer('serial_number').notNull(),
  accountCode: varchar('account_code', { length: 20 }).notNull().unique(), // 110001
  name: varchar('name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  enabledCurrencies: text('enabled_currencies').notNull(), // JSON array
  openingBalance: doublePrecision('opening_balance'),
  openingSide: balanceSideEnum('opening_side'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cashboxes = pgTable('cashboxes', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  enabledCurrencies: text('enabled_currencies').notNull(), // JSON
  openingBalance: doublePrecision('opening_balance'),
  openingSide: balanceSideEnum('opening_side'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),
  type: voucherTypeEnum('type').notNull(),
  accountId: integer('account_id').references(() => accounts.id),
  accountName: varchar('account_name', { length: 200 }).notNull(), // denormalized للسرعة في التقارير
  cashboxId: integer('cashbox_id').references(() => cashboxes.id),
  amount: doublePrecision('amount').notNull(),
  currency: currencyCodeEnum('currency').notNull(),
  exchangeRate: doublePrecision('exchange_rate'),
  statement: text('statement'),
  reference: varchar('reference', { length: 100 }),
  datetime: timestamp('datetime').notNull(),
  imageUrl: text('image_url'), // سيكون مسار Filesystem في الموبايل أو URL في السيرفر
  createdAt: timestamp('created_at').defaultNow(),
});

export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyAr: varchar('company_ar', { length: 300 }).notNull(),
  companyEn: varchar('company_en', { length: 300 }).notNull(),
  phone1: varchar('phone1', { length: 50 }),
  phone2: varchar('phone2', { length: 50 }),
  reserve1: text('reserve1'),
  reserve2: text('reserve2'),
  companyLogoUrl: text('company_logo_url'),
  paymentVoucherLabel: varchar('payment_voucher_label', { length: 100 }).notNull(),
  receiptVoucherLabel: varchar('receipt_voucher_label', { length: 100 }).notNull(),
  paymentNoticeTemplate: text('payment_notice_template'),
  receiptNoticeTemplate: text('receipt_notice_template'),
  baseCurrency: currencyCodeEnum('base_currency').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
