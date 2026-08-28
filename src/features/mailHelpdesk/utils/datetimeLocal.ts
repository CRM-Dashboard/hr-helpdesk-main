/**
 * `<input type="datetime-local">` speaks local wall-clock time with no zone;
 * the helpdesk API speaks ISO 8601 with one. These two functions are the only
 * place that conversion happens, so an off-by-a-timezone bug has one home.
 */

/**
 * Formats a moment for a `datetime-local` input.
 *
 * `toISOString()` would be wrong here — it converts to UTC, so an agent in
 * IST would see a control reading 05:30 behind what they picked.
 *
 * @param date the moment to show, or null for an empty control
 * @returns "YYYY-MM-DDTHH:mm" in the viewer's own zone, or "" when absent
 */
export const toDatetimeLocalValue = (date: Date | null | undefined): string => {
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

/**
 * Reads a `datetime-local` value back as an absolute moment.
 *
 * `new Date("YYYY-MM-DDTHH:mm")` is already interpreted as local time by every
 * browser, which is exactly what the control means; this wrapper exists to
 * reject the empty and unparsable cases in one place.
 *
 * @param value the input's `value`
 * @returns an ISO 8601 string with the offset resolved, or null when unusable
 */
export const fromDatetimeLocalValue = (value: string): string | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * The same moment tomorrow (or N days out), at a fixed hour.
 *
 * Used for the snooze presets, which are wall-clock: the department's WORKING
 * calendar is the server's business, and it will refuse a duration that spends
 * more working minutes than the department allows.
 *
 * @param days how many days ahead
 * @param hour local hour of day, 0–23
 * @returns the resulting moment
 */
export const atHourInDays = (days: number, hour: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

/**
 * The next occurrence of a weekday, at a fixed hour — "next Monday, 9am".
 *
 * @param weekday 0 = Sunday … 6 = Saturday
 * @param hour local hour of day, 0–23
 * @returns the next such moment, always strictly in the future
 */
export const nextWeekdayAt = (weekday: number, hour: number): Date => {
  const date = new Date();
  const delta = (weekday - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  date.setHours(hour, 0, 0, 0);
  return date;
};
