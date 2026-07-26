/**
 * مدير الملفات - يحل مشكلة تخزين الصور كـ Base64 في localStorage
 * يستخدم Capacitor Filesystem في الموبايل، وIndexedDB في الويب
 */

import { Capacitor } from '@capacitor/core';

// تحقق هل نحن في تطبيق Native
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * حفظ الصورة - في Native يحفظها في مجلد التطبيق، في الويب يعيد Base64 مضغوط
 */
export async function saveImage(base64DataUrl: string, fileName?: string): Promise<string> {
  const finalName = fileName || `voucher_${Date.now()}.jpg`;

  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      // إزالة prefix data:image/jpeg;base64,
      const base64Data = base64DataUrl.split(',')[1] || base64DataUrl;

      const result = await Filesystem.writeFile({
        path: finalName,
        data: base64Data,
        directory: Directory.Data,
      });

      // يعيد مسار الملف Native
      return result.uri;
    } catch (e) {
      console.error('Filesystem save error, fallback to base64', e);
      return base64DataUrl;
    }
  }

  // في الويب: أعد الـ base64 كما هو (سيُحفظ في IndexedDB وليس localStorage)
  return base64DataUrl;
}

/**
 * قراءة الصورة من التخزين
 */
export async function readImage(pathOrBase64: string): Promise<string> {
  if (!pathOrBase64) return '';

  // إذا كان base64 بالفعل
  if (pathOrBase64.startsWith('data:')) {
    return pathOrBase64;
  }

  // إذا كان مسار Native
  if (isNative() && (pathOrBase64.startsWith('file://') || pathOrBase64.includes('/'))) {
    try {
      const { Filesystem } = await import('@capacitor/filesystem');
      // استخراج اسم الملف من المسار
      const fileName = pathOrBase64.split('/').pop() || pathOrBase64;
      const { Directory } = await import('@capacitor/filesystem');
      
      const result = await Filesystem.readFile({
        path: fileName,
        directory: Directory.Data,
      });

      return `data:image/jpeg;base64,${result.data as string}`;
    } catch (e) {
      console.error('Filesystem read error', e);
      return '';
    }
  }

  return pathOrBase64;
}

/**
 * ضغط الصورة قبل الحفظ - نفس دالتك الحالية لكن محسنة
 */
export async function compressImageFile(file: File, maxWidth = 1280, quality = 0.78): Promise<string> {
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
  const compressedBase64 = canvas.toDataURL("image/jpeg", quality);

  // في الموبايل، احفظه في Filesystem مباشرة
  if (isNative()) {
    return await saveImage(compressedBase64);
  }

  return compressedBase64;
}

/**
 * مشاركة ملف أو نص
 */
export async function shareContent(text: string, title?: string) {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: title || 'بروف دفتر',
        text,
        dialogTitle: 'مشاركة عبر',
      });
      return true;
    } catch (e) {
      console.error('Share error', e);
      return false;
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ text, title });
      return true;
    } catch {}
  }

  // fallback نسخ
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
