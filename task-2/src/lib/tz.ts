import { formatInTimeZone } from "date-fns-tz";

const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

export function listTimezones(): string[] {
  // Prefer the runtime list when available (browsers + modern Node).
  const intlAny = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof intlAny.supportedValuesOf === "function") {
    try {
      return intlAny.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return COMMON_TIMEZONES;
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function formatEventDateTime(iso: string, tz: string): string {
  // e.g. "Sat, Jun 14 · 7:00 PM PDT"
  return formatInTimeZone(new Date(iso), tz, "EEE, MMM d · h:mm a zzz");
}

export function formatEventDate(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, "EEE, MMM d, yyyy");
}

export function formatEventTime(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, "h:mm a zzz");
}
