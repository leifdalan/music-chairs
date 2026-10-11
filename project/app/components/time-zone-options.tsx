import { zoneGroups, zoneLabel } from "~/lib/time-zones";

/** A time-zone select's options: common zones first, then the others (plan/phase-27.md). */
export function TimeZoneOptions({ zones, first }: { zones: string[]; first: string | null }) {
  const { common, rest } = zoneGroups(zones, first);
  return (
    <>
      <optgroup label="Common time zones">
        {common.map((zone) => (
          <option key={zone} value={zone}>
            {zoneLabel(zone)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Other time zones">
        {rest.map((zone) => (
          <option key={zone} value={zone}>
            {zoneLabel(zone)}
          </option>
        ))}
      </optgroup>
    </>
  );
}
