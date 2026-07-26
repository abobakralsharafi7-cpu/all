"use client";

import { useEffect, useState } from "react";
import { unlimitedImageStorage } from "@/lib/unlimited-storage";

interface Props {
  src: string | undefined;
  alt?: string;
  className?: string;
  onClick?: () => void;
  fallback?: string;
}

// مكون صور لا نهائي - يحل مشكلة عرض الصور المحفوظة كملفات
export function UnlimitedImage({ src, alt = "صورة", className = "", onClick, fallback }: Props) {
  const [displayUrl, setDisplayUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      try {
        // إذا كان base64 مباشرة
        if (src.startsWith("data:")) {
          if (!cancelled) setDisplayUrl(src);
          return;
        }

        // إذا كان رابط http/https
        if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:")) {
          if (!cancelled) setDisplayUrl(src);
          return;
        }

        // إذا كان مسار ملف أو مفتاح idb - حوله لعرض
        const resolved = await unlimitedImageStorage.getDisplayUrl(src);
        if (!cancelled) {
          setDisplayUrl(resolved || fallback || "");
        }
      } catch (e) {
        console.warn("[UnlimitedImage] Failed to resolve", src, e);
        if (!cancelled) {
          setError(true);
          setDisplayUrl(fallback || "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, fallback]);

  if (!src) return null;

  if (loading) {
    return (
      <div className={`animate-pulse bg-slate-700/50 rounded-xl grid place-items-center ${className}`}>
        <span className="text-xs opacity-50">⏳ تحميل...</span>
      </div>
    );
  }

  if (error || !displayUrl) {
    return (
      <div className={`bg-rose-500/10 border border-rose-500/20 rounded-xl grid place-items-center p-2 ${className}`}>
        <span className="text-xs text-rose-300">⚠️ تعذر تحميل الصورة</span>
      </div>
    );
  }

  return (
    <img
      src={displayUrl}
      alt={alt}
      className={className}
      onClick={onClick}
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

// نسخة مصغرة للصور المصغرة (Thumbnails) - للأداء مع 50k صورة
export function UnlimitedThumbnail({ src, alt, className, onClick }: Props) {
  // للصور المصغرة، نستخدم نفس المكون لكن مع تحميل كسول وافتراضي أقل
  return <UnlimitedImage src={src} alt={alt} className={className} onClick={onClick} />;
}
