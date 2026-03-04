package org.openwaqf.wird;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
