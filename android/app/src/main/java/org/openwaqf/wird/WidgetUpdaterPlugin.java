package org.openwaqf.wird;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetUpdater")
public class WidgetUpdaterPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        WirdStreakWidgetProvider.requestImmediateUpdate(getContext());
        call.resolve();
    }
}
