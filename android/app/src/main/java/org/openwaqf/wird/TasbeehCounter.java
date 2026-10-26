package org.openwaqf.wird;

import java.util.Calendar;

/**
 * Counting rules of the tasbeeh widget (pure Java, unit-tested).
 * A group is a sequence of dhikr targets, e.g. {33, 33, 34} or {100}. The state is the
 * current step and the count within that step; step == targets.length means done.
 */
final class TasbeehCounter {

    /** What a tap did, so the widget knows how to vibrate. */
    enum Tap { COUNTED, STEP_DONE, GROUP_DONE, IGNORED }

    int step;
    int count;

    TasbeehCounter(int step, int count) {
        this.step = step;
        this.count = count;
    }

    boolean isDone(int[] targets) {
        return step >= targets.length;
    }

    /** One tap: +1, and move to the next dhikr when the current one reaches its target. */
    Tap tap(int[] targets) {
        if (targets.length == 0 || isDone(targets)) return Tap.IGNORED;
        count++;
        if (count < targets[step]) return Tap.COUNTED;
        step++;
        count = 0;
        return isDone(targets) ? Tap.GROUP_DONE : Tap.STEP_DONE;
    }

    /** The count to show: the full target once the group is done. */
    int shownCount(int[] targets) {
        if (targets.length == 0) return 0;
        return isDone(targets) ? targets[targets.length - 1] : count;
    }

    /** The dhikr to show: the last one once the group is done. */
    int shownStep(int[] targets) {
        return Math.max(0, Math.min(step, targets.length - 1));
    }

    /** Same day boundary as the app: before 3 AM counts as the previous day. */
    static String dayKey(Calendar now) {
        Calendar c = (Calendar) now.clone();
        c.add(Calendar.HOUR_OF_DAY, -3);
        return c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH);
    }

    /** Next 03:00 (plus a few seconds), when the counters reset. */
    static long nextDayChangeAt(Calendar now) {
        Calendar t = (Calendar) now.clone();
        t.set(Calendar.HOUR_OF_DAY, 3);
        t.set(Calendar.MINUTE, 0);
        t.set(Calendar.SECOND, 5);
        t.set(Calendar.MILLISECOND, 0);
        if (!t.after(now)) t.add(Calendar.DAY_OF_MONTH, 1);
        return t.getTimeInMillis();
    }
}
