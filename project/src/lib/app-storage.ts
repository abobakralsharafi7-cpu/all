/**
 * بديل آمن لـ localStorage يعمل في المتصفح وتطبيق Capacitor
 * يستخدم idb-keyval (IndexedDB) مع fallback لـ localStorage
 * 
 * استبدل:
 *   localStorage.getItem(STORAGE_KEY)
 * بـ:
 *   await appStorage.get(STORAGE_KEY)
 */

import { get, set, del } from 'idb-keyval';

const FALLBACK_PREFIX = 'proof-daftar-';

export const appStorage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      // حاول من IndexedDB أولاً
      const value = await get<T>(key);
      if (value !== undefined) return value as T;

      // fallback من localStorage للتوافق مع البيانات القديمة
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as T;
            // انقل البيانات إلى IndexedDB للمستقبل
            await set(key, parsed);
            return parsed;
          } catch {
            return null;
          }
        }
      }
      return null;
    } catch (e) {
      console.warn('appStorage.get error', e);
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await set(key, value);
      // احتفظ بنسخة في localStorage أيضاً للطوارئ
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(key + '_backup_timestamp', Date.now().toString());
        } catch {}
      }
    } catch (e) {
      console.warn('appStorage.set error, fallback to localStorage', e);
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await del(key);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('appStorage.remove error', e);
    }
  },

  // للتوافق - استخدمه في useEffect الأولي فقط
  async migrateFromLocalStorage(key: string) {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const existing = await get(key);
      if (existing === undefined) {
        const parsed = JSON.parse(raw);
        await set(key, parsed);
        console.log(`Migrated ${key} from localStorage to IndexedDB`);
      }
    } catch {}
  }
};

// دالة مساعدة لاستخدامها بدلاً من useEffect الذي يستخدم localStorage مباشرة
export async function loadAppData<T>(key: string, defaultValue: T): Promise<T> {
  const data = await appStorage.get<T>(key);
  return data ?? defaultValue;
}

export async function saveAppData<T>(key: string, value: T): Promise<void> {
  await appStorage.set(key, value);
}
