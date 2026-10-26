package org.openwaqf.wird;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class WirdStreakWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_PREV = "org.openwaqf.wird.widget.PREV";
    private static final String ACTION_NEXT = "org.openwaqf.wird.widget.NEXT";
    private static final String ACTION_REFRESH = "org.openwaqf.wird.widget.REFRESH";
    private static final String EXTRA_WIDGET_ID = "appWidgetId";

    private static final String[] CATEGORIES = {"morning", "evening", "waking", "sleep"};
    private static final String PREFS_WIDGET = "wird_widget_prefs";
    private static final String PREFS_CAPACITOR = "CapacitorStorage";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
        scheduleNextRefresh(context);
    }

    @Override
    public void onDisabled(Context context) {
        super.onDisabled(context);
        // Last widget removed: no more refreshes needed.
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(refreshPendingIntent(context));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions);
        updateWidget(context, appWidgetManager, appWidgetId);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        super.onDeleted(context, appWidgetIds);
        SharedPreferences widgetPrefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = widgetPrefs.edit();
        for (int appWidgetId : appWidgetIds) {
            editor.remove(indexKey(appWidgetId));
        }
        editor.apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (action == null) return;

        if (ACTION_REFRESH.equals(action)) {
            updateAllWidgets(context);
            scheduleNextRefresh(context);
            return;
        }

        if (!ACTION_PREV.equals(action) && !ACTION_NEXT.equals(action)) return;
        int appWidgetId = intent.getIntExtra(EXTRA_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        SharedPreferences widgetPrefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
        int currentIndex = widgetPrefs.getInt(indexKey(appWidgetId), autoCategoryIndexByTime());
        int delta = ACTION_NEXT.equals(action) ? 1 : -1;
        int nextIndex = Math.floorMod(currentIndex + delta, CATEGORIES.length);
        widgetPrefs.edit().putInt(indexKey(appWidgetId), nextIndex).apply();

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        updateWidget(context, manager, appWidgetId);
    }

    public static void requestImmediateUpdate(Context context) {
        Intent refresh = new Intent(context, WirdStreakWidgetProvider.class);
        refresh.setAction(ACTION_REFRESH);
        context.sendBroadcast(refresh);
    }

    // The widget's content changes at the 3 AM day change (Done/Pending, streak) and at
    // the hours its default category switches. Refresh then, with a non-waking alarm:
    // if the phone is asleep, the widget updates the next time it is on.
    private static void scheduleNextRefresh(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        alarms.set(AlarmManager.RTC, nextRefreshAt(Calendar.getInstance()), refreshPendingIntent(context));
    }

    private static PendingIntent refreshPendingIntent(Context context) {
        Intent intent = new Intent(context, WirdStreakWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Next moment the widget content can change: 03:00 (day change) or a category switch hour. */
    static long nextRefreshAt(Calendar now) {
        int[] hours = {3, 4, 12, 19, 23};
        for (int day = 0; day < 2; day++) {
            for (int hour : hours) {
                Calendar t = (Calendar) now.clone();
                t.add(Calendar.DAY_OF_MONTH, day);
                t.set(Calendar.HOUR_OF_DAY, hour);
                t.set(Calendar.MINUTE, 0);
                t.set(Calendar.SECOND, 5);
                t.set(Calendar.MILLISECOND, 0);
                if (t.after(now)) return t.getTimeInMillis();
            }
        }
        return now.getTimeInMillis() + 60 * 60 * 1000; // unreachable fallback
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, WirdStreakWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(componentName);
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        SharedPreferences capacitorPrefs = context.getSharedPreferences(PREFS_CAPACITOR, Context.MODE_PRIVATE);
        SharedPreferences widgetPrefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);

        int streakValue = currentStreak(
                capacitorPrefs.getString("wird_streak", "0"),
                capacitorPrefs.getString("wird_last_active_date", null),
                Calendar.getInstance());
        int categoryIndex = widgetPrefs.getInt(indexKey(appWidgetId), autoCategoryIndexByTime());
        if (categoryIndex < 0 || categoryIndex >= CATEGORIES.length) categoryIndex = 0;
        String categoryKey = CATEGORIES[categoryIndex];
        boolean categoryDone = isCategoryDoneToday(capacitorPrefs, categoryKey);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_wird_streak);
        views.setTextViewText(R.id.widget_streak_value, String.valueOf(streakValue));
        views.setTextViewText(
                R.id.widget_category_status,
                context.getString(
                        R.string.widget_category_status_format,
                        localizeCategory(context, categoryKey),
                        context.getString(categoryDone ? R.string.widget_status_done : R.string.widget_status_pending)
                )
        );
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        int minHeight = options != null ? options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) : 0;
        boolean compact = minHeight > 0 && minHeight < 90;
        if (compact) {
            views.setViewVisibility(R.id.widget_title, View.GONE);
            views.setTextViewTextSize(R.id.widget_streak_value, TypedValue.COMPLEX_UNIT_SP, 24f);
            views.setTextViewTextSize(R.id.widget_category_status, TypedValue.COMPLEX_UNIT_SP, 11f);
        } else {
            views.setViewVisibility(R.id.widget_title, View.VISIBLE);
            views.setTextViewTextSize(R.id.widget_streak_value, TypedValue.COMPLEX_UNIT_SP, 30f);
            views.setTextViewTextSize(R.id.widget_category_status, TypedValue.COMPLEX_UNIT_SP, 12f);
        }

        views.setOnClickPendingIntent(R.id.widget_root, launchAppPendingIntent(context, appWidgetId));
        views.setOnClickPendingIntent(R.id.widget_prev_button, navPendingIntent(context, appWidgetId, ACTION_PREV));
        views.setOnClickPendingIntent(R.id.widget_next_button, navPendingIntent(context, appWidgetId, ACTION_NEXT));

        manager.updateAppWidget(appWidgetId, views);
    }

    private static PendingIntent launchAppPendingIntent(Context context, int appWidgetId) {
        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
                context,
                appWidgetId + 1000,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static PendingIntent navPendingIntent(Context context, int appWidgetId, String action) {
        Intent intent = new Intent(context, WirdStreakWidgetProvider.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_WIDGET_ID, appWidgetId);
        intent.setData(android.net.Uri.parse("wird://widget/" + action + "/" + appWidgetId));
        int requestCode = appWidgetId + (ACTION_NEXT.equals(action) ? 2000 : 3000);
        return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String indexKey(int appWidgetId) {
        return "category_index_" + appWidgetId;
    }

    private static int parseStreak(String raw) {
        if (raw == null) return 0;
        try {
            return Math.max(0, Integer.parseInt(raw));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    /**
     * Same rule as the app (src/js/streak.js getCurrentStreak): a streak is only live if
     * the last active day (3 AM-adjusted) is today or yesterday; otherwise it shows 0.
     */
    static int currentStreak(String storedStreak, String lastActiveDate, Calendar now) {
        int stored = parseStreak(storedStreak);
        if (lastActiveDate == null || lastActiveDate.isEmpty() || stored == 0) return stored;
        Calendar today = (Calendar) now.clone();
        today.add(Calendar.HOUR_OF_DAY, -3);
        Calendar yesterday = (Calendar) today.clone();
        yesterday.add(Calendar.DAY_OF_MONTH, -1);
        if (lastActiveDate.equals(jsDateString(today)) || lastActiveDate.equals(jsDateString(yesterday))) {
            return stored;
        }
        return 0;
    }

    /** The app stores dates with JavaScript's toDateString(), e.g. "Tue Feb 03 2026". */
    static String jsDateString(Calendar c) {
        SimpleDateFormat format = new SimpleDateFormat("EEE MMM dd yyyy", Locale.US);
        format.setTimeZone(c.getTimeZone());
        return format.format(c.getTime());
    }

    private static int autoCategoryIndexByTime() {
        Calendar c = Calendar.getInstance();
        int hour = c.get(Calendar.HOUR_OF_DAY);
        if (hour >= 4 && hour < 12) return 0;   // morning
        if (hour >= 12 && hour < 19) return 1;  // evening
        if (hour >= 19 && hour < 23) return 3;  // sleep
        return 2;                                // waking/night
    }

    private static String todayDataKeyWithRollover() {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.HOUR_OF_DAY, -3);
        int y = c.get(Calendar.YEAR);
        int m = c.get(Calendar.MONTH) + 1;
        int d = c.get(Calendar.DAY_OF_MONTH);
        return "wird_data_" + y + "-" + m + "-" + d;
    }

    private static boolean isCategoryDoneToday(SharedPreferences capacitorPrefs, String category) {
        String key = todayDataKeyWithRollover();
        String raw = capacitorPrefs.getString(key, null);
        if (raw == null || raw.isEmpty()) return false;
        try {
            JSONObject root = new JSONObject(raw);
            JSONObject done = root.optJSONObject("categoriesDone");
            return done != null && done.optBoolean(category, false);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String localizeCategory(Context context, String category) {
        switch (category) {
            case "morning":
                return context.getString(R.string.widget_category_morning);
            case "evening":
                return context.getString(R.string.widget_category_evening);
            case "waking":
                return context.getString(R.string.widget_category_waking);
            case "sleep":
            default:
                return context.getString(R.string.widget_category_sleep);
        }
    }
}
