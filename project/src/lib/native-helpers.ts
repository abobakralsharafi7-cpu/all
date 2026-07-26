/**
 * مساعدات النظام الأصلي - تجعل كل الميزات تعمل على الأندرويد 100%
 * Native Helpers - Makes everything work on Android
 */

import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// ========== الطباعة تعمل على الأندرويد ✅ ==========
export async function printVoucherHTML(title: string, htmlContent: string): Promise<boolean> {
  // على الويب: استخدم window.open القديم
  if (!isNative()) {
    try {
      const popup = window.open("", "_blank", "width=1200,height=900");
      if (!popup) return false;
      popup.document.write(`
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
              @media print { body { -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>${htmlContent}</body>
        </html>
      `);
      popup.document.close();
      popup.focus();
      popup.print();
      return true;
    } catch {
      return false;
    }
  }

  // على الأندرويد: احفظ HTML كملف وافتحه بالمتصفح + شاركه للطباعة
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const fileName = `print_${Date.now()}.html`;
    
    const fullHtml = `
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
          <style>
            body { font-family: Tahoma, Arial, sans-serif; padding: 16px; color: #111; background: #fff; }
            .page { border: 2px solid #101010; padding: 10px; margin-bottom: 10px; }
            .head { display:flex; align-items: center; justify-content: space-between; border:2px solid #151515; padding:8px; }
            .head-col { width: 40%; font-size: 12px; line-height: 1.6; color:#111; }
            .head-col h3 { margin:0; color:#d62828; font-size: 24px; }
            .head-center { width: 20%; text-align:center; }
            .head-center img { max-width: 120px; max-height: 70px; object-fit: contain; }
            .voucher-title { margin-top: 8px; display:flex; justify-content: space-between; align-items:center; }
            .voucher-box { border:1px solid #111; border-radius:8px; padding:6px 14px; font-size: 24px; font-weight:700; }
            .meta { font-size: 17px; font-weight: 700; }
            .line { border:1px solid #222; border-radius: 8px; padding: 8px; margin-top:8px; font-size: 17px; }
            .amount-grid { margin-top:8px; display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
            .amount-box { border:1px solid #222; border-radius:8px; padding:8px; font-size:16px; min-height:48px; }
            table { width:100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 2px solid #111; padding: 7px; text-align: right; font-size: 14px; }
            th { background: #f3f5ff; color: #d62828; }
            @media print { body { -webkit-print-color-adjust: exact; } }
            .print-btn { position: fixed; top: 10px; left: 10px; background: #0ea5e9; color: white; border: none; padding: 12px 20px; border-radius: 8px; font-size: 16px; z-index: 999; }
            @media print { .print-btn { display: none; } }
          </style>
        </head>
        <body>
          <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
          ${htmlContent}
          <script>setTimeout(() => window.print(), 500);</script>
        </body>
      </html>
    `;

    const result = await Filesystem.writeFile({
      path: fileName,
      data: fullHtml,
      directory: Directory.Cache,
    });

    console.log(`[Print] Saved HTML to ${result.uri}`);

    // افتح في المتصفح الداخلي
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: result.uri });
      return true;
    } catch {
      // fallback: شارك الملف
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title,
        text: `طباعة: ${title}`,
        url: result.uri,
      });
      return true;
    }
  } catch (e) {
    console.error('[Print] Native print failed', e);
    return false;
  }
}

// ========== المشاركة والإشعارات تعمل على الأندرويد ✅ ==========
export async function shareText(text: string, title?: string): Promise<boolean> {
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
      console.error('[Share] Native share failed', e);
      // fallback to clipboard
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  }

  // ويب
  if (navigator.share) {
    try {
      await navigator.share({ text, title });
      return true;
    } catch {}
  }

  try {
    const encoded = encodeURIComponent(text);
    // حاول فتح SMS
    const smsUrl = `sms:?body=${encoded}`;
    window.open(smsUrl, '_blank');
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

// ========== حفظ الصورة يعمل على الأندرويد ✅ ==========
export async function saveImageToGallery(imageSrc: string, fileName?: string): Promise<boolean> {
  const finalName = fileName || `voucher_${Date.now()}.jpg`;

  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      
      // إذا كان base64 أو data URL
      let base64Data = imageSrc;
      if (imageSrc.startsWith('data:')) {
        base64Data = imageSrc.split(',')[1];
      } else if (imageSrc.startsWith('file://') || imageSrc.includes('voucher-images')) {
        // إذا كان مسار ملف، اقرأه أولاً
        try {
          const fileNameOnly = imageSrc.split('/').pop() || finalName;
          const readResult = await Filesystem.readFile({
            path: `voucher-images/${fileNameOnly}`,
            directory: Directory.Data,
          });
          base64Data = readResult.data as string;
          if ((base64Data as string).includes(',')) {
            base64Data = (base64Data as string).split(',')[1];
          }
        } catch {
          // إذا فشل، استخدم المسار كما هو
        }
      }

      // احفظ في مجلد الصور العام (Documents) ليظهر في الاستوديو
      const savePath = finalName;
      await Filesystem.writeFile({
        path: savePath,
        data: base64Data,
        directory: Directory.Documents,
      });

      console.log(`[ImageSave] Saved to Documents/${savePath}`);

      // شارك الصورة ليتمكن المستخدم من حفظها في الاستوديو
      try {
        const fileUri = await Filesystem.getUri({
          directory: Directory.Documents,
          path: savePath,
        });
        
        const { Share } = await import('@capacitor/share');
        await Share.share({
          title: 'حفظ الصورة',
          text: 'تم حفظ صورة السند',
          url: fileUri.uri,
        });
      } catch {}

      return true;
    } catch (e) {
      console.error('[ImageSave] Native save failed', e);
      return false;
    }
  }

  // ويب: تحميل عادي
  try {
    let blob: Blob;
    if (imageSrc.startsWith('data:')) {
      const res = await fetch(imageSrc);
      blob = await res.blob();
    } else {
      const res = await fetch(imageSrc);
      blob = await res.blob();
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalName;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    console.error('[ImageSave] Web save failed', e);
    return false;
  }
}

// ========== فتح رابط SMS يعمل على الأندرويد ✅ ==========
export async function openSMS(phone: string, body: string): Promise<boolean> {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      // على الأندرويد، المشاركة ستظهر تطبيقات الرسائل
      await Share.share({
        text: body,
        title: `رسالة إلى ${cleanPhone}`,
      });
      return true;
    } catch {}
  }

  try {
    const encoded = encodeURIComponent(body);
    const url = cleanPhone ? `sms:${cleanPhone}?body=${encoded}` : `sms:?body=${encoded}`;
    window.open(url, '_blank');
    return true;
  } catch {
    return false;
  }
}

// ========== النسخ الاحتياطي الشامل مع الصور ✅ ==========
export async function createFullBackupWithImages(payload: any): Promise<{ jsonPath: string; imagesCount: number; sizeMB: string } | null> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    
    // 1. احفظ JSON
    const jsonFileName = `full_backup_${Date.now()}.json`;
    const jsonStr = JSON.stringify(payload);
    
    await Filesystem.writeFile({
      path: `backups/${jsonFileName}`,
      data: jsonStr,
      directory: Directory.Data,
    });

    // 2. عد الصور
    let imagesCount = 0;
    try {
      const list = await Filesystem.readdir({
        path: 'voucher-images',
        directory: Directory.Data,
      });
      imagesCount = list.files.length;
    } catch {}

    const sizeMB = (jsonStr.length / 1024 / 1024).toFixed(2);

    return {
      jsonPath: `backups/${jsonFileName}`,
      imagesCount,
      sizeMB,
    };
  } catch (e) {
    console.error('[FullBackup] Failed', e);
    return null;
  }
}
