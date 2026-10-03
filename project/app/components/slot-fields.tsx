import type { SlotErrors, SlotFormValues } from "~/lib/availability";

import type { TimeWindow } from "~/lib/requests";

import { TimeRange } from "./time-range";

/**
 * How often, date, start/end times and an optional last date: the fields of
 * every slot-shaped form (member availability, organizer rehearsals). Values
 * and errors come from `parseSlotInput`, which validates them on the server.
 */
export function SlotFields({
  values,
  errors,
  presets,
}: {
  values: SlotFormValues;
  errors: SlotErrors;
  /** Ranges offered as chips above the time grid (a request's times of day). */
  presets?: TimeWindow[];
}) {
  const error = (name: keyof SlotFormValues) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;
  const described = (name: keyof SlotFormValues, hint?: string) =>
    errors[name] ? `${name}-error` : hint;
  return (
    <>
      <fieldset className="kind" aria-describedby={described("kind")}>
        <legend>How often</legend>
        <label>
          <input type="radio" name="kind" value="weekly" defaultChecked={values.kind !== "once"} />
          Every week
        </label>
        <label>
          <input type="radio" name="kind" value="once" defaultChecked={values.kind === "once"} />
          One-off
        </label>
        {error("kind")}
      </fieldset>
      <div className="field">
        <label htmlFor="startDate">Date</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          defaultValue={values.startDate}
          aria-invalid={errors.startDate ? true : undefined}
          aria-describedby={described("startDate", "startDate-hint")}
        />
        <p className="hint" id="startDate-hint">
          For every week, the first date; it repeats on that weekday.
        </p>
        {error("startDate")}
      </div>
      <TimeRange
        startName="startTime"
        endName="endTime"
        startValue={values.startTime}
        endValue={values.endTime}
        presets={presets}
        startError={errors.startTime}
        endError={errors.endTime}
        endHint="Any time; rounded to the nearest 15 minutes. Use 00:00 for midnight."
        required
      />
      <div className="field weekly-only">
        <label htmlFor="endDate">Last date (optional, every week only)</label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={values.endDate}
          aria-invalid={errors.endDate ? true : undefined}
          aria-describedby={described("endDate")}
        />
        {error("endDate")}
      </div>
    </>
  );
}
