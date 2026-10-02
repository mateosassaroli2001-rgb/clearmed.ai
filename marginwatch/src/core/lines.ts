// Armado de líneas de factura a partir del texto extraído (por IA, ejemplo o carga manual).
import { proposeMatch } from "./matching";
import { parseDecimalInput } from "./numbers";
import { detectPackaging } from "./packaging";
import { newId, type CatalogItem, type InvoiceLine, type RawLine } from "./types";

function num(raw: string | null, field: string, warnings: string[]): string | null {
  if (raw === null || raw.trim() === "") return null;
  const r = parseDecimalInput(raw);
  if (r.ok) return r.value;
  warnings.push(`${field}: ${r.error}`);
  return null;
}

/** Convierte una línea "cruda" en una línea editable con propuestas de unidad y coincidencia. */
export function buildLine(raw: RawLine, catalog: CatalogItem[]): { line: InvoiceLine; warnings: string[] } {
  const warnings: string[] = [];
  const pack = detectPackaging(raw.presentation, raw.description);
  const discount = raw.discount ? raw.discount.replace("%", "").trim() : null;
  const match = proposeMatch({ code: raw.code ?? "", description: raw.description }, catalog);
  const line: InvoiceLine = {
    id: newId("lin"),
    raw,
    description: raw.description,
    code: raw.code ?? "",
    quantity: num(raw.quantity, "Cantidad", warnings),
    presentation: raw.presentation ?? "",
    unitsPerPack: pack.unitsPerPack,
    unitsPerPackSource: pack.unitsPerPack === null ? null : pack.kind === "pack" ? "detectado" : "unidad",
    unitPrice: num(raw.unitPrice, "Precio unitario", warnings),
    lineAmount: num(raw.amount, "Importe", warnings),
    discountPercent: num(discount, "Descuento", warnings),
    amountSource: "auto",
    match,
    confirmed: false,
    ignored: false,
  };
  return { line, warnings: warnings.map((w) => `Línea "${raw.description.slice(0, 40)}": ${w}`) };
}

export function emptyRawLine(): RawLine {
  return { text: "", description: "", code: null, quantity: null, presentation: null, unitPrice: null, amount: null, discount: null };
}
