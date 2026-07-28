# =====================================================================
#  قواعد التشويش والحماية (R8 / ProGuard) — Proof Daftar
#  الهدف: أقصى تشويش ممكن مع بقاء Capacitor والإضافة الأصلية تعمل
# =====================================================================

# ---- تشويش أقوى: عدة مرات + أسماء عشوائية ----
-optimizationpasses 5
-allowaccessmodification
-repackageclasses 'o'
-overloadaggressively
-mergeinterfacesaggressively

# ---- إزالة أسماء الملفات وأرقام الأسطر من آثار الأخطاء ----
-renamesourcefileattribute SourceFile
-keepattributes Signature,*Annotation*,InnerClasses,EnclosingMethod

# ---- إزالة كل سجلات التصحيح من نسخة الإصدار (منع تسريب البيانات) ----
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
    public static *** wtf(...);
}
-assumenosideeffects class java.io.PrintStream {
    public void print(...);
    public void println(...);
}

# =====================================================================
#  استثناءات ضرورية — Capacitor يعتمد على الانعكاس (Reflection)
# =====================================================================

# جسر Capacitor الأساسي
-keep public class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.annotation.PluginMethod <methods>;
}
-keep class com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.Plugin { *; }

# الإضافة الأصلية الخاصة بالتطبيق
-keep class com.professor.proofdaftar.NativeToolsPlugin { *; }
-keep class com.professor.proofdaftar.MainActivity { *; }

# Cordova (تستخدمه Capacitor داخليًا)
-keep class org.apache.cordova.** { *; }

# واجهات JavaScript في WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# WebView و الطباعة
-keep class android.webkit.** { *; }
-keep class android.print.** { *; }

# JSON (Capacitor يستخدم org.json)
-keep class org.json.** { *; }

# AndroidX
-keep class androidx.core.content.FileProvider { *; }

# منع التحذيرات غير المؤثرة
-dontwarn com.getcapacitor.**
-dontwarn org.apache.cordova.**
-dontwarn kotlin.**
-dontwarn javax.annotation.**
