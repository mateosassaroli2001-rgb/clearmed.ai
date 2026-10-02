// CSV de propuestas aprobadas, para revisión.
// IMPORTANTE: no es un archivo de importación de Shopify. Su formato todavía no se
// verificó contra la documentación oficial, así que no debe subirse a una tienda.
import { roundCents, type Dec } from "./numbers";
import type { ProposalRow } from "./margins";
import { TAX_BASIS_LABEL, type Invoice, type Settings } from "./types";

const HEADERS = [
  "sku",
  "producto",
  "variante",
  "moneda",
  "costo_anterior",
  "costo_nuevo",
  "variacion_costo_pct",
  "precio_actual",
  "margen_bruto_estimado_actual_pct",
  "margen_bruto_estimado_con_costo_nuevo_pct",
  "margen_objetivo_pct",
  "precio_sugerido",
  "precio_propuesto",
  "margen_bruto_estimado_propuesto_pct",
  "base_tributaria",
  "proveedor",
  "factura",
  "fecha_factura",
  "aviso",
];

const NOTE =
  "Propuesta para revisión. Margen bruto estimado: no incluye envío, comisiones ni otros gastos. No es un archivo de importación de Shopify.";

const money = (d: Dec | null) => (d ? roundCents(d).toFixed(2) : "");
const percent = (d: Dec | null) => (d ? d.times(100).toFixed(2) : "");

/** Escapa un texto para CSV y evita que una planilla lo interprete como fórmula. */
function cell(value: string, isText: boolean): string {
  let v = value;
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r;]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function approvedRows(rows: ProposalRow[]): ProposalRow[] {
  return rows.filter((r) => r.status === "ok" && r.approved && r.finalPrice && !r.finalPriceError);
}

export function buildProposalsCsv(rows: ProposalRow[], invoice: Invoice, settings: Settings): string {
  const lines = [HEADERS.join(",")];
  for (const r of approvedRows(rows)) {
    const values: [string, boolean][] = [
      [r.item.sku, true],
      [r.item.name, true],
      [r.item.variant, true],
      [r.item.currency, true],
      [money(r.oldCost), false],
      [money(r.newCost), false],
      [percent(r.costChangeFraction), false],
      [money(r.price), false],
      [percent(r.oldMargin), false],
      [percent(r.newMargin), false],
      [r.targetPercent, false],
      [money(r.suggested), false],
      [money(r.finalPrice), false],
      [percent(r.finalMargin), false],
      [settings.catalogTaxBasis ? TAX_BASIS_LABEL[settings.catalogTaxBasis] : "", true],
      [invoice.supplier, true],
      [invoice.invoiceNumber, true],
      [invoice.date, true],
      [NOTE, true],
    ];
    lines.push(values.map(([v, t]) => cell(v, t)).join(","));
  }
  // BOM para que Excel reconozca los acentos (UTF-8)
  return "﻿" + lines.join("\r\n") + "\r\n";
}
