// Números con precisión decimal (nunca usamos floats de JavaScript para dinero).
// Los importes se guardan como texto normalizado ("1234.56") y se operan con decimal.js.
import Decimal from "decimal.js";

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export type ParseResult =
  | { ok: true; value: string }
  | { ok: false; empty: boolean; error: string };

const CURRENCY_NOISE = /[\s $€£]|ARS|USD|EUR|MXN|CLP|COP|UYU|PEN|BRL|R\$/gi;

/**
 * Interpreta un número escrito por una persona o exportado de una planilla.
 * Acepta "1234.56", "1.234,56", "1,234.56", "12,5", "$ 1.500,00".
 * Rechaza formatos ambiguos como "1.500" o "2,000" (¿mil quinientos o uno coma cinco?)
 * en lugar de adivinar.
 */
export function parseDecimalInput(raw: unknown): ParseResult {
  if (raw === null || raw === undefined) return { ok: false, empty: true, error: "Vacío" };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, empty: false, error: "Número inválido" };
    return { ok: true, value: new Dec(raw).toString() };
  }
  if (typeof raw !== "string") return { ok: false, empty: false, error: "Valor no numérico" };

  let s = raw.trim();
  if (s === "") return { ok: false, empty: true, error: "Vacío" };
  s = s.replace(CURRENCY_NOISE, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) {
    return { ok: false, empty: false, error: `"${raw}" no es un número válido` };
  }

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let normalized: string;

  if (dots > 0 && commas > 0) {
    const decimalSep = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thousandsSep = decimalSep === "." ? "," : ".";
    const [intPart, decPart, ...rest] = s.split(decimalSep);
    if (rest.length > 0 || decPart === undefined || decPart.includes(thousandsSep)) {
      return { ok: false, empty: false, error: `"${raw}" tiene separadores inválidos` };
    }
    if (!validThousands(intPart ?? "", thousandsSep)) {
      return { ok: false, empty: false, error: `"${raw}" tiene separadores de miles inválidos` };
    }
    normalized = `${(intPart ?? "").split(thousandsSep).join("")}.${decPart}`;
  } else if (dots + commas === 0) {
    normalized = s;
  } else {
    const sep = dots > 0 ? "." : ",";
    const count = dots + commas;
    if (count > 1) {
      // "1.234.567" → separador de miles
      if (!validThousands(s, sep)) {
        return { ok: false, empty: false, error: `"${raw}" tiene separadores inválidos` };
      }
      normalized = s.split(sep).join("");
    } else {
      const [intPart = "", decPart = ""] = s.split(sep);
      if (decPart.length === 3 && intPart.length >= 1 && intPart.length <= 3 && intPart !== "0") {
        return {
          ok: false,
          empty: false,
          error: `"${raw}" es ambiguo (¿miles o decimales?). Escribilo sin separador de miles, por ejemplo 1500 o 1.5`,
        };
      }
      normalized = `${intPart || "0"}.${decPart || "0"}`;
    }
  }

  try {
    const d = new Dec(normalized);
    if (!d.isFinite()) return { ok: false, empty: false, error: "Número inválido" };
    return { ok: true, value: (negative ? d.negated() : d).toString() };
  } catch {
    return { ok: false, empty: false, error: `"${raw}" no es un número válido` };
  }
}

function validThousands(intPart: string, sep: string): boolean {
  const groups = intPart.split(sep);
  if (groups.length === 1) return /^\d+$/.test(intPart);
  const [first, ...others] = groups;
  return /^\d{1,3}$/.test(first ?? "") && others.every((g) => /^\d{3}$/.test(g));
}

/** Convierte un texto normalizado ya guardado ("12.5") a Decimal, o null si está vacío/inválido. */
export function toDec(value: string | null | undefined): Dec | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const r = parseDecimalInput(value);
  return r.ok ? new Dec(r.value) : null;
}

/** Redondea hacia arriba al centavo (para que el precio sugerido nunca quede por debajo del margen objetivo). */
export function ceilToCents(d: Dec): Dec {
  return d.toDecimalPlaces(2, Dec.ROUND_UP);
}

export function roundCents(d: Dec): Dec {
  return d.toDecimalPlaces(2, Dec.ROUND_HALF_UP);
}

export function formatMoney(value: Dec | string | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined) return "—";
  const d = typeof value === "string" ? toDec(value) : value;
  if (!d) return "—";
  const fixed = roundCents(d).toFixed(2);
  const [intPart = "0", decPart = "00"] = fixed.replace("-", "").split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = d.isNegative() && !roundCents(d).isZero() ? "-" : "";
  return `${sign}${currency ? currency + " " : ""}${withThousands},${decPart}`;
}

/** Fracción (0.25) → "25,0 %" */
export function formatPercent(fraction: Dec | null | undefined, decimals = 1): string {
  if (fraction === null || fraction === undefined) return "—";
  return `${fraction.times(100).toFixed(decimals).replace(".", ",")} %`;
}
