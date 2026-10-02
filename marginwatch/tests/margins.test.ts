import { describe, expect, it } from "vitest";
import { computeLineCost, computeProposals, grossMargin, markupOnCost, parseTargetMargin, suggestedPrice } from "../src/core/margins";
import { Dec } from "../src/core/numbers";
import { invoice, item, line, settings } from "./helpers";

describe("fórmulas de margen", () => {
  it("margen bruto = (precio − costo) / precio", () => {
    expect(grossMargin(new Dec(200), new Dec(150))!.toString()).toBe("0.25");
  });

  it("no confunde margen con recargo sobre costo", () => {
    // costo 100, precio 150: recargo 50 %, margen 33,33 %
    expect(markupOnCost(new Dec(150), new Dec(100))!.toString()).toBe("0.5");
    expect(grossMargin(new Dec(150), new Dec(100))!.toFixed(4)).toBe("0.3333");
  });

  it("precio sugerido = costo / (1 − margen objetivo)", () => {
    expect(suggestedPrice(new Dec(65), new Dec("0.35"))!.toString()).toBe("100");
    // 2800 / 0,65 = 4307,6923… → se redondea hacia arriba al centavo
    expect(suggestedPrice(new Dec(2800), new Dec("0.35"))!.toFixed(2)).toBe("4307.70");
  });

  it("el precio sugerido alcanza al menos el margen objetivo", () => {
    const cost = new Dec("1234.567");
    const price = suggestedPrice(cost, new Dec("0.4"))!;
    expect(grossMargin(price, cost)!.gte("0.4")).toBe(true);
  });

  it("usa precisión decimal (0,1 + 0,2 = 0,3 exacto)", () => {
    const r = computeLineCost(line({ quantity: "3", lineAmount: "0.3", unitsPerPack: "1" }), invoice([]), item(), settings);
    expect(r.ok && r.unitCost.toString()).toBe("0.1");
  });

  it("margen con precio cero no se calcula (sin dividir por cero)", () => {
    expect(grossMargin(new Dec(0), new Dec(10))).toBeNull();
  });

  it("valida el margen objetivo", () => {
    expect(parseTargetMargin("35").ok).toBe(true);
    expect(parseTargetMargin("100").ok).toBe(false);
    expect(parseTargetMargin("-5").ok).toBe(false);
    expect(parseTargetMargin("abc").ok).toBe(false);
    expect(parseTargetMargin("").ok).toBe(false);
  });
});

describe("cajas y unidades", () => {
  it("divide el costo de la caja por las unidades que trae", () => {
    // 2 cajas x 10 u a 28.000 la caja = 56.000 / 20 u = 2.800 por unidad
    const l = line({ quantity: "2", unitsPerPack: "10", unitPrice: "28000", lineAmount: "56000" });
    const r = computeLineCost(l, invoice([l]), item(), settings);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.units.toString()).toBe("20");
      expect(r.unitCost.toString()).toBe("2800");
    }
  });

  it("bloquea si no se sabe cuántas unidades trae la caja", () => {
    const l = line({ unitsPerPack: null });
    const r = computeLineCost(l, invoice([l]), item(), settings);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/unidades trae cada presentación/);
  });

  it("rechaza unidades por presentación en cero", () => {
    const l = line({ unitsPerPack: "0" });
    expect(computeLineCost(l, invoice([l]), item(), settings).ok).toBe(false);
  });
});

describe("cantidades, importes y descuentos", () => {
  it("bloquea cantidad cero o negativa", () => {
    for (const q of ["0", "-2"]) {
      const l = line({ quantity: q });
      const r = computeLineCost(l, invoice([l]), item(), settings);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reasons.join(" ")).toMatch(/mayor a cero/);
    }
  });

  it("bloquea cantidad vacía o inválida", () => {
    expect(computeLineCost(line({ quantity: null }), invoice([]), item(), settings).ok).toBe(false);
    expect(computeLineCost(line({ quantity: "doce" }), invoice([]), item(), settings).ok).toBe(false);
  });

  it("aplica el descuento de línea al calcular desde el precio unitario", () => {
    const l = line({ quantity: "4", unitPrice: "21000", discountPercent: "10", lineAmount: null });
    const r = computeLineCost(l, invoice([l]), item(), settings);
    expect(r.ok && r.unitCost.toString()).toBe("18900");
  });

  it("acepta un importe de línea que ya incluye el descuento", () => {
    const l = line({ quantity: "4", unitPrice: "21000", discountPercent: "10", lineAmount: "75600" });
    const r = computeLineCost(l, invoice([l]), item(), settings);
    expect(r.ok && r.unitCost.toString()).toBe("18900");
  });

  it("pide elegir si el importe parece no incluir el descuento", () => {
    const l = line({ quantity: "4", unitPrice: "21000", discountPercent: "10", lineAmount: "84000" });
    const r = computeLineCost(l, invoice([l]), item(), settings);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/no incluir el descuento/);
    // El comerciante elige usar el precio unitario con descuento
    const r2 = computeLineCost({ ...l, amountSource: "precio_unitario" }, invoice([l]), item(), settings);
    expect(r2.ok && r2.unitCost.toString()).toBe("18900");
  });

  it("bloquea si importe y precio unitario no coinciden", () => {
    const l = line({ quantity: "2", unitPrice: "100", lineAmount: "500" });
    expect(computeLineCost(l, invoice([l]), item(), settings).ok).toBe(false);
  });

  it("aplica el descuento general de la factura", () => {
    const l = line({ quantity: "10", lineAmount: "1000" });
    const r = computeLineCost(l, invoice([l], { globalDiscountPercent: "5" }), item(), settings);
    expect(r.ok && r.unitCost.toString()).toBe("95");
  });

  it("rechaza descuentos fuera de rango", () => {
    const l = line({ discountPercent: "120" });
    expect(computeLineCost(l, invoice([l]), item(), settings).ok).toBe(false);
  });

  it("no usa importes negativos ni cero", () => {
    expect(computeLineCost(line({ lineAmount: "-50" }), invoice([]), item(), settings).ok).toBe(false);
    expect(computeLineCost(line({ lineAmount: "0" }), invoice([]), item(), settings).ok).toBe(false);
  });
});

describe("bloqueos por moneda y base tributaria", () => {
  it("bloquea si la moneda de la factura difiere de la del producto", () => {
    const l = line();
    const r = computeLineCost(l, invoice([l], { currency: "ARS" }), item({ currency: "USD" }), settings);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/Moneda distinta/);
  });

  it("bloquea si falta la moneda de la factura", () => {
    const l = line();
    expect(computeLineCost(l, invoice([l], { currency: null }), item(), settings).ok).toBe(false);
  });

  it("bloquea si no se confirmó la base tributaria del catálogo o de la factura", () => {
    const l = line();
    expect(computeLineCost(l, invoice([l]), item(), { ...settings, catalogTaxBasis: null }).ok).toBe(false);
    expect(computeLineCost(l, invoice([l], { taxBasis: null }), item(), settings).ok).toBe(false);
  });

  it("bloquea bases distintas sin tasa, y convierte con tasa", () => {
    const l = line({ quantity: "1", lineAmount: "121" });
    const inv = invoice([l], { taxBasis: "con_impuestos" });
    expect(computeLineCost(l, inv, item(), settings).ok).toBe(false);
    const r = computeLineCost(l, { ...inv, taxRatePercent: "21" }, item(), settings);
    expect(r.ok && r.unitCost.toString()).toBe("100");
  });

  it("bloquea líneas sin confirmar o sin producto", () => {
    expect(computeLineCost(line({ confirmed: false }), invoice([]), item(), settings).ok).toBe(false);
    expect(computeLineCost(line(), invoice([]), undefined, settings).ok).toBe(false);
  });
});

describe("propuestas por producto", () => {
  it("calcula variación, márgenes y precio sugerido", () => {
    const l = line({ quantity: "2", unitsPerPack: "10", lineAmount: "56000" });
    const p = item({ unitCost: "2500", price: "4200" });
    const [row] = computeProposals(invoice([l]), [p], settings);
    expect(row!.status).toBe("ok");
    expect(row!.newCost!.toString()).toBe("2800");
    expect(row!.costChangeFraction!.toString()).toBe("0.12");
    expect(row!.oldMargin!.toFixed(4)).toBe("0.4048");
    expect(row!.newMargin!.toFixed(4)).toBe("0.3333");
    expect(row!.suggested!.toFixed(2)).toBe("4307.70");
  });

  it("promedia por unidades si el producto aparece en varias líneas", () => {
    const a = line({ id: "a", quantity: "10", lineAmount: "1000" }); // 100 c/u
    const b = line({ id: "b", quantity: "30", lineAmount: "3600" }); // 120 c/u
    const [row] = computeProposals(invoice([a, b]), [item()], settings);
    expect(row!.newCost!.toString()).toBe("115");
  });

  it("bloquea el producto entero si una de sus líneas está bloqueada", () => {
    const a = line({ id: "a" });
    const b = line({ id: "b", quantity: "0" });
    const [row] = computeProposals(invoice([a, b]), [item()], settings);
    expect(row!.status).toBe("bloqueado");
    expect(row!.suggested).toBeNull();
  });

  it("sólo aprueba propuestas válidas y respeta el precio elegido", () => {
    const l = line({ lineAmount: "130" });
    const inv = invoice([l], { proposals: { p1: { approved: true, finalPrice: "210", targetMarginPercent: null } } });
    const [row] = computeProposals(inv, [item()], settings);
    expect(row!.approved).toBe(true);
    expect(row!.finalPrice!.toString()).toBe("210");
    expect(row!.finalMargin!.toFixed(4)).toBe("0.3810");

    const bad = invoice([l], { proposals: { p1: { approved: true, finalPrice: "-1", targetMarginPercent: null } } });
    expect(computeProposals(bad, [item()], settings)[0]!.approved).toBe(false);
  });

  it("permite un margen objetivo distinto por producto", () => {
    const l = line({ lineAmount: "60" });
    const inv = invoice([l], { proposals: { p1: { approved: false, finalPrice: null, targetMarginPercent: "40" } } });
    expect(computeProposals(inv, [item()], settings)[0]!.suggested!.toString()).toBe("100");
  });

  it("ignora líneas marcadas como ignoradas", () => {
    expect(computeProposals(invoice([line({ ignored: true })]), [item()], settings)).toHaveLength(0);
  });
});
