/**
 * نظام التخزين اللامحدود - محلي 100% حسب ذاكرة الهاتف
 * Proof Daftar - Unlimited Local Storage
 * 
 * الفكرة:
 * - في تطبيق الأندرويد (Capacitor Native): يحفظ البيانات كملف JSON في مجلد التطبيق الخاص
 *   المسار: /data/data/com.proofdaftar.app/files/
 *   هذا المجلد غير محدود، محدود فقط بمساحة الهاتف الفارغة
 *   مثلاً: هاتف 64GB فاضي 20GB = يمكنك حفظ 20GB بيانات محاسبية (ملايين السندات)
 * 
 * - في المتصفح / PWA: يستخدم IndexedDB مع طلب تخزين دائم persistent
 *   المتصفحات الحديثة تسمح حتى 60% من مساحة القرص (مثلاً 100GB على لابتوب)
 * 
 * - الصور: لا تُحفظ داخل JSON أبداً، تُحفظ كملفات منفصلة في مجلد images/
 *   كل صورة ملف jpg مستقل، لا يستهلك ذاكرة التطبيق
 */

import { Capacitor } from '@capacitor/core';

// هل نحن في تطبيق جوال أصلي؟
export const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// طلب تخزين دائم من المتصفح (يمنع المتصفح من مسح البيانات)
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const granted = await navigator.storage.persist();
    console.log(`[UnlimitedStorage] Persistent storage: ${granted ? 'GRANTED ✅' : 'DENIED ❌'}`);
    return granted;
  } catch (e) {
    console.warn('[UnlimitedStorage] persist() failed', e);
    return false;
  }
}

// معرفة المساحة المستخدمة والمتبقية
export async function getStorageInfo(): Promise<{
  usedMB: number;
  quotaMB: number;
  usagePercent: number;
  isPersistent: boolean;
}> {
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usedMB = (estimate.usage || 0) / 1024 / 1024;
      const quotaMB = (estimate.quota || 0) / 1024 / 1024;
      const usagePercent = quotaMB > 0 ? (usedMB / quotaMB) * 100 : 0;
      const isPersistent = (await navigator.storage.persisted?.()) || false;
      return { usedMB, quotaMB, usagePercent, isPersistent };
    } catch {}
  }
  return { usedMB: 0, quotaMB: 0, usagePercent: 0, isPersistent: false };
}

// ========== تخزين الملفات في Capacitor Filesystem (للموبايل) ==========

const MAIN_DATA_FILE = 'proof-daftar-v2.json';
const BACKUP_DIR = 'backups';
const IMAGES_DIR = 'voucher-images';

// دالة مساعدة لتحميل Filesystem ديناميكياً (لتجنب أخطاء الـ build في الويب)
async function getFilesystem() {
  if (!isNativePlatform()) return null;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    return { Filesystem, Directory };
  } catch (e) {
    console.error('[UnlimitedStorage] Filesystem import failed', e);
    return null;
  }
}

// حفظ JSON كملف في نظام ملفات الهاتف (غير محدود)
async function saveToNativeFile(filename: string, data: any): Promise<boolean> {
  const fs = await getFilesystem();
  if (!fs) return false;

  try {
    const jsonStr = JSON.stringify(data);
    // تأكد أن المجلد موجود
    await fs.Filesystem.writeFile({
      path: filename,
      data: jsonStr,
      directory: fs.Directory.Data,
      encoding: 'utf8' as any,
    });
    console.log(`[UnlimitedStorage] Saved to native file: ${filename} (${(jsonStr.length / 1024).toFixed(1)} KB)`);
    return true;
  } catch (e) {
    console.error(`[UnlimitedStorage] saveToNativeFile failed: ${filename}`, e);
    return false;
  }
}

// قراءة ملف JSON من نظام ملفات الهاتف
async function readFromNativeFile<T>(filename: string): Promise<T | null> {
  const fs = await getFilesystem();
  if (!fs) return null;

  try {
    const result = await fs.Filesystem.readFile({
      path: filename,
      directory: fs.Directory.Data,
      encoding: 'utf8' as any,
    });
    const text = result.data as string;
    return JSON.parse(text) as T;
  } catch (e: any) {
    // الملف غير موجود أول مرة - طبيعي
    if (e?.message?.includes('does not exist') || e?.message?.includes('File does not exist')) {
      return null;
    }
    console.warn(`[UnlimitedStorage] readFromNativeFile failed: ${filename}`, e);
    return null;
  }
}

// ========== تخزين الويب باستخدام IndexedDB (idb-keyval) ==========

async function saveToWeb<T>(key: string, value: T): Promise<void> {
  try {
    const { set } = await import('idb-keyval');
    await set(key, value);
  } catch (e) {
    console.warn('[UnlimitedStorage] IndexedDB save failed, fallback to localStorage', e);
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
}

async function readFromWeb<T>(key: string): Promise<T | null> {
  try {
    const { get } = await import('idb-keyval');
    const val = await get<T>(key);
    if (val !== undefined) return val as T;
  } catch (e) {
    console.warn('[UnlimitedStorage] IndexedDB read failed', e);
  }

  // fallback من localStorage (للمستخدمين القدامى)
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {}
  return null;
}

async function removeFromWeb(key: string): Promise<void> {
  try {
    const { del } = await import('idb-keyval');
    await del(key);
  } catch {}
  try {
    localStorage.removeItem(key);
  } catch {}
}

// ========== الواجهة الرئيسية - نفس API في كل المنصات ==========

export const unlimitedStorage = {
  /**
   * حفظ بيانات (غير محدود)
   * على الموبايل: يحفظ كملف في /data/data/.../files/
   * على الويب: يحفظ في IndexedDB
   */
  async set<T>(key: string, value: T): Promise<boolean> {
    if (isNativePlatform()) {
      // على الموبايل، إذا كان المفتاح الرئيسي نحفظه كملف
      if (key.includes('proof-daftar')) {
        return await saveToNativeFile(MAIN_DATA_FILE, value);
      }
      // مفاتيح أخرى كملفات منفصلة
      return await saveToNativeFile(`${key}.json`, value);
    } else {
      await saveToWeb(key, value);
      // اطلب تخزين دائم أول مرة
      if (typeof window !== 'undefined') {
        requestPersistentStorage().catch(() => {});
      }
      return true;
    }
  },

  /**
   * قراءة بيانات
   */
  async get<T>(key: string): Promise<T | null> {
    if (isNativePlatform()) {
      if (key.includes('proof-daftar')) {
        // حاول من الملف أولاً
        const fromFile = await readFromNativeFile<T>(MAIN_DATA_FILE);
        if (fromFile) return fromFile;
      }
      // جرب ملف منفصل
      const fromSeparateFile = await readFromNativeFile<T>(`${key}.json`);
      if (fromSeparateFile) return fromSeparateFile;

      // fallback من IndexedDB / localStorage للتوافق
      return await readFromWeb<T>(key);
    } else {
      return await readFromWeb<T>(key);
    }
  },

  /**
   * حذف بيانات
   */
  async remove(key: string): Promise<boolean> {
    if (isNativePlatform()) {
      const fs = await getFilesystem();
      if (fs) {
        try {
          await fs.Filesystem.deleteFile({
            path: key.includes('proof-daftar') ? MAIN_DATA_FILE : `${key}.json`,
            directory: fs.Directory.Data,
          });
          return true;
        } catch {}
      }
    }
    await removeFromWeb(key);
    return true;
  },

  /**
   * حفظ نسخة احتياطية كملف منفصل (غير محدود، في مجلد backups)
   */
  async saveBackup(data: any): Promise<string | null> {
    const filename = `backup-${Date.now()}.json`;
    
    if (isNativePlatform()) {
      const fs = await getFilesystem();
      if (!fs) return null;
      try {
        // أنشئ مجلد backups إذا لم يكن موجوداً
        try {
          await fs.Filesystem.mkdir({
            path: BACKUP_DIR,
            directory: fs.Directory.Data,
            recursive: true,
          });
        } catch {}

        const path = `${BACKUP_DIR}/${filename}`;
        await fs.Filesystem.writeFile({
          path,
          data: JSON.stringify(data, null, 2),
          directory: fs.Directory.Data,
          encoding: 'utf8' as any,
        });
        console.log(`[UnlimitedStorage] Backup saved: ${path}`);
        return path;
      } catch (e) {
        console.error('[UnlimitedStorage] Backup save failed', e);
        return null;
      }
    } else {
      // على الويب، نزّل كملف + احفظه في Filesystem API للمتصفح إن وجد
      try {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        return filename;
      } catch {
        return null;
      }
    }
  },

  /**
   * قائمة النسخ الاحتياطي
   */
  async listBackups(): Promise<string[]> {
    if (!isNativePlatform()) return [];
    const fs = await getFilesystem();
    if (!fs) return [];
    try {
      const result = await fs.Filesystem.readdir({
        path: BACKUP_DIR,
        directory: fs.Directory.Data,
      });
      return result.files.map((f: any) => f.name || f).sort().reverse();
    } catch {
      return [];
    }
  },

  /**
   * حجم البيانات الحالية
   */
  async getSize(key: string): Promise<{ bytes: number; mb: string }> {
    const data = await this.get(key);
    if (!data) return { bytes: 0, mb: '0 MB' };
    const jsonStr = JSON.stringify(data);
    const bytes = new Blob([jsonStr]).size;
    return { bytes, mb: `${(bytes / 1024 / 1024).toFixed(2)} MB` };
  },

  /**
   * نقل البيانات من localStorage القديم إلى النظام الجديد (مرة واحدة)
   */
  async migrateFromOldStorage(key: string): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false;
      const oldRaw = localStorage.getItem(key);
      if (!oldRaw) return false;

      // هل البيانات موجودة بالفعل في النظام الجديد؟
      const existing = await this.get(key);
      if (existing) {
        console.log('[UnlimitedStorage] Data already migrated, skipping');
        return true;
      }

      const parsed = JSON.parse(oldRaw);
      const saved = await this.set(key, parsed);
      if (saved) {
        console.log(`[UnlimitedStorage] Migrated ${key} from localStorage (${(oldRaw.length / 1024).toFixed(1)} KB) to unlimited storage ✅`);
        // لا نحذف القديم فوراً، نحتفظ به كـ backup شهر
        localStorage.setItem(key + '_migrated_backup', oldRaw);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[UnlimitedStorage] Migration failed', e);
      return false;
    }
  },
};

// ========== نظام الصور اللامحدود ==========

export const unlimitedImageStorage = {
  /**
   * حفظ صورة - غير محدود
   * على الموبايل: يحفظ كملف jpg حقيقي في مجلد الصور
   * على الويب: يحفظ في IndexedDB (أو Cache API)
   */
  async saveImage(base64DataUrl: string, customName?: string): Promise<string> {
    const filename = customName || `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

    if (isNativePlatform()) {
      const fs = await getFilesystem();
      if (!fs) return base64DataUrl;

      try {
        // أنشئ مجلد الصور
        try {
          await fs.Filesystem.mkdir({
            path: IMAGES_DIR,
            directory: fs.Directory.Data,
            recursive: true,
          });
        } catch {}

        // إزالة prefix
        const base64Data = base64DataUrl.includes(',') ? base64DataUrl.split(',')[1] : base64DataUrl;

        const result = await fs.Filesystem.writeFile({
          path: `${IMAGES_DIR}/${filename}`,
          data: base64Data,
          directory: fs.Directory.Data,
        });

        console.log(`[ImageStorage] Saved image: ${filename} (${(base64Data.length / 1024).toFixed(1)} KB) -> ${result.uri}`);
        // نعيد مسار الملف، ليس الـ base64، لتوفير الذاكرة
        return result.uri;
      } catch (e) {
        console.error('[ImageStorage] Save failed', e);
        return base64DataUrl;
      }
    } else {
      // على الويب، نحفظه في IndexedDB
      try {
        const { set } = await import('idb-keyval');
        await set(`img_${filename}`, base64DataUrl);
        // نعيد مفتاح الصورة بدلاً من البيانات الكاملة لتوفير الذاكرة في JSON الرئيسي
        return `idb-img:${filename}`;
      } catch {
        return base64DataUrl;
      }
    }
  },

  /**
   * قراءة صورة
   */
  async readImage(pathOrKey: string): Promise<string> {
    if (!pathOrKey) return '';
    if (pathOrKey.startsWith('data:')) return pathOrKey;

    if (isNativePlatform()) {
      const fs = await getFilesystem();
      if (!fs) return pathOrKey;

      try {
        // إذا كان مسار file://
        if (pathOrKey.includes(IMAGES_DIR) || pathOrKey.includes('file://') || pathOrKey.endsWith('.jpg')) {
          const fileName = pathOrKey.split('/').pop() || pathOrKey;
          // ابحث عنه
          const searchPath = pathOrKey.includes(IMAGES_DIR) ? pathOrKey : `${IMAGES_DIR}/${fileName}`;
          
          const result = await fs.Filesystem.readFile({
            path: searchPath.includes(IMAGES_DIR) && !searchPath.startsWith(IMAGES_DIR) 
              ? searchPath.split(IMAGES_DIR)[1].replace(/^\//, '') 
              : searchPath,
            directory: fs.Directory.Data,
          }).catch(async () => {
            // جرب مباشرة
            return await fs.Filesystem.readFile({
              path: `${IMAGES_DIR}/${fileName}`,
              directory: fs.Directory.Data,
            });
          });

          const base64 = result.data as string;
          return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
        }
      } catch (e) {
        console.warn('[ImageStorage] Read failed, fallback', e);
      }
      return pathOrKey;
    } else {
      // على الويب، إذا كان مفتاح idb
      if (pathOrKey.startsWith('idb-img:')) {
        try {
          const key = `img_${pathOrKey.replace('idb-img:', '')}`;
          const { get } = await import('idb-keyval');
          const data = await get<string>(key);
          return data || '';
        } catch {
          return '';
        }
      }
      return pathOrKey;
    }
  },

  /**
   * حذف صورة
   */
  async deleteImage(pathOrKey: string): Promise<boolean> {
    if (!pathOrKey) return false;

    if (isNativePlatform()) {
      const fs = await getFilesystem();
      if (!fs) return false;
      try {
        const fileName = pathOrKey.split('/').pop() || pathOrKey;
        await fs.Filesystem.deleteFile({
          path: `${IMAGES_DIR}/${fileName}`,
          directory: fs.Directory.Data,
        });
        return true;
      } catch {
        return false;
      }
    } else {
      if (pathOrKey.startsWith('idb-img:')) {
        try {
          const { del } = await import('idb-keyval');
          const key = `img_${pathOrKey.replace('idb-img:', '')}`;
          await del(key);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  },

  /**
   * حجم كل الصور
   */
  async getTotalImagesSize(): Promise<{ count: number; totalMB: string }> {
    if (!isNativePlatform()) {
      return { count: 0, totalMB: '0 MB' };
    }
    const fs = await getFilesystem();
    if (!fs) return { count: 0, totalMB: '0 MB' };

    try {
      const result = await fs.Filesystem.readdir({
        path: IMAGES_DIR,
        directory: fs.Directory.Data,
      });
      return { count: result.files.length, totalMB: `${result.files.length * 0.3} MB (estimated)` };
    } catch {
      return { count: 0, totalMB: '0 MB' };
    }
  },

  /**
   * الحصول على رابط يمكن عرضه في <img src=""> - يعمل في كل المنصات
   */
  async getDisplayUrl(pathOrKey: string): Promise<string> {
    if (!pathOrKey) return '';
    // إذا base64 مباشرة
    if (pathOrKey.startsWith('data:')) return pathOrKey;
  // على الموبايل، حوّل مسار الملف إلى URL قابل للعرض
    if (isNativePlatform()) {
      try {
        // حاول استخدام convertFileSrc إذا متاح
        const cap = (await import('@capacitor/core')).Capacitor;
        if ((cap as any).convertFileSrc) {
          // إذا كان file:// استخدمه مباشرة
          if (pathOrKey.startsWith('file://') || pathOrKey.startsWith('content://')) {
            return (cap as any).convertFileSrc(pathOrKey);
          }
          // إذا كان مسار نسبي، نحتاج قراءته أولاً
          // لكن convertFileSrc يحتاج مسار كامل، لذا نقرأ كـ base64 للعرض الآمن
        }
        // fallback: اقرأ كـ base64
        return await this.readImage(pathOrKey);
      } catch {
        return pathOrKey;
      }
    } else {
      // ويب
      if (pathOrKey.startsWith('idb-img:')) {
        return await this.readImage(pathOrKey);
      }
      return pathOrKey;
    }
  },
};

// اطلب تخزين دائم عند التحميل (ويب فقط)
if (typeof window !== 'undefined' && !isNativePlatform()) {
  requestPersistentStorage();
  getStorageInfo().then(info => {
    console.log(`[UnlimitedStorage] Web storage info: ${info.usedMB.toFixed(2)}MB used / ${info.quotaMB.toFixed(2)}MB quota (${info.usagePercent.toFixed(1)}%) | Persistent: ${info.isPersistent}`);
  });
}
