package com.professor.proofdaftar;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeToolsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
