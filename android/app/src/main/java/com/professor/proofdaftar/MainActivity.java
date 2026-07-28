package com.professor.proofdaftar;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeToolsPlugin.class);

        // حماية البيانات المالية من لقطات الشاشة وتسجيل الشاشة
        applySecureFlag();

        super.onCreate(savedInstanceState);
    }

    /** يفعّل حماية الشاشة (يمنع لقطات الشاشة والتسجيل). */
    public void applySecureFlag() {
        runOnUiThread(() -> getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        ));
    }

    /**
     * يرفع حماية الشاشة مؤقتًا.
     * ضروري أثناء الطباعة: نظام أندرويد يرفض طباعة أي نافذة عليها FLAG_SECURE
     * ويُلغي المهمة بصمت دون إظهار حوار الطابعة.
     */
    public void clearSecureFlag() {
        runOnUiThread(() -> getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
    }
}
