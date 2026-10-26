package org.openwaqf.wird;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Calendar;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

/** Tasbeeh widget: counting rules, daily reset boundary, and the data it relies on. */
public class TasbeehWidgetTest {

    private static final int[] SLEEP = {33, 33, 34};
    private static final int[] HUNDRED = {100};

    private static Calendar at(int year, int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance(TimeZone.getTimeZone("Europe/Paris"));
        c.clear();
        c.set(year, month - 1, day, hour, minute, 0);
        return c;
    }

    private static TasbeehCounter.Tap tapTimes(TasbeehCounter c, int[] targets, int times) {
        TasbeehCounter.Tap last = null;
        for (int i = 0; i < times; i++) last = c.tap(targets);
        return last;
    }

    // --- Counting ---

    @Test
    public void countsUpWithinADhikr() {
        TasbeehCounter c = new TasbeehCounter(0, 0);
        assertEquals(TasbeehCounter.Tap.COUNTED, tapTimes(c, SLEEP, 12));
        assertEquals(0, c.step);
        assertEquals(12, c.count);
    }

    @Test
    public void movesToTheNextDhikrAtItsTarget() {
        TasbeehCounter c = new TasbeehCounter(0, 0);
        assertEquals(TasbeehCounter.Tap.STEP_DONE, tapTimes(c, SLEEP, 33)); // strong vibration here
        assertEquals(1, c.step);
        assertEquals(0, c.count);
        assertEquals(TasbeehCounter.Tap.STEP_DONE, tapTimes(c, SLEEP, 33));
        assertEquals(2, c.step);
    }

    @Test
    public void lastDhikrNeeds34AndThenTheGroupIsDone() {
        TasbeehCounter c = new TasbeehCounter(2, 0);
        assertEquals(TasbeehCounter.Tap.COUNTED, tapTimes(c, SLEEP, 33));
        assertEquals(TasbeehCounter.Tap.GROUP_DONE, c.tap(SLEEP));
        assertTrue(c.isDone(SLEEP));
        // Shown as the last dhikr at its full count (gold)
        assertEquals(2, c.shownStep(SLEEP));
        assertEquals(34, c.shownCount(SLEEP));
    }

    @Test
    public void tapsAfterDoneAreIgnored() {
        TasbeehCounter c = new TasbeehCounter(0, 0);
        assertEquals(TasbeehCounter.Tap.GROUP_DONE, tapTimes(c, HUNDRED, 100));
        assertEquals(TasbeehCounter.Tap.IGNORED, c.tap(HUNDRED));
        assertEquals(100, c.shownCount(HUNDRED));
    }

    @Test
    public void aMissingGroupNeverCrashes() {
        TasbeehCounter c = new TasbeehCounter(0, 0);
        assertEquals(TasbeehCounter.Tap.IGNORED, c.tap(new int[0]));
        assertEquals(0, c.shownCount(new int[0]));
        assertFalse(c.isDone(SLEEP));
    }

    // --- Daily reset at 3 AM, like the app ---

    @Test
    public void beforeThreeAmIsStillThePreviousDay() {
        assertEquals("2026-10-26", TasbeehCounter.dayKey(at(2026, 10, 27, 2, 59)));
        assertEquals("2026-10-27", TasbeehCounter.dayKey(at(2026, 10, 27, 3, 0)));
    }

    @Test
    public void nextResetIsTheComing3Am() {
        assertEquals(at(2026, 10, 27, 3, 0).getTimeInMillis() + 5000,
                TasbeehCounter.nextDayChangeAt(at(2026, 10, 26, 22, 0)));
        assertEquals(at(2026, 10, 27, 3, 0).getTimeInMillis() + 5000,
                TasbeehCounter.nextDayChangeAt(at(2026, 10, 27, 1, 0)));
    }

    // --- The dhikr the widget reads from the app's data.json ---

    @Test
    public void dataJsonStillHasTheSixDhikrWithTheirCounts() throws Exception {
        String json = new String(Files.readAllBytes(Paths.get("../../www/data.json")), StandardCharsets.UTF_8);
        String[][] expected = {
                {"sleep-tasbih-1", "33"}, {"sleep-tasbih-2", "33"}, {"sleep-tasbih-3", "34"},
                {"count-2", "100"}, {"count-istighfar", "100"}, {"count-la-ilaha", "100"},
        };
        for (String[] e : expected) {
            Matcher m = Pattern.compile("\"id\"\\s*:\\s*\"" + e[0] + "\"(?:(?!\"id\").)*?\"repeat\"\\s*:\\s*(\\d+)", Pattern.DOTALL).matcher(json);
            assertTrue("missing in data.json: " + e[0], m.find());
            assertEquals("repeat of " + e[0], e[1], m.group(1));
        }
    }
}
