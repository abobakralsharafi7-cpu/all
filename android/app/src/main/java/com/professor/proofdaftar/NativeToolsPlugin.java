package com.professor.proofdaftar;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.ContactsContract;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "NativeTools",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts")
    }
)
public class NativeToolsPlugin extends Plugin {
    // ملف مؤقت على القرص بدل إبقاء عدة ميجابايت في الذاكرة أثناء فتح منتقي الملفات.
    // الاحتفاظ بالبيانات في الذاكرة كان يجعل أندرويد يقتل العملية (إغلاق مفاجئ + ملف بحجم صفر).
    private File pendingFile = null;

    /** يكتب البيانات في ملف مؤقت داخل مساحة التطبيق ثم يفتح منتقي الملفات. */
    private void stageAndPick(PluginCall call, byte[] bytes, String filename, String mimeType, String callbackName) {
        try {
            clearPendingFile();
            File cacheDir = new File(getContext().getCacheDir(), "export");
            if (!cacheDir.exists()) cacheDir.mkdirs();
            File staged = new File(cacheDir, "staged_" + System.currentTimeMillis() + ".tmp");

            try (BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(staged), 64 * 1024)) {
                int chunk = 64 * 1024;
                for (int offset = 0; offset < bytes.length; offset += chunk) {
                    out.write(bytes, offset, Math.min(chunk, bytes.length - offset));
                }
                out.flush();
            }

            pendingFile = staged;
        } catch (Exception error) {
            call.reject("Cannot prepare file", error);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        // إبقاء الاستدعاء حيًا إذا أوقف النظام النشاط أثناء فتح المنتقي
        call.setKeepAlive(true);
        startActivityForResult(call, intent, callbackName);
    }

    private void clearPendingFile() {
        closeStageStream();
        if (pendingFile != null && pendingFile.exists()) {
            try { pendingFile.delete(); } catch (Exception ignored) { }
        }
        pendingFile = null;
    }

    // ═══ واجهة الكتابة على دفعات ═══
    // JS يرسل المحتوى على قطع صغيرة (نصف ميجابايت) بدل دفعة واحدة ضخمة.
    // تمرير عدة ميجابايت في استدعاء واحد كان يستنفد ذاكرة الجسر ويقتل التطبيق.
    private BufferedOutputStream stageStream = null;

    @PluginMethod
    public void beginStage(PluginCall call) {
        try {
            closeStageStream();
            clearPendingFile();

            File cacheDir = new File(getContext().getCacheDir(), "export");
            if (!cacheDir.exists()) cacheDir.mkdirs();
            pendingFile = new File(cacheDir, "staged_" + System.currentTimeMillis() + ".tmp");
            stageStream = new BufferedOutputStream(new FileOutputStream(pendingFile), 128 * 1024);

            JSObject ret = new JSObject();
            ret.put("status", "ready");
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("Cannot begin staging", error);
        }
    }

    @PluginMethod
    public void appendStage(PluginCall call) {
        String chunk = call.getString("chunk");
        if (stageStream == null) {
            call.reject("Staging not started");
            return;
        }
        if (chunk == null) {
            call.reject("Missing chunk");
            return;
        }

        try {
            stageStream.write(chunk.getBytes(StandardCharsets.UTF_8));
            JSObject ret = new JSObject();
            ret.put("status", "ok");
            call.resolve(ret);
        } catch (Exception error) {
            closeStageStream();
            clearPendingFile();
            call.reject("Cannot append chunk", error);
        }
    }

    /** ينهي التجميع ويفتح منتقي الملفات لحفظ المحتوى المُجمَّع. */
    @PluginMethod
    public void saveStaged(PluginCall call) {
        String filename = call.getString("filename", "file.txt");
        String mimeType = call.getString("mimeType", "text/plain");

        if (stageStream == null || pendingFile == null) {
            call.reject("Nothing staged");
            return;
        }

        try {
            stageStream.flush();
            closeStageStream();
        } catch (Exception error) {
            clearPendingFile();
            call.reject("Cannot finalize file", error);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        call.setKeepAlive(true);
        startActivityForResult(call, intent, "saveTextFileResult");
    }

    /** ينهي التجميع ويعيد مسار الملف المؤقت (يُستخدم للطباعة). */
    @PluginMethod
    public void stagePrintHtml(PluginCall call) {
        if (stageStream == null || pendingFile == null) {
            call.reject("Nothing staged");
            return;
        }
        try {
            stageStream.flush();
            closeStageStream();

            JSObject ret = new JSObject();
            ret.put("path", pendingFile.getAbsolutePath());
            pendingFile = null; // تُحذف بعد قراءتها في printHtml
            call.resolve(ret);
        } catch (Exception error) {
            clearPendingFile();
            call.reject("Cannot finalize print content", error);
        }
    }

    private void closeStageStream() {
        if (stageStream != null) {
            try { stageStream.close(); } catch (Exception ignored) { }
            stageStream = null;
        }
    }

    @PluginMethod
    public void saveBase64File(PluginCall call) {
        String filename = call.getString("filename", "file.bin");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing file data");
            return;
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (Exception error) {
            call.reject("Cannot decode file data", error);
            return;
        }

        stageAndPick(call, bytes, filename, mimeType, "saveFileResult");
    }

    @PluginMethod
    public void saveTextFile(PluginCall call) {
        String filename = call.getString("filename", "file.txt");
        String mimeType = call.getString("mimeType", "text/plain");
        String text = call.getString("text");

        if (text == null) {
            call.reject("Missing file text");
            return;
        }

        stageAndPick(call, text.getBytes(StandardCharsets.UTF_8), filename, mimeType, "saveTextFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            clearPendingFile();
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            call.setKeepAlive(false);
            call.resolve(ret);
            return;
        }

        writePendingBytes(call, data.getData(), "Cannot save file");
    }

    /** ينسخ الملف المؤقت إلى الموقع الذي اختاره المستخدم على دفعات. */
    private void writePendingBytes(PluginCall call, Uri uri, String errorMessage) {
        File source = pendingFile;

        if (source == null || !source.exists()) {
            call.setKeepAlive(false);
            call.reject("Missing file data");
            return;
        }

        try (InputStream input = new FileInputStream(source);
             OutputStream raw = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (raw == null) {
                call.setKeepAlive(false);
                call.reject("Cannot open output file");
                return;
            }

            try (BufferedOutputStream output = new BufferedOutputStream(raw, 64 * 1024)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.flush();
            }

            JSObject ret = new JSObject();
            ret.put("status", "saved");
            call.setKeepAlive(false);
            call.resolve(ret);
        } catch (Exception error) {
            call.setKeepAlive(false);
            call.reject(errorMessage, error);
        } finally {
            clearPendingFile();
        }
    }

    @ActivityCallback
    private void saveTextFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            clearPendingFile();
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            call.setKeepAlive(false);
            call.resolve(ret);
            return;
        }

        writePendingBytes(call, data.getData(), "Cannot save text file");
    }

    @PluginMethod
    public void restartApp(PluginCall call) {
        try {
            Activity activity = getActivity();
            Intent intent = activity.getPackageManager().getLaunchIntentForPackage(activity.getPackageName());
            if (intent == null) {
                call.reject("Cannot create launch intent");
                return;
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                activity,
                1001,
                intent,
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            AlarmManager alarmManager = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) {
                alarmManager.set(AlarmManager.RTC, System.currentTimeMillis() + 250, pendingIntent);
            }

            JSObject ret = new JSObject();
            ret.put("status", "restarting");
            call.resolve(ret);
            activity.finishAffinity();
            Runtime.getRuntime().exit(0);
        } catch (Exception error) {
            call.reject("Cannot restart app", error);
        }
    }

    @PluginMethod
    public void pickPhone(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermissionResult");
            return;
        }

        openContactPicker(call);
    }

    @PermissionCallback
    private void contactsPermissionResult(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            openContactPicker(call);
        } else {
            call.reject("Contacts permission denied");
        }
    }

    private void openContactPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        startActivityForResult(call, intent, "pickPhoneResult");
    }

    @ActivityCallback
    private void pickPhoneResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            ret.put("phone", "");
            call.resolve(ret);
            return;
        }

        try (Cursor cursor = getContext().getContentResolver().query(
            data.getData(),
            new String[] { ContactsContract.CommonDataKinds.Phone.NUMBER },
            null,
            null,
            null
        )) {
            String phone = "";
            if (cursor != null && cursor.moveToFirst()) {
                int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                if (numberIndex >= 0) phone = cursor.getString(numberIndex);
            }

            JSObject ret = new JSObject();
            ret.put("status", phone.isEmpty() ? "empty" : "selected");
            ret.put("phone", phone);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("Cannot read contact phone", error);
        }
    }

    // مرجع ثابت لمنع جامع النفايات من إتلاف WebView أثناء الطباعة
    // (كان السبب في طباعة ورقة بيضاء فارغة)
    private WebView printWebViewRef = null;
    private boolean printRequested = false;

    /** يفتح حوار الطباعة مرة واحدة فقط. */
    private void doPrint(WebView view, String title, PluginCall call) {
        try {
            PrintManager printManager =
                (PrintManager) getActivity().getSystemService(Activity.PRINT_SERVICE);
            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
            PrintAttributes attributes = new PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build();
            printManager.print(title, adapter, attributes);

            JSObject ret = new JSObject();
            ret.put("status", "opened");
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("Cannot open print dialog", error);
        }
    }

    @PluginMethod
    public void printHtml(PluginCall call) {
        String title = call.getString("title", "Proof Daftar");
        String html = call.getString("html");
        String htmlPath = call.getString("htmlPath");

        // المحتوى الكبير يُقرأ من ملف مؤقت بدل تمريره عبر جسر JS (يمنع استنفاد الذاكرة)
        if ((html == null || html.isEmpty()) && htmlPath != null && !htmlPath.isEmpty()) {
            try {
                File src = new File(htmlPath);
                byte[] buf = new byte[(int) src.length()];
                try (InputStream in = new FileInputStream(src)) {
                    int off = 0, r;
                    while (off < buf.length && (r = in.read(buf, off, buf.length - off)) != -1) off += r;
                }
                html = new String(buf, StandardCharsets.UTF_8);
                try { src.delete(); } catch (Exception ignored) { }
            } catch (Exception error) {
                call.reject("Cannot read print content", error);
                return;
            }
        }

        if (html == null || html.isEmpty()) {
            call.reject("Missing print HTML");
            return;
        }

        final String printHtmlContent = html;

        getActivity().runOnUiThread(() -> {
            try {
                printRequested = false;
                final WebView printWebView = new WebView(getContext());

                WebSettings settings = printWebView.getSettings();
                settings.setJavaScriptEnabled(false);
                settings.setLoadsImagesAutomatically(true);
                settings.setBlockNetworkImage(false);
                settings.setUseWideViewPort(false);
                settings.setLoadWithOverviewMode(false);

                // WebView خارج الشجرة لا يُخطِّط محتواه؛ نمنحه أبعاد A4 بالبكسل (96dpi)
                printWebView.setLayoutParams(new ViewGroup.LayoutParams(794, 1123));
                printWebView.measure(
                    View.MeasureSpec.makeMeasureSpec(794, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(1123, View.MeasureSpec.EXACTLY)
                );
                printWebView.layout(0, 0, 794, 1123);

                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        // مهلة قصيرة لإتمام تخطيط الجداول والصور قبل التقاط الصفحات
                        view.postDelayed(() -> {
                            if (printRequested) return;
                            printRequested = true;
                            doPrint(view, title, call);
                        }, 900);
                    }
                });

                printWebViewRef = printWebView; // منع الإتلاف المبكر

                // baseURL = null يتوافق مع setAllowFileAccess ويضمن عمل الصور المضمّنة base64
                printWebView.loadDataWithBaseURL(null, printHtmlContent, "text/html", "UTF-8", null);

                // حارز أمان: إن لم يصل onPageFinished (محتوى ضخم) نطبع بعد 8 ثوانٍ
                printWebView.postDelayed(() -> {
                    if (!printRequested) {
                        printRequested = true;
                        doPrint(printWebView, title, call);
                    }
                }, 8000);
            } catch (Exception error) {
                call.reject("Cannot open print dialog", error);
            }
        });
    }
}
