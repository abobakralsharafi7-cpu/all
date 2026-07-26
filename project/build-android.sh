#!/bin/bash
echo "🔨 بناء بروف دفتر - Proof Daftre - المطور Professor - تخزين لا نهائي 50k"
echo "📦 تثبيت الحزم..."
npm install

echo "🔨 بناء الويب..."
npm run build

echo "📱 إضافة منصة أندرويد..."
if [ ! -d "android" ]; then
  npx cap add android
else
  echo "مجلد android موجود"
fi

echo "🎨 نسخ شعار بروف دفتر..."
cp -r icons/android/* android/app/src/main/res/ 2>/dev/null || true

echo "🔄 مزامنة..."
npx cap sync android

echo "🏗️ بناء APK..."
cd android
chmod +x gradlew
./gradlew assembleDebug

echo ""
echo "✅✅✅ تم بناء APK بنجاح! ✅✅✅"
echo "📂 الملف في: android/app/build/outputs/apk/debug/app-debug.apk"
ls -lh app/build/outputs/apk/debug/app-debug.apk 2>/dev/null || ls -lh app/build/outputs/apk/debug/ 2>/dev/null
