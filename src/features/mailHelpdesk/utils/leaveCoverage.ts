import { SpocAvailability } from "../types/leaveCoverage";
import { addWorkingHours, WORK_DAY_START } from "./workingHours";

const startOfDay = (d: Date | string): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date | string): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const sameId = (a?: string, b?: string) =>
  String(a || "").toUpperCase() === String(b || "").toUpperCase();

/** Is the SPOC unavailable on the given date (inclusive of from/to days)? */
export function isUnavailableOn(
  a: SpocAvailability,
  date: Date = new Date(),
): boolean {
  if (!a?.fromDate || !a?.toDate) return false;
  return date >= startOfDay(a.fromDate) && date <= endOfDay(a.toDate);
}

/** Has the unavailability window not started yet (scheduled future leave)? */
export function isScheduled(
  a: SpocAvailability,
  date: Date = new Date(),
): boolean {
  if (!a?.fromDate) return false;
  return startOfDay(a.fromDate) > date;
}

/**
 * Find the leave record for a SPOC that is active (or about to start) on the
 * given date — used to decide whether to defer OLA on assignment.
 */
export function getActiveLeaveForSpoc(
  records: SpocAvailability[],
  spocId: string,
  date: Date = new Date(),
): SpocAvailability | null {
  return (
    (records || []).find(
      (r) =>
        sameId(r.spocId, spocId) &&
        (isUnavailableOn(r, date) || isScheduled(r, date)),
    ) || null
  );
}

/**
 * The instant the SPOC resumes office: the start of the first working day
 * after the leave window. OLA starts here.
 */
export function getResumeDate(a: SpocAvailability): Date {
  const dayAfter = startOfDay(a.toDate);
  dayAfter.setDate(dayAfter.getDate() + 1);
  dayAfter.setHours(WORK_DAY_START, 0, 0, 0);
  // Snap forward over weekends to a valid working start.
  return addWorkingHours(dayAfter, 0);
}

/**
 * TAT communicated to the employee = resume date + the standard OLA
 * (working hours) for the ticket's category.
 */
export function computeDeferredTat(
  resume: Date,
  tatWorkingHours: number,
): Date {
  const hrs = Number.isFinite(tatWorkingHours) ? tatWorkingHours : 0;
  return addWorkingHours(resume, hrs);
}

/** UI status for an availability record. */
export type AvailabilityStatus = "unavailable" | "scheduled" | "available";

export function availabilityStatus(
  a: SpocAvailability | null | undefined,
  date: Date = new Date(),
): AvailabilityStatus {
  if (!a) return "available";
  if (isUnavailableOn(a, date)) return "unavailable";
  if (isScheduled(a, date)) return "scheduled";
  return "available";
}
