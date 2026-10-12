import type { RehearsalErrors, RehearsalFormValues } from "~/lib/rehearsal";

import { TimeRange } from "./time-range";

/**
 * A rehearsal's date and its start and end times, for "Propose a different
 * time" (plan/phase-29.md: every rehearsal is one date). Values and errors come
 * from `parseRehearsalInput`, which validates them on the server.
 */
export function RehearsalFields({
  values,
  errors,
}: {
  values: RehearsalFormValues;
  errors: RehearsalErrors;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="date">Date</label>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={values.date}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? "date-error" : undefined}
        />
        {errors.date ? (
          <p className="field-error" id="date-error" role="alert">
            {errors.date}
          </p>
        ) : null}
      </div>
      <TimeRange
        startName="startTime"
        endName="endTime"
        startValue={values.startTime}
        endValue={values.endTime}
        startError={errors.startTime}
        endError={errors.endTime}
        required
      />
    </>
  );
}
