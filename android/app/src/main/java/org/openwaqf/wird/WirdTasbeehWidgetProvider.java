package org.openwaqf.wird;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Home-screen tasbeeh: tap to count, the dhikr moves on by itself at its target
 * (e.g. 33 -> 33 -> 34), gold when done, reset every day at 3 AM.
 * A free counter: it never changes the day's progress or the streak in the app.
 * The dhikr text and counts come from the app's own data.json (no copy here).
 */
public class WirdTasbeehWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_TAP = "org.openwaqf.wird.tasbeeh.TAP";
    private static final String ACTION_PREV = "org.openwaqf.wird.tasbeeh.PREV";
    private static final String ACTION_NEXT = "org.openwaqf.wird.tasbeeh.NEXT";
    private static final String ACTION_REFRESH = "org.openwaqf.wird.tasbeeh.REFRESH";
    private static final String EXTRA_WIDGET_ID = "appWidgetId";

    private static final String PREFS = "wird_tasbeeh_widget";
    private static final String PREFS_CAPACITOR = "CapacitorStorage";

    /** The 4 groups: ids from data.json, in order. */
    private static final String[][] GROUP_IDS = {
            {"sleep-tasbih-1", "sleep-tasbih-2", "sleep-tasbih-3"},
            {"count-2"},
            {"count-istighfar"},
            {"count-la-ilaha"},
    };
    private static final int[] GROUP_NAMES = {
            R.string.tasbeeh_group_sleep,
            R.string.tasbeeh_group_subhanallah,
            R.string.tasbeeh_group_istighfar,
            R.string.tasbeeh_group_tahlil,
    };

    private static final int GREEN_TEXT = Color.WHITE;
    private static final int GOLD_TEXT = Color.parseColor("#FDE68A");
    private static final int DOT_ON = Color.parseColor("#34D399");
    private static final int DOT_OFF = Color.parseColor("#33FFFFFF");

    private static Map<String, String[]> dhikrCache; // id -> {arabic, repeat}

    // ---------------------------------------------------------------- lifecycle

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) updateWidget(context, manager, id);
        scheduleDayChange(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, manager, appWidgetId, newOptions);
        updateWidget(context, manager, appWidgetId);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        super.onDeleted(context, appWidgetIds);
        SharedPreferences.Editor editor = prefs(context).edit();
        for (int id : appWidgetIds) editor.remove(groupKey(id));
        editor.apply();
    }

    @Override
    public void onDisabled(Context context) {
        super.onDisabled(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(broadcast(context, ACTION_REFRESH, 0));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (action == null) return;

        if (ACTION_REFRESH.equals(action)) {
            updateAll(context);
            scheduleDayChange(context);
            return;
        }

        int id = intent.getIntExtra(EXTRA_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        SharedPreferences prefs = prefs(context);

        if (ACTION_PREV.equals(action) || ACTION_NEXT.equals(action)) {
            int delta = ACTION_NEXT.equals(action) ? 1 : -1;
            int group = Math.floorMod(groupOf(prefs, id) + delta, GROUP_IDS.length);
            prefs.edit().putInt(groupKey(id), group).apply();
            updateWidget(context, AppWidgetManager.getInstance(context), id);
        } else if (ACTION_TAP.equals(action)) {
            ensureToday(prefs);
            int group = groupOf(prefs, id);
            int[] targets = targetsOf(context, group);
            TasbeehCounter counter = new TasbeehCounter(
                    prefs.getInt(stepKey(group), 0), prefs.getInt(countKey(group), 0));
            TasbeehCounter.Tap result = counter.tap(targets);
            if (result == TasbeehCounter.Tap.IGNORED) return;
            prefs.edit().putInt(stepKey(group), counter.step).putInt(countKey(group), counter.count).apply();
            // Light on every count, strong at the end of each dhikr (33, 34, 100).
            vibrate(context, result != TasbeehCounter.Tap.COUNTED);
            updateAll(context); // other widgets may show the same group
        }
    }

    // ---------------------------------------------------------------- drawing

    private static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WirdTasbeehWidgetProvider.class));
        if (ids == null) return;
        for (int id : ids) updateWidget(context, manager, id);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        SharedPreferences prefs = prefs(context);
        ensureToday(prefs);
        int group = groupOf(prefs, appWidgetId);
        List<String[]> steps = stepsOf(context, group);
        int[] targets = new int[steps.size()];
        for (int i = 0; i < targets.length; i++) targets[i] = Integer.parseInt(steps.get(i)[1]);

        TasbeehCounter counter = new TasbeehCounter(prefs.getInt(stepKey(group), 0), prefs.getInt(countKey(group), 0));
        boolean done = targets.length > 0 && counter.isDone(targets);
        int shownStep = counter.shownStep(targets);
        int shown = counter.shownCount(targets);
        int target = targets.length > 0 ? targets[shownStep] : 0;
        String arabic = steps.isEmpty() ? "—" : steps.get(shownStep)[0];

        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        int minHeight = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) : 0;
        int minWidth = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        boolean row = minHeight > 0 && minHeight < 100;      // 4x1: one line
        boolean narrow = minWidth > 0 && minWidth < 230;     // 2x2
        boolean longText = arabic.length() > 60;

        RemoteViews views = new RemoteViews(context.getPackageName(),
                row ? R.layout.widget_tasbeeh_row : R.layout.widget_tasbeeh);

        views.setInt(R.id.tasbeeh_root, "setBackgroundResource",
                isOled(context) ? R.drawable.widget_tasbeeh_bg_oled : R.drawable.widget_tasbeeh_bg);

        views.setTextViewText(R.id.tasbeeh_text, arabic);
        float textSp = row ? 18f : longText ? (narrow ? 13f : 16f) : (narrow ? 18f : 22f);
        views.setTextViewTextSize(R.id.tasbeeh_text, TypedValue.COMPLEX_UNIT_SP, textSp);

        views.setTextViewText(R.id.tasbeeh_count, String.valueOf(shown));
        views.setTextViewText(R.id.tasbeeh_target, " / " + target);
        views.setTextColor(R.id.tasbeeh_count, done ? GOLD_TEXT : GREEN_TEXT);

        views.setViewVisibility(R.id.tasbeeh_bar, done ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.tasbeeh_bar_done, done ? View.VISIBLE : View.GONE);
        views.setProgressBar(R.id.tasbeeh_bar, Math.max(target, 1), shown, false);
        views.setProgressBar(R.id.tasbeeh_bar_done, 1, 1, false);

        if (!row) {
            views.setViewVisibility(R.id.tasbeeh_check, done ? View.VISIBLE : View.GONE);
            boolean multi = targets.length > 1 && !done;
            views.setViewVisibility(R.id.tasbeeh_dots, multi ? View.VISIBLE : View.GONE);
            int[] dots = {R.id.tasbeeh_dot1, R.id.tasbeeh_dot2, R.id.tasbeeh_dot3};
            for (int i = 0; i < dots.length; i++) {
                views.setViewVisibility(dots[i], i < targets.length ? View.VISIBLE : View.GONE);
                views.setTextColor(dots[i], i <= counter.step ? DOT_ON : DOT_OFF);
            }
            views.setOnClickPendingIntent(R.id.tasbeeh_prev, broadcast(context, ACTION_PREV, appWidgetId));
            views.setOnClickPendingIntent(R.id.tasbeeh_next, broadcast(context, ACTION_NEXT, appWidgetId));
        }

        // Screen readers: "Istighfar, count 12 of 100" (+ "done for today")
        String description = context.getString(R.string.tasbeeh_content_desc,
                context.getString(GROUP_NAMES[group]), shown, target);
        if (done) description += ", " + context.getString(R.string.tasbeeh_done);
        views.setContentDescription(R.id.tasbeeh_root, description);
        views.setOnClickPendingIntent(R.id.tasbeeh_root, broadcast(context, ACTION_TAP, appWidgetId));

        manager.updateAppWidget(appWidgetId, views);
    }

    // ---------------------------------------------------------------- data

    /** The group's dhikr as {arabic, repeat}, skipping any id missing from data.json. */
    private static List<String[]> stepsOf(Context context, int group) {
        Map<String, String[]> all = loadDhikr(context);
        List<String[]> steps = new ArrayList<>();
        for (String id : GROUP_IDS[group]) {
            String[] d = all.get(id);
            if (d != null) steps.add(d);
        }
        return steps;
    }

    private static int[] targetsOf(Context context, int group) {
        List<String[]> steps = stepsOf(context, group);
        int[] targets = new int[steps.size()];
        for (int i = 0; i < targets.length; i++) targets[i] = Integer.parseInt(steps.get(i)[1]);
        return targets;
    }

    private static synchronized Map<String, String[]> loadDhikr(Context context) {
        if (dhikrCache != null) return dhikrCache;
        Map<String, String[]> map = new HashMap<>();
        try (InputStream in = context.getAssets().open("public/data.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            JSONArray items = new JSONArray(out.toString(StandardCharsets.UTF_8.name()));
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                int repeat = item.optInt("repeat", 0);
                String arabic = item.optString("arabic", "");
                if (repeat > 0 && !arabic.isEmpty()) {
                    map.put(item.optString("id"), new String[]{arabic, String.valueOf(repeat)});
                }
            }
        } catch (Exception ignored) {
            // Leave the map empty: the widget then shows "—" instead of crashing.
        }
        dhikrCache = map;
        return map;
    }

    // ---------------------------------------------------------------- state

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static int groupOf(SharedPreferences prefs, int appWidgetId) {
        int g = prefs.getInt(groupKey(appWidgetId), 0);
        return (g < 0 || g >= GROUP_IDS.length) ? 0 : g;
    }

    /** Daily reset: a new (3 AM-adjusted) day starts every group again at 0. */
    private static void ensureToday(SharedPreferences prefs) {
        String today = TasbeehCounter.dayKey(Calendar.getInstance());
        if (today.equals(prefs.getString("day", null))) return;
        SharedPreferences.Editor editor = prefs.edit().putString("day", today);
        for (int g = 0; g < GROUP_IDS.length; g++) editor.remove(stepKey(g)).remove(countKey(g));
        editor.apply();
    }

    private static String groupKey(int appWidgetId) { return "w" + appWidgetId + "_group"; }
    private static String stepKey(int group) { return "g" + group + "_step"; }
    private static String countKey(int group) { return "g" + group + "_count"; }

    // ---------------------------------------------------------------- helpers

    /** Non-waking alarm: if the phone sleeps through 3 AM, the reset shows when it wakes. */
    private static void scheduleDayChange(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        alarms.set(AlarmManager.RTC, TasbeehCounter.nextDayChangeAt(Calendar.getInstance()), broadcast(context, ACTION_REFRESH, 0));
    }

    private static PendingIntent broadcast(Context context, String action, int appWidgetId) {
        Intent intent = new Intent(context, WirdTasbeehWidgetProvider.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_WIDGET_ID, appWidgetId);
        // Unique data so each widget/action pair keeps its own PendingIntent
        intent.setData(android.net.Uri.parse("wird://tasbeeh/" + action + "/" + appWidgetId));
        return PendingIntent.getBroadcast(context, appWidgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static boolean isOled(Context context) {
        SharedPreferences cap = context.getSharedPreferences(PREFS_CAPACITOR, Context.MODE_PRIVATE);
        return "true".equals(cap.getString("darkMode", null)) && "true".equals(cap.getString("oledMode", null));
    }

    /** Follows the app's Vibration setting ("isHapticEnabled"). */
    private static void vibrate(Context context, boolean strong) {
        SharedPreferences cap = context.getSharedPreferences(PREFS_CAPACITOR, Context.MODE_PRIVATE);
        if ("false".equals(cap.getString("isHapticEnabled", null))) return;

        Vibrator vibrator;
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = vm != null ? vm.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vibrator == null || !vibrator.hasVibrator()) return;

        try {
            if (Build.VERSION.SDK_INT >= 26) {
                vibrator.vibrate(strong
                        ? VibrationEffect.createOneShot(90, 255)
                        : VibrationEffect.createOneShot(15, 120));
            } else {
                vibrator.vibrate(strong ? 90 : 15);
            }
        } catch (Exception ignored) {
            // Vibration is a nicety: never let it break counting.
        }
    }
}
