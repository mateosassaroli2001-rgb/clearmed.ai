import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCatalogCsv } from "../src/core/catalog-csv";
import { proposeMatch } from "../src/core/matching";

const catalog = parseCatalogCsv(readFileSync("samples/catalogo-ejemplo.csv", "utf8")).items;
const id = (sku: string) => catalog.find((i) => i.sku === sku)!.id;

describe("coincidencias con el catálogo", () => {
  it("prioriza el SKU exacto", () => {
    const m = proposeMatch({ code: "yerba 500", description: "algo distinto" }, catalog);
    expect(m.status).toBe("sku_exacto");
    expect(m.catalogItemId).toBe(id("YERBA-500"));
  });

  it("sugiere por nombre cuando el código es del proveedor", () => {
    const m = proposeMatch({ code: "PRV-8812", description: "Café molido intenso 250 g" }, catalog);
    expect(m.status).toBe("probable");
    expect(m.catalogItemId).toBe(id("CAFE-250"));
    expect(m.note).toMatch(/no coincide con ningún SKU/);
  });

  it("no preselecciona una coincidencia ambigua (variantes parecidas)", () => {
    const m = proposeMatch({ code: "", description: "Taza cerámica 300 ml" }, catalog);
    expect(m.status).toBe("ambigua");
    expect(m.catalogItemId).toBeNull();
    expect(m.candidates.map((c) => c.catalogItemId)).toEqual(expect.arrayContaining([id("TAZA-300-BL"), id("TAZA-300-NG")]));
  });

  it("SKU duplicado en el catálogo → ambigua", () => {
    const dup = [...catalog, { ...catalog[0]!, id: "otro" }];
    const m = proposeMatch({ code: "YERBA-500", description: "" }, dup);
    expect(m.status).toBe("ambigua");
    expect(m.catalogItemId).toBeNull();
  });

  it("sin coincidencia para artículos que no están en el catálogo", () => {
    const m = proposeMatch({ code: "FLETE", description: "Flete y envío" }, catalog);
    expect(m.status).toBe("sin_coincidencia");
  });

  it("detecta el SKU mencionado dentro de la descripción", () => {
    const m = proposeMatch({ code: "", description: "Art. TERMO-1L termo" }, catalog);
    expect(m.status).toBe("sku_en_texto");
    expect(m.catalogItemId).toBe(id("TERMO-1L"));
  });
});

describe("importación de catálogo CSV", () => {
  it("lee el catálogo de ejemplo", () => {
    const r = parseCatalogCsv(readFileSync("samples/catalogo-ejemplo.csv", "utf8"));
    expect(r.errors).toEqual([]);
    expect(r.items).toHaveLength(9);
  });

  it("acepta punto y coma y coma decimal", () => {
    const r = parseCatalogCsv("sku;nombre;variante;costo_unitario;precio_venta;moneda\nA1;Mate;;3.800,50;7.500,00;ars\n");
    expect(r.items[0]!.unitCost).toBe("3800.5");
    expect(r.items[0]!.currency).toBe("ARS");
  });

  it("informa filas inválidas sin importar datos dudosos", () => {
    const r = parseCatalogCsv("sku,nombre,variante,costo_unitario,precio_venta,moneda\nA,Mate,,abc,10,ARS\nB,,,1,2,ARS\nC,Bombilla,,1,2,PESOS\nD,Termo,,1.500,2,ARS\nE,Ok,,1,2,USD\n");
    expect(r.items).toHaveLength(1);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4, 5]);
  });

  it("avisa si faltan columnas", () => {
    const r = parseCatalogCsv("sku,nombre\nA,Mate\n");
    expect(r.items).toHaveLength(0);
    expect(r.missingColumns).toEqual(["costo_unitario", "precio_venta", "moneda"]);
  });
});
