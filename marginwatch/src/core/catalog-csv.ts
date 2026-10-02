// Lectura del catálogo desde CSV.
// Columnas esperadas (se aceptan sinónimos en español e inglés):
//   sku, nombre, variante, costo_unitario, precio_venta, moneda
import Papa from "papaparse";
import { parseDecimalInput } from "./numbers";
import { newId, type CatalogItem } from "./types";

type Field = "sku" | "name" | "variant" | "unitCost" | "price" | "currency";

const ALIASES: Record<Field, string[]> = {
  sku: ["sku", "codigo", "código", "cod", "variant sku"],
  name: ["nombre", "producto", "name", "title", "titulo", "título"],
  variant: ["variante", "variant", "opcion", "opción", "option1 value"],
  unitCost: ["costo_unitario", "costo unitario", "costo", "cost", "unit_cost", "cost per item", "costo por artículo"],
  price: ["precio_venta", "precio de venta", "precio", "price", "variant price"],
  currency: ["moneda", "currency", "divisa"],
};

const headerKey = (h: string) =>
  h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s]+/g, " ");

export type CatalogParseResult = {
  items: CatalogItem[];
  errors: { row: number; message: string }[];
  warnings: string[];
  missingColumns: string[];
};

export const REQUIRED_COLUMNS_LABEL = "sku, nombre, variante, costo_unitario, precio_venta, moneda";

export function parseCatalogCsv(text: string): CatalogParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });
  const rows = parsed.data;
  const result: CatalogParseResult = { items: [], errors: [], warnings: [], missingColumns: [] };
  if (rows.length === 0) {
    result.errors.push({ row: 0, message: "El archivo está vacío." });
    return result;
  }

  const header = rows[0]!.map(headerKey);
  const col: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    const idx = header.findIndex((h) => ALIASES[field].map(headerKey).includes(h));
    if (idx >= 0) col[field] = idx;
  }
  const required: Field[] = ["name", "unitCost", "price", "currency"];
  const labels: Record<Field, string> = {
    sku: "sku", name: "nombre", variant: "variante", unitCost: "costo_unitario", price: "precio_venta", currency: "moneda",
  };
  result.missingColumns = required.filter((f) => col[f] === undefined).map((f) => labels[f]);
  if (result.missingColumns.length > 0) {
    result.errors.push({
      row: 1,
      message: `Faltan columnas: ${result.missingColumns.join(", ")}. Columnas esperadas: ${REQUIRED_COLUMNS_LABEL}.`,
    });
    return result;
  }
  if (col.sku === undefined) result.warnings.push("No hay columna SKU: las coincidencias se harán sólo por nombre.");

  const seenSku = new Map<string, number>();
  const get = (r: string[], f: Field) => (col[f] === undefined ? "" : (r[col[f]!] ?? "").trim());

  rows.slice(1).forEach((r, i) => {
    const rowNum = i + 2; // fila 1 = encabezado
    const problems: string[] = [];
    const name = get(r, "name");
    if (!name) problems.push("falta el nombre");

    const currency = get(r, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) problems.push(`moneda "${get(r, "currency")}" inválida (usá un código de 3 letras como ARS o USD)`);

    const costRaw = get(r, "unitCost");
    let unitCost: string | null = null;
    if (costRaw) {
      const c = parseDecimalInput(costRaw);
      if (!c.ok) problems.push(`costo: ${c.error}`);
      else if (c.value.startsWith("-")) problems.push("el costo no puede ser negativo");
      else unitCost = c.value;
    }

    const priceRaw = get(r, "price");
    let price: string | null = null;
    if (priceRaw) {
      const p = parseDecimalInput(priceRaw);
      if (!p.ok) problems.push(`precio: ${p.error}`);
      else if (p.value.startsWith("-")) problems.push("el precio no puede ser negativo");
      else price = p.value;
    }

    if (problems.length > 0) {
      result.errors.push({ row: rowNum, message: problems.join("; ") });
      return;
    }
    const sku = get(r, "sku");
    if (sku) {
      const key = sku.toUpperCase();
      if (seenSku.has(key)) {
        result.warnings.push(`El SKU ${sku} aparece repetido (filas ${seenSku.get(key)} y ${rowNum}). Las coincidencias por ese SKU se marcarán como ambiguas.`);
      } else seenSku.set(key, rowNum);
    }
    if (!unitCost) result.warnings.push(`Fila ${rowNum} (${name}): sin costo actual, no se podrá calcular la variación.`);
    if (!price || price === "0") result.warnings.push(`Fila ${rowNum} (${name}): sin precio de venta válido, no se podrá calcular el margen.`);

    result.items.push({
      id: newId("prd"),
      sku,
      name: name.slice(0, 300),
      variant: get(r, "variant").slice(0, 200),
      unitCost,
      price,
      currency,
    });
  });

  if (result.items.length === 0 && result.errors.length === 0) {
    result.errors.push({ row: 0, message: "El archivo no tiene filas de productos." });
  }
  return result;
}
