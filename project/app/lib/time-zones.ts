// The time-zone choice (plan/phase-27.md): the zone the person is most likely
// to want, then common zones, then every other zone, with readable labels.

import { canonicalTimeZone } from "./availability";

/** Zones most bands are likely to be in, offered before the full list. */
export const COMMON_TIME_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Athens",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Pacific/Honolulu",
  "Pacific/Auckland",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  // The runtime still lists the older id for India (Kolkata).
  "Asia/Calcutta",
  "Asia/Dubai",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Cairo",
];

/** Current names for older ids the runtime still lists. */
const CURRENT_NAMES: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata" };

/** "America/Los_Angeles" → "America/Los Angeles"; "Asia/Calcutta" → "Asia/Kolkata". */
export function zoneLabel(zone: string): string {
  return (CURRENT_NAMES[zone] ?? zone).replaceAll("_", " ");
}

/**
 * The zones split for the select: `first` (when given), then the common zones
 * that are in `zones`; `rest` is every other zone in `zones`, in its order.
 * Each zone appears once across both, counting two ids for one zone as one.
 */
export function zoneGroups(
  zones: string[],
  first: string | null,
): { common: string[]; rest: string[] } {
  const offered = new Set(zones);
  // The same zone under two ids (a browser's "Asia/Kolkata", the runtime's
  // "Asia/Calcutta") is offered once, under the first.
  const seen = new Set<string>();
  const common = [
    ...(first && offered.has(first) ? [first] : []),
    ...COMMON_TIME_ZONES.filter((zone) => offered.has(zone)),
  ].filter((zone) => {
    const key = canonicalTimeZone(zone) ?? zone;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { common, rest: zones.filter((zone) => !seen.has(canonicalTimeZone(zone) ?? zone)) };
}
