// Componentes simples reutilizables.
import { useEffect, useState, type ReactNode } from "react";
import { parseDecimalInput } from "../core/numbers";

export function Banner({ tone, title, children }: { tone: "info" | "ok" | "warn" | "error" | "demo"; title?: string; children?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {title && <strong className="banner-title">{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner-row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

/**
 * Campo numérico que acepta "1.234,56" o "1234.56".
 * Guarda el texto tal cual (normalizado si es válido) y muestra el error si no se puede interpretar.
 */
export function NumberField(props: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  hint?: ReactNode;
  placeholder?: string;
  suffix?: string;
  id: string;
  compact?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(props.value ?? "");
  useEffect(() => setText(props.value ?? ""), [props.value]);
  const parsed = text.trim() === "" ? null : parseDecimalInput(text);
  const error = parsed && !parsed.ok ? parsed.error : null;
  const commit = () => {
    const t = text.trim();
    if (t === "") props.onChange(null);
    else {
      const r = parseDecimalInput(t);
      props.onChange(r.ok ? r.value : t.slice(0, 40));
    }
  };
  return (
    <label className={`field ${props.compact ? "field-compact" : ""} ${props.className ?? ""}`} htmlFor={props.id}>
      <span className="field-label">{props.label}</span>
      <span className="field-input-wrap">
        <input
          id={props.id}
          inputMode="decimal"
          className={props.suffix ? "has-suffix" : undefined}
          value={text}
          placeholder={props.placeholder}
          aria-invalid={!!error}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        {props.suffix && <span className="field-suffix">{props.suffix}</span>}
      </span>
      {error ? <span className="field-error">{error}</span> : props.hint ? <span className="field-hint">{props.hint}</span> : null}
    </label>
  );
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; id: string; placeholder?: string; maxLength?: number }) {
  const [text, setText] = useState(props.value);
  useEffect(() => setText(props.value), [props.value]);
  return (
    <label className="field" htmlFor={props.id}>
      <span className="field-label">{props.label}</span>
      <input
        id={props.id}
        value={text}
        maxLength={props.maxLength ?? 200}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== props.value && props.onChange(text.trim())}
      />
    </label>
  );
}
