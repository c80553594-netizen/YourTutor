package com.yourtutor.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(YourTutorKeystorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
