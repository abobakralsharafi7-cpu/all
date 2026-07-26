"use client";

import { useCallback, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import type { OperationItem } from "@/app/page-types"; // سننشئ هذا النوع أو نستخدم any مؤقتاً
import { UnlimitedThumbnail } from "./UnlimitedImage";

interface Props {
  items: any[]; // OperationItem[]
  cashboxById: Map<number, any>;
  onEdit: (item: any) => void;
  onDelete: (id: number) => void;
  onNotify: (item: any) => void;
  onPrint: (item: any) => void;
  isDark: boolean;
}

// مكون قائمة افتراضية - يعرض فقط العناصر الظاهرة على الشاشة (حتى 50k بدون بطء)
export function VirtualVoucherList({ items, cashboxById, onEdit, onDelete, onNotify, onPrint, isDark }: Props) {
  // استخدام useCallback لمنع إعادة الرسم
  const Row = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return null;
      const box = cashboxById.get(item.cashboxId);

      return (
        <div className="p-1">
          <article
            className={`rounded-2xl border p-3 mx-1 ${
              isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  #{item.id} - {item.account}
                </p>
                <p className={`text-sm truncate ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {item.statement || "—"}
                </p>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {item.datetime} | صندوق: #{box?.code ?? item.cashboxId}
                  {item.reference ? ` | مرجع: ${item.reference}` : ""}
                </p>
                {item.imageUrl ? (
                  <div className="mt-2">
                    <UnlimitedThumbnail
                      src={item.imageUrl}
                      alt={`مرفق ${item.id}`}
                      className="h-16 w-16 rounded-lg object-cover border"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => onEdit(item)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    isDark ? "border-slate-500 bg-slate-700" : "border-slate-300 bg-white"
                  }`}
                >
                  تعديل
                </button>
                <button
                  onClick={() => onNotify(item)}
                  className="rounded-lg bg-violet-500/30 px-2 py-1 text-xs text-violet-100"
                >
                  إشعار
                </button>
                <button
                  onClick={() => onPrint(item)}
                  className="rounded-lg bg-cyan-500/30 px-2 py-1 text-xs text-cyan-100"
                >
                  طباعة
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="rounded-lg bg-rose-500/30 px-2 py-1 text-xs text-rose-100"
                >
                  حذف
                </button>
              </div>
            </div>
            <div className="mt-2 text-sm font-bold text-cyan-300">
              {Number(item.amount).toLocaleString()} {item.currency}
            </div>
          </article>
        </div>
      );
    },
    [items, cashboxById, isDark, onEdit, onDelete, onNotify, onPrint]
  );

  if (items.length === 0) {
    return (
      <p
        className={`rounded-xl border border-dashed p-4 text-center text-sm ${
          isDark ? "border-slate-600 bg-slate-800/60 text-slate-400" : "border-slate-300 bg-slate-50 text-slate-500"
        }`}
      >
        لا توجد نتائج.
      </p>
    );
  }

  // إذا كان العدد أقل من 100، اعرض عادي بدون virtualization (أسرع)
  if (items.length < 100) {
    return (
      <div className="space-y-2">
        {items.map((_, i) => (
          <div key={items[i].id || i}>{Row(i)}</div>
        ))}
      </div>
    );
  }

  // إذا كان العدد كبير (حتى 50k)، استخدم Virtual Scroll
  return (
    <div className={`rounded-xl border ${isDark ? "border-slate-700" : "border-slate-300"}`} style={{ height: "65vh" }}>
      <Virtuoso
        totalCount={items.length}
        itemContent={(index) => Row(index)}
        overscan={200}
        increaseViewportBy={{ top: 300, bottom: 300 }}
      />
    </div>
  );
}

// مكون للصور مع Virtual Scroll - لـ 50k صورة
export function VirtualImageGrid({ items, isDark }: { items: any[]; isDark: boolean }) {
  const Row = useCallback(
    (index: number) => {
      const row = items[index];
      if (!row) return null;

      return (
        <article
          className={`rounded-2xl border p-3 m-1 ${
            isDark ? "border-slate-700 bg-slate-800/70" : "border-slate-300 bg-slate-50"
          }`}
        >
          <p className="text-sm font-bold">
            سند #{row.id} - {row.type}
          </p>
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {row.datetime} | {row.account}
          </p>
          <UnlimitedThumbnail
            src={row.imageUrl}
            alt={`صورة ${row.id}`}
            className="mt-2 h-44 w-full rounded-xl object-cover border cursor-zoom-in"
          />
        </article>
      );
    },
    [items, isDark]
  );

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-center text-sm border-slate-600 bg-slate-800/50 text-slate-400">
        لا توجد صور مطابقة.
      </p>
    );
  }

  if (items.length < 30) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((_, i) => (
          <div key={i}>{Row(i)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${isDark ? "border-slate-700" : "border-slate-300"}`} style={{ height: "70vh" }}>
      <Virtuoso
        totalCount={items.length}
        itemContent={(index) => <div className="p-2">{Row(index)}</div>}
        overscan={100}
      />
    </div>
  );
}
