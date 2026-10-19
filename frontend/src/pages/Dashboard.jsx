import { useId } from 'react';

export default function Field({ label, error, hint, ...inputProps }) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={error ? 'is-invalid' : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...inputProps}
      />
      {(error || hint) && (
        <p id={messageId} className={error ? 'field__error' : 'field__hint'}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
