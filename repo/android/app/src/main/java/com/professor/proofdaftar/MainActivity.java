package com.professor.proofdaftar;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeToolsPlugin.class);

        // حماية البيانات المالية من لقطات الشاشة وتسجيل الشاشة
        // ويمنع ظهور محتوى التطبيق في قائمة التطبيقات الأخيرة
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        super.onCreate(savedInstanceState);
    }
}
