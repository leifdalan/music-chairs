import type { SlotErrors, SlotFormValues } from "~/lib/availability";

/**
 * How often, date, start/end times and an optional last date: the fields of
 * every slot-shaped form (member availability, organizer rehearsals). Values
 * and errors come from `parseSlotInput`, which validates them on the server.
 */
export function SlotFields({ values, errors }: { values: SlotFormValues; errors: SlotErrors }) {
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
      <div className="time-pair">
        <div className="field">
          <label htmlFor="startTime">From</label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            step={1800}
            required
            defaultValue={values.startTime}
            aria-invalid={errors.startTime ? true : undefined}
            aria-describedby={described("startTime")}
          />
          {error("startTime")}
        </div>
        <div className="field">
          <label htmlFor="endTime">Until</label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            step={1800}
            required
            defaultValue={values.endTime}
            aria-invalid={errors.endTime ? true : undefined}
            aria-describedby={described("endTime", "endTime-hint")}
          />
          <p className="hint" id="endTime-hint">
            :00 or :30. Use 00:00 for midnight.
          </p>
          {error("endTime")}
        </div>
      </div>
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
