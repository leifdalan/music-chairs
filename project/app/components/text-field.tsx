/**
 * A labelled text input with its validation message, shared by the app's forms.
 * Length limits are enforced only by `validateName`, which counts code points;
 * an HTML `maxLength` would count UTF-16 units and disagree for emoji.
 */
export function TextField({
  name,
  label,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type="text"
        required
        autoComplete="off"
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
