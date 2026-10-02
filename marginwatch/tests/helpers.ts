import { buildLine } from "../src/core/lines";
import type { CatalogItem, Invoice, InvoiceLine, Settings } from "../src/core/types";

export const settings: Settings = { catalogTaxBasis: "sin_impuestos", targetMarginPercent: "35" };

export function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return { id: "p1", sku: "SKU-1", name: "Producto", variant: "", unitCost: "100", price: "200", currency: "ARS", ...over };
}

export function line(over: Partial<InvoiceLine> = {}): InvoiceLine {
  const base = buildLine(
    { text: "", description: "Producto", code: "SKU-1", quantity: "1", presentation: null, unitPrice: null, amount: null, discount: null },
    [],
  ).line;
  return {
    ...base,
    quantity: "1",
    unitsPerPack: "1",
    unitsPerPackSource: "unidad",
    lineAmount: "120",
    unitPrice: null,
    match: { catalogItemId: "p1", status: "sku_exacto", candidates: [], note: null },
    confirmed: true,
    ...over,
  };
}

export function invoice(lines: InvoiceLine[], over: Partial<Invoice> = {}): Invoice {
  return {
    id: "f1",
    createdAt: "",
    updatedAt: "",
    source: "manual",
    file: null,
    extraction: { status: "manual", provider: null, model: null, message: null, warnings: [] },
    supplier: "Proveedor",
    invoiceNumber: "1",
    date: "2026-09-28",
    currency: "ARS",
    taxBasis: "sin_impuestos",
    taxRatePercent: null,
    globalDiscountPercent: null,
    lines,
    proposals: {},
    ...over,
  };
}
