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

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "NativeTools",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts")
    }
)
public class NativeToolsPlugin extends Plugin {
    @PluginMethod
    public void saveBase64File(PluginCall call) {
        String filename = call.getString("filename", "file.bin");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Missing file data");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveFileResult");
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

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveTextFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            call.resolve(ret);
            return;
        }

        try {
            String base64 = call.getString("base64", "");
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Uri uri = data.getData();

            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) {
                    call.reject("Cannot open output file");
                    return;
                }
                output.write(bytes);
            }

            JSObject ret = new JSObject();
            ret.put("status", "saved");
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("Cannot save file", error);
        }
    }

    @ActivityCallback
    private void saveTextFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            call.resolve(ret);
            return;
        }

        try {
            String text = call.getString("text", "");
            Uri uri = data.getData();

            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) {
                    call.reject("Cannot open output file");
                    return;
                }
                output.write(text.getBytes(StandardCharsets.UTF_8));
            }

            JSObject ret = new JSObject();
            ret.put("status", "saved");
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("Cannot save text file", error);
        }
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

    @PluginMethod
    public void printHtml(PluginCall call) {
        String title = call.getString("title", "Proof Daftar");
        String html = call.getString("html");

        if (html == null || html.isEmpty()) {
            call.reject("Missing print HTML");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                WebView printWebView = new WebView(getContext());
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager printManager = (PrintManager) getActivity().getSystemService(Activity.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                        PrintAttributes attributes = new PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                        printManager.print(title, adapter, attributes);

                        JSObject ret = new JSObject();
                        ret.put("status", "opened");
                        call.resolve(ret);
                    }
                });
                printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception error) {
                call.reject("Cannot open print dialog", error);
            }
        });
    }
}
