// Cálculo de costos unitarios, márgenes y precios sugeridos.
//
//   Margen bruto      = (precio de venta − costo) / precio de venta
//   Precio sugerido   = costo / (1 − margen objetivo)
//
// Ojo: el margen NO es el recargo sobre costo. Con costo 100 y precio 150,
// el recargo es 50 % pero el margen es 33,3 %.
//
// Es un "margen bruto estimado": no incluye envío, comisiones ni otros gastos.
import { Dec, ceilToCents, toDec } from "./numbers";
import type { CatalogItem, Invoice, InvoiceLine, Settings } from "./types";

export function grossMargin(price: Dec, cost: Dec): Dec | null {
  if (price.lte(0)) return null;
  return price.minus(cost).div(price);
}

/** Recargo sobre costo (sólo informativo, para explicar la diferencia con el margen). */
export function markupOnCost(price: Dec, cost: Dec): Dec | null {
  if (cost.lte(0)) return null;
  return price.minus(cost).div(cost);
}

export type TargetMarginResult = { ok: true; fraction: Dec } | { ok: false; error: string };

/** Valida un margen objetivo escrito en porcentaje ("35" → 0,35). Debe ser ≥ 0 y < 100. */
export function parseTargetMargin(percent: string | null | undefined): TargetMarginResult {
  const d = toDec(percent ?? null);
  if (!d) return { ok: false, error: "Ingresá un margen objetivo válido (por ejemplo 35)." };
  if (d.lt(0)) return { ok: false, error: "El margen objetivo no puede ser negativo." };
  if (d.gte(100)) return { ok: false, error: "El margen objetivo debe ser menor a 100 %." };
  return { ok: true, fraction: d.div(100) };
}

/** Precio que logra el margen objetivo, redondeado hacia arriba al centavo. */
export function suggestedPrice(cost: Dec, targetFraction: Dec): Dec | null {
  if (cost.lt(0) || targetFraction.lt(0) || targetFraction.gte(1)) return null;
  return ceilToCents(cost.div(new Dec(1).minus(targetFraction)));
}

export type LineCostResult =
  | {
      ok: true;
      /** Unidades vendibles compradas (cantidad × unidades por presentación). */
      units: Dec;
      /** Costo total de la línea en la base tributaria del catálogo. */
      totalCost: Dec;
      unitCost: Dec;
      notes: string[];
    }
  | { ok: false; reasons: string[] };

function pct(value: string | null, label: string, reasons: string[]): Dec {
  if (value === null || value.trim() === "") return new Dec(0);
  const d = toDec(value);
  if (!d) {
    reasons.push(`${label}: valor inválido.`);
    return new Dec(0);
  }
  if (d.lt(0) || d.gte(100)) {
    reasons.push(`${label}: debe estar entre 0 y menos de 100 %.`);
    return new Dec(0);
  }
  return d;
}

function closeEnough(a: Dec, b: Dec): boolean {
  const tolerance = Dec.max(new Dec("0.02"), b.abs().times("0.005"));
  return a.minus(b).abs().lte(tolerance);
}

/**
 * Calcula el costo por unidad vendible de una línea, en la moneda y base tributaria del catálogo.
 * Si falta información o es inválida, devuelve los motivos del bloqueo en vez de un número.
 */
export function computeLineCost(
  line: InvoiceLine,
  invoice: Pick<Invoice, "currency" | "taxBasis" | "taxRatePercent" | "globalDiscountPercent">,
  item: CatalogItem | undefined,
  settings: Settings,
): LineCostResult {
  const reasons: string[] = [];

  if (!line.confirmed) reasons.push("La línea todavía no fue confirmada en la revisión.");
  if (!item) reasons.push("La línea no tiene un producto del catálogo asignado.");

  // Moneda
  if (!invoice.currency) reasons.push("Falta confirmar la moneda de la factura.");
  else if (item && item.currency !== invoice.currency) {
    reasons.push(
      `Moneda distinta: la factura está en ${invoice.currency} y el producto en ${item.currency}. ` +
        "Esta versión no convierte monedas, así que el cálculo queda bloqueado.",
    );
  }

  // Base tributaria
  let taxFactor = new Dec(1);
  if (!settings.catalogTaxBasis) {
    reasons.push("Falta indicar si los costos y precios del catálogo incluyen impuestos (paso Catálogo).");
  }
  if (!invoice.taxBasis) {
    reasons.push("Falta indicar si los importes de la factura incluyen impuestos.");
  }
  if (settings.catalogTaxBasis && invoice.taxBasis && settings.catalogTaxBasis !== invoice.taxBasis) {
    const rate = toDec(invoice.taxRatePercent);
    if (!rate || rate.lt(0) || rate.gt(100)) {
      reasons.push(
        "La factura y el catálogo usan bases tributarias distintas (con/sin impuestos). " +
          "Indicá la tasa de impuesto de la factura para convertir los importes.",
      );
    } else {
      const onePlus = new Dec(1).plus(rate.div(100));
      // factura con impuestos → catálogo sin: dividir; al revés: multiplicar
      taxFactor = invoice.taxBasis === "con_impuestos" ? new Dec(1).div(onePlus) : onePlus;
    }
  }

  // Cantidades
  const qty = toDec(line.quantity);
  if (line.quantity === null || line.quantity.trim() === "") reasons.push("Falta la cantidad.");
  else if (!qty) reasons.push("La cantidad no es un número válido.");
  else if (qty.lte(0)) reasons.push("La cantidad debe ser mayor a cero.");

  const upp = toDec(line.unitsPerPack);
  if (line.unitsPerPack === null || line.unitsPerPack.trim() === "") {
    reasons.push("Falta confirmar cuántas unidades trae cada presentación (caja, pack, etc.).");
  } else if (!upp || upp.lte(0)) {
    reasons.push("Las unidades por presentación deben ser un número mayor a cero.");
  }

  // Importe
  const lineDiscount = pct(line.discountPercent, "Descuento de la línea", reasons);
  const globalDiscount = pct(invoice.globalDiscountPercent, "Descuento general de la factura", reasons);
  const lineAmount = toDec(line.lineAmount);
  const unitPrice = toDec(line.unitPrice);
  if (line.lineAmount && !lineAmount) reasons.push("El importe de la línea no es un número válido.");
  if (line.unitPrice && !unitPrice) reasons.push("El precio unitario no es un número válido.");

  let amount: Dec | null = null;
  const notes: string[] = [];
  const fromUnitPrice =
    unitPrice && qty ? qty.times(unitPrice).times(new Dec(1).minus(lineDiscount.div(100))) : null;

  if (line.amountSource === "importe") {
    if (!lineAmount) reasons.push("Elegiste usar el importe de la línea, pero está vacío.");
    amount = lineAmount;
  } else if (line.amountSource === "precio_unitario") {
    if (!unitPrice) reasons.push("Elegiste usar el precio unitario, pero está vacío.");
    amount = fromUnitPrice;
  } else if (lineAmount && fromUnitPrice) {
    if (closeEnough(lineAmount, fromUnitPrice)) {
      amount = lineAmount;
    } else if (lineDiscount.gt(0) && qty && unitPrice && closeEnough(lineAmount, qty.times(unitPrice))) {
      reasons.push(
        "El importe de la línea parece no incluir el descuento. Elegí si usar el importe o el precio unitario con descuento.",
      );
    } else {
      reasons.push(
        "El importe de la línea no coincide con cantidad × precio unitario. Revisá los datos o elegí cuál usar.",
      );
    }
  } else if (lineAmount) {
    amount = lineAmount;
  } else if (fromUnitPrice) {
    amount = fromUnitPrice;
  } else if (!line.lineAmount && !line.unitPrice) {
    reasons.push("Falta el importe de la línea o el precio unitario.");
  }

  if (amount) {
    if (amount.isNegative()) {
      reasons.push("El importe es negativo (posible nota de crédito o bonificación). No se usa para calcular costos.");
    } else if (amount.isZero()) {
      reasons.push("El importe es cero (¿mercadería bonificada?). Revisalo o ignorá la línea.");
    }
  }

  if (reasons.length > 0 || !amount || !qty || !upp) return { ok: false, reasons };

  if (globalDiscount.gt(0)) {
    amount = amount.times(new Dec(1).minus(globalDiscount.div(100)));
    notes.push(`Se aplicó el descuento general de ${globalDiscount.toString()} %.`);
  }
  if (!taxFactor.eq(1)) {
    amount = amount.times(taxFactor);
    notes.push(`Importe convertido a base ${settings.catalogTaxBasis === "sin_impuestos" ? "sin" : "con"} impuestos con tasa ${invoice.taxRatePercent} %.`);
  }
  const units = qty.times(upp);
  if (!upp.eq(1)) notes.push(`${qty.toString()} × ${upp.toString()} unidades = ${units.toString()} unidades.`);
  return { ok: true, units, totalCost: amount, unitCost: amount.div(units), notes };
}

export type ProposalRow = {
  item: CatalogItem;
  lineIds: string[];
  status: "ok" | "bloqueado";
  reasons: string[];
  notes: string[];
  oldCost: Dec | null;
  newCost: Dec | null;
  costChange: Dec | null;
  costChangeFraction: Dec | null;
  price: Dec | null;
  oldMargin: Dec | null;
  newMargin: Dec | null;
  targetPercent: string;
  targetError: string | null;
  suggested: Dec | null;
  marginAtSuggested: Dec | null;
  approved: boolean;
  /** Precio final propuesto (el sugerido, o el que escribió el comerciante). */
  finalPrice: Dec | null;
  finalPriceError: string | null;
  finalMargin: Dec | null;
};

/**
 * Agrupa las líneas confirmadas por producto y arma una propuesta por producto.
 * Si un producto aparece en varias líneas, el costo nuevo es el promedio ponderado por unidades.
 * Si alguna de sus líneas está bloqueada, todo el producto queda bloqueado.
 */
export function computeProposals(invoice: Invoice, catalog: CatalogItem[], settings: Settings): ProposalRow[] {
  const byId = new Map(catalog.map((i) => [i.id, i]));
  const groups = new Map<string, InvoiceLine[]>();
  for (const line of invoice.lines) {
    if (line.ignored || !line.confirmed || !line.match.catalogItemId) continue;
    if (!byId.has(line.match.catalogItemId)) continue;
    const list = groups.get(line.match.catalogItemId) ?? [];
    list.push(line);
    groups.set(line.match.catalogItemId, list);
  }

  const rows: ProposalRow[] = [];
  for (const [itemId, lines] of groups) {
    const item = byId.get(itemId)!;
    const override = invoice.proposals[itemId];
    const reasons: string[] = [];
    const notes: string[] = [];
    let units = new Dec(0);
    let total = new Dec(0);
    for (const line of lines) {
      const r = computeLineCost(line, invoice, item, settings);
      if (r.ok) {
        units = units.plus(r.units);
        total = total.plus(r.totalCost);
        notes.push(...r.notes);
      } else {
        reasons.push(...r.reasons.map((m) => (lines.length > 1 ? `Línea "${line.description}": ${m}` : m)));
      }
    }
    if (lines.length > 1) notes.push(`Aparece en ${lines.length} líneas: se usa el costo promedio ponderado.`);

    const oldCost = toDec(item.unitCost);
    const price = toDec(item.price);
    const targetPercent = override?.targetMarginPercent ?? settings.targetMarginPercent;
    const target = parseTargetMargin(targetPercent);
    const newCost = reasons.length === 0 && units.gt(0) ? total.div(units) : null;

    if (!price || price.lte(0)) notes.push("El producto no tiene un precio de venta válido: no se puede calcular el margen actual.");
    if (!oldCost) notes.push("El producto no tiene costo anterior en el catálogo: no se puede calcular la variación.");

    const suggested = newCost && target.ok ? suggestedPrice(newCost, target.fraction) : null;
    let finalPrice: Dec | null = suggested;
    let finalPriceError: string | null = null;
    if (override?.finalPrice !== null && override?.finalPrice !== undefined && override.finalPrice.trim() !== "") {
      const fp = toDec(override.finalPrice);
      if (!fp || fp.lte(0)) {
        finalPriceError = "El precio propuesto debe ser un número mayor a cero.";
        finalPrice = null;
      } else {
        finalPrice = fp;
      }
    }

    const blocked = reasons.length > 0 || !newCost;
    rows.push({
      item,
      lineIds: lines.map((l) => l.id),
      status: blocked ? "bloqueado" : "ok",
      reasons,
      notes,
      oldCost,
      newCost,
      costChange: newCost && oldCost ? newCost.minus(oldCost) : null,
      costChangeFraction: newCost && oldCost && oldCost.gt(0) ? newCost.minus(oldCost).div(oldCost) : null,
      price,
      oldMargin: price && oldCost ? grossMargin(price, oldCost) : null,
      newMargin: price && newCost ? grossMargin(price, newCost) : null,
      targetPercent,
      targetError: target.ok ? null : target.error,
      suggested,
      marginAtSuggested: suggested && newCost ? grossMargin(suggested, newCost) : null,
      approved: !blocked && !finalPriceError && !!override?.approved,
      finalPrice: blocked ? null : finalPrice,
      finalPriceError,
      finalMargin: !blocked && finalPrice && newCost ? grossMargin(finalPrice, newCost) : null,
    });
  }
  return rows.sort((a, b) => a.item.name.localeCompare(b.item.name, "es"));
}

/** Motivos por los que una línea no puede confirmarse todavía (para la pantalla de revisión). */
export function lineIssues(
  line: InvoiceLine,
  invoice: Invoice,
  catalog: CatalogItem[],
  settings: Settings,
): string[] {
  if (line.ignored) return [];
  const item = catalog.find((i) => i.id === line.match.catalogItemId);
  const r = computeLineCost({ ...line, confirmed: true }, invoice, item, settings);
  return r.ok ? [] : r.reasons;
}
