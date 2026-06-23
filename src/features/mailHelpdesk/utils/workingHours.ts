/**
 * Working-hour helpers for OLA / snooze calculations.
 *
 * BRD 7.9: snooze pauses the OLA for up to a maximum of 24 *working* hours.
 * We model a simple business calendar: Mon–Fri, WORK_DAY_START..WORK_DAY_END.
 * This is intentionally lightweight (no holiday calendar) and can be swapped
 * for a backend-provided calendar later.
 */

export const WORK_DAY_START = 9; // 09:00
export const WORK_DAY_END = 18; // 18:00
export const WORK_HOURS_PER_DAY = WORK_DAY_END - WORK_DAY_START; // 9h

/** BRD limits. */
export const MAX_SNOOZE_WORKING_HOURS = 24;
export const MAX_SNOOZE_COUNT = 3;

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** Move a date forward to the next instant that falls within working hours. */
function advanceToWorkingTime(d: Date): Date {
  const out = new Date(d);
  // Skip weekends.
  while (isWeekend(out)) {
    out.setDate(out.getDate() + 1);
    out.setHours(WORK_DAY_START, 0, 0, 0);
  }
  if (out.getHours() < WORK_DAY_START) {
    out.setHours(WORK_DAY_START, 0, 0, 0);
  } else if (out.getHours() >= WORK_DAY_END) {
    // Past end of day → start of next day.
    out.setDate(out.getDate() + 1);
    out.setHours(WORK_DAY_START, 0, 0, 0);
    return advanceToWorkingTime(out);
  }
  return out;
}

/**
 * Add `hours` working hours to `start`, skipping non-working time.
 * Returns the resulting Date.
 */
export function addWorkingHours(start: Date, hours: number): Date {
  let remainingMs = Math.max(0, hours) * 60 * 60 * 1000;
  let cursor = advanceToWorkingTime(new Date(start));

  while (remainingMs > 0) {
    const endOfDay = new Date(cursor);
    endOfDay.setHours(WORK_DAY_END, 0, 0, 0);
    const msLeftToday = endOfDay.getTime() - cursor.getTime();

    if (remainingMs <= msLeftToday) {
      cursor = new Date(cursor.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= msLeftToday;
      // Jump to start of next working day.
      cursor = new Date(endOfDay);
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORK_DAY_START, 0, 0, 0);
      cursor = advanceToWorkingTime(cursor);
    }
  }
  return cursor;
}

/** Preset snooze durations (in working hours), capped at the BRD maximum. */
export const SNOOZE_PRESETS: { label: string; hours: number }[] = [
  { label: "2 working hours", hours: 2 },
  { label: "4 working hours", hours: 4 },
  { label: "8 working hours (1 day)", hours: 8 },
  { label: "16 working hours (2 days)", hours: 16 },
  { label: "24 working hours (3 days)", hours: MAX_SNOOZE_WORKING_HOURS },
];
