import React from "react";

type NotchedRangeProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max" | "step"> & {
  min: number;
  max: number;
  step?: number;
  value: number;
  onValueChange?: (value: number) => void;
  /** Füllfarbe der Spur bis zum Wert (CSS-Farbe); Standard: var(--fg-2) wie «Steuer-Anpassung» */
  fill?: string;
};

/** Kerben nur bei wenigen festen Werten (z. B. Rentenalter 56–70 = 15); bei vielen Werten wären sie Rauschen */
export const MAX_NOTCHED_POINTS = 15;

/**
 * Schieberegler mit feinem vertikalem Knopf und gekerbter Spur: an jedem Einrastpunkt eine kleine Lücke,
 * die Spur ist bis zum Wert gefüllt. Gewählt in Impeccable live (Variante «gekerbte Spur»).
 * Kerben erscheinen nur, wenn der Regler höchstens MAX_NOTCHED_POINTS Einrastpunkte hat.
 */
export function NotchedRange({ min, max, step = 1, value, onValueChange, onChange, fill, className, style, disabled, ...rest }: NotchedRangeProps) {
  const span = max - min || 1;
  const percent = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const notches = step > 0 ? Math.round(span / step) : 0; // Abstände zwischen den Einrastpunkten
  const showNotches = notches >= 1 && notches + 1 <= MAX_NOTCHED_POINTS;
  const vars = {
    "--fill": `${percent}%`,
    "--notches": showNotches ? notches : 1,
    ...(fill ? { "--range-fill": fill } : {}),
    ...style,
  } as React.CSSProperties;
  return (
    <div className={`notched-range${showNotches ? " notched-range--notched" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`} style={vars}>
      <span className="notched-range__track" aria-hidden />
      <input
        {...rest}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(Number(event.target.value));
        }}
      />
    </div>
  );
}
