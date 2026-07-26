@echo off
echo 🔨 بناء بروف دفتر - Proof Daftre - المطور Professor
echo 📦 تثبيت الحزم...
call npm install

echo 🔨 بناء الويب...
call npm run build

echo 📱 إضافة منصة أندرويد...
if not exist android (
  call npx cap add android
) else (
  echo مجلد android موجود
)

echo 🎨 نسخ الشعار...
xcopy icons\android\* android\app\src\main\res\ /E /Y

echo 🔄 مزامنة...
call npx cap sync android

echo 🏗️ بناء APK...
cd android
gradlew assembleDebug

echo.
echo ✅✅✅ تم بناء APK بنجاح! ✅✅✅
echo 📂 الملف في: android\app\build\outputs\apk\debug\app-debug.apk
dir app\build\outputs\apk\debug\app-debug.apk
pause
