package org.openwaqf.wird;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;

import com.getcapacitor.JSObject;
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

    /**
     * Asks the launcher to add a widget ({type: "tasbeeh" | "streak"}): Android then shows
     * its own "Add to home screen?" dialog. Resolves {requested: false} when the launcher
     * cannot do this (Android 7 and older, or some launchers), so the app can show a tip.
     */
    @PluginMethod
    public void pin(PluginCall call) {
        Class<?> provider = "tasbeeh".equals(call.getString("type"))
                ? WirdTasbeehWidgetProvider.class
                : WirdStreakWidgetProvider.class;
        boolean requested = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager manager = getContext().getSystemService(AppWidgetManager.class);
            if (manager != null && manager.isRequestPinAppWidgetSupported()) {
                requested = manager.requestPinAppWidget(new ComponentName(getContext(), provider), null, null);
            }
        }
        JSObject result = new JSObject();
        result.put("requested", requested);
        call.resolve(result);
    }
}
