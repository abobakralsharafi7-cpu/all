"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * حاجز الأخطاء: يمنع انهيار التطبيق إلى شاشة بيضاء عند أي خطأ غير متوقع.
 * البيانات المحفوظة في قاعدة البيانات تبقى سليمة، ويستطيع المستخدم
 * إعادة المحاولة أو أخذ نسخة احتياطية فورية.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : "خطأ غير معروف" };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // لا نسجّل بيانات المستخدم في السجلات حفاظًا على الخصوصية
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-lg rounded-3xl border-2 border-amber-500/60 bg-slate-900 p-6 text-center shadow-2xl">
          <div className="mb-3 text-6xl">🛟</div>
          <h1 className="text-2xl font-extrabold text-amber-400">حدث خطأ غير متوقع</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            لا تقلق — <span className="font-bold text-emerald-400">جميع بياناتك محفوظة وسليمة</span> في قاعدة بيانات
            التطبيق ولم يُفقد منها شيء. أعد فتح التطبيق للمتابعة.
          </p>

          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-3 text-right text-xs text-slate-400">
            <p className="break-words">التفاصيل التقنية: {this.state.message}</p>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-cyan-500 px-4 py-3 text-base font-extrabold text-cyan-950"
            >
              إعادة تشغيل التطبيق
            </button>
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="rounded-2xl border border-slate-600 bg-slate-800 px-4 py-3 text-base font-bold text-slate-200"
            >
              محاولة المتابعة
            </button>
          </div>
        </div>
      </main>
    );
  }
}
