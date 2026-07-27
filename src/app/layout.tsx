import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proof Daftar | بروف دفتر",
  description: "تطبيق محاسبي محلي لإدارة سندات الصرف والقبض والحسابات والتقارير مع نسخ احتياطي يشمل الصور.",
  applicationName: "Proof Daftar",
  authors: [{ name: "Professor" }],
  creator: "Professor",
  manifest: "/manifest.json",
  icons: {
    icon: "/app-logo.png",
    apple: "/app-logo.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
