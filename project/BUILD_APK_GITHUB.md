# 🚀 كيف تبني APK على سيرفرات GitHub بدون Android Studio

## الطريقة (5 دقائق فقط):

### 1. ارفع المشروع إلى GitHub

1. اذهب إلى https://github.com/new
2. أنشئ مستودع جديد باسم `proof-daftar`
3. لا تضع README
4. على جهازك في VS Code:

```bash
git init
git add .
git commit -m "تطبيق بروف دفتر - جاهز للبناء - المطور Professor"
git branch -M main
git remote add origin https://github.com/USERNAME/proof-daftar.git
git push -u origin main
```

### 2. GitHub سيبني APK تلقائياً

- اذهب إلى تبويب **Actions** في GitHub
- سترى مهمة `بناء تطبيق بروف دفتر - Proof Daftre APK` تعمل
- انتظر 3-5 دقائق

### 3. حمّل APK

- بعد انتهاء البناء، ادخل على المهمة
- في الأسفل ستجد **Artifacts**
- حمّل `proof-daftar-debug-apk` 
- فك الضغط، بداخله `app-debug.apk` (6-8MB)
- ثبته على هاتفك مباشرة!

### 4. للرفع على Google Play (AAB)

- نفس الخطوات، لكن الملف الثاني `proof-daftar-release-aab` هو AAB للرفع على Play Console

---

## ملف الأوامر الكامل (كما طلبت)

أنشأت لك ملفين:

### `build-android.sh` (للويندوز مع Git Bash أو Linux/Mac):
```bash
#!/bin/bash
echo "🔨 بناء بروف دفتر - Proof Daftre - المطور Professor"
npm install
npm run build
if [ ! -d "android" ]; then
  npx cap add android
fi
cp -r icons/android/* android/app/src/main/res/ || true
npx cap sync android
cd android
./gradlew assembleDebug
echo "✅ APK جاهز في: android/app/build/outputs/apk/debug/app-debug.apk"
```

### `build-android.bat` (لويندوز):
```bat
@echo off
echo 🔨 بناء بروف دفتر
call npm install
call npm run build
if not exist android (
  call npx cap add android
)
xcopy icons\android\* android\app\src\main\res\ /E /Y
call npx cap sync android
cd android
gradlew assembleDebug
echo ✅ APK جاهز في: android\app\build\outputs\apk\debug\app-debug.apk
pause
```

شغل أي ملف بضغطة مزدوجة وسيبني APK تلقائياً!

