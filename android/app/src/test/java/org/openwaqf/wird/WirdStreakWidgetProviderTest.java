package org.openwaqf.wird;

import static org.junit.Assert.assertEquals;

import java.util.Calendar;
import java.util.TimeZone;

import org.junit.Test;

/** Date logic of the home-screen streak widget (pure functions, no Android needed). */
public class WirdStreakWidgetProviderTest {

    private static Calendar at(int year, int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Paris"));
        c.clear();
        c.set(year, month - 1, day, hour, minute, 0);
        return c;
    }

    // --- Same date text as the app's JavaScript toDateString() ---

    @Test
    public void jsDateStringMatchesTheApp() {
        assertEquals("Tue Feb 03 2026", WirdStreakWidgetProvider.jsDateString(at(2026, 2, 3, 12, 0)));
        assertEquals("Mon Oct 26 2026", WirdStreakWidgetProvider.jsDateString(at(2026, 10, 26, 9, 30)));
    }

    // --- Streak: live only if the last active day is today or yesterday (3 AM-adjusted) ---

    @Test
    public void streakIsKeptWhenActiveToday() {
        assertEquals(12, WirdStreakWidgetProvider.currentStreak("12", "Mon Oct 26 2026", at(2026, 10, 26, 20, 0)));
    }

    @Test
    public void streakIsKeptWhenActiveYesterday() {
        assertEquals(12, WirdStreakWidgetProvider.currentStreak("12", "Sun Oct 25 2026", at(2026, 10, 26, 20, 0)));
    }

    @Test
    public void streakShowsZeroAfterAMissedDay() {
        assertEquals(0, WirdStreakWidgetProvider.currentStreak("12", "Sat Oct 24 2026", at(2026, 10, 26, 20, 0)));
    }

    @Test
    public void beforeThreeAmStillCountsAsThePreviousDay() {
        // 01:00 on Oct 27 is still "Oct 26" for the app, so Oct 25 is "yesterday": kept.
        assertEquals(5, WirdStreakWidgetProvider.currentStreak("5", "Sun Oct 25 2026", at(2026, 10, 27, 1, 0)));
        // At 04:00 on Oct 27 the day has changed: Oct 25 is now two days ago.
        assertEquals(0, WirdStreakWidgetProvider.currentStreak("5", "Sun Oct 25 2026", at(2026, 10, 27, 4, 0)));
    }

    @Test
    public void streakAcrossAMonthBoundary() {
        assertEquals(3, WirdStreakWidgetProvider.currentStreak("3", "Sat Oct 31 2026", at(2026, 11, 1, 10, 0)));
    }

    @Test
    public void unreadableOrMissingValuesAreSafe() {
        assertEquals(0, WirdStreakWidgetProvider.currentStreak("abc", "Mon Oct 26 2026", at(2026, 10, 26, 10, 0)));
        assertEquals(0, WirdStreakWidgetProvider.currentStreak(null, null, at(2026, 10, 26, 10, 0)));
        // No last-active date yet: show the stored value, like the app
        assertEquals(4, WirdStreakWidgetProvider.currentStreak("4", null, at(2026, 10, 26, 10, 0)));
    }

    // --- Next self-refresh: 03:00 day change or a category switch hour (04, 12, 19, 23) ---

    @Test
    public void nextRefreshIsTheNextChangeTime() {
        assertEquals(at(2026, 10, 26, 12, 0).getTimeInMillis() + 5000,
                WirdStreakWidgetProvider.nextRefreshAt(at(2026, 10, 26, 9, 15)));
        assertEquals(at(2026, 10, 26, 19, 0).getTimeInMillis() + 5000,
                WirdStreakWidgetProvider.nextRefreshAt(at(2026, 10, 26, 12, 1)));
    }

    @Test
    public void lateEveningRefreshesAtTheThreeAmDayChange() {
        assertEquals(at(2026, 10, 27, 3, 0).getTimeInMillis() + 5000,
                WirdStreakWidgetProvider.nextRefreshAt(at(2026, 10, 26, 23, 30)));
    }
}
