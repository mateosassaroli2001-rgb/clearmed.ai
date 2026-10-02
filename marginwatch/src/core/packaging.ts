// Detección de cajas, paquetes y unidades a partir del texto de la factura.
// Regla de oro: si el texto habla de una caja/pack y no dice cuántas unidades trae,
// NO asumimos que es una unidad: pedimos confirmación.

export type PackagingDetection = {
  kind: "unidad" | "pack" | "desconocido";
  /** Unidades por presentación (texto decimal) o null si hay que confirmarlo. */
  unitsPerPack: string | null;
  /** Fragmento de texto que justificó la detección. */
  evidence: string | null;
  needsConfirmation: boolean;
  message: string;
};

const PACK_WORDS =
  "caja|cajas|cja|cj|pack|packs|paquete|paquetes|paq|pqt|bulto|bultos|display|fardo|blister|bandeja|estuche|sixpack|six-pack";
const UNIT_WORDS = "u|un|und|unid|unids|unidad|unidades|uds|ud|pzas|piezas|pz";
// Medidas de contenido: "x 500 ml" describe el tamaño, no la cantidad de unidades.
const SIZE_UNITS = "ml|cc|l|lt|lts|litro|litros|g|gr|grs|kg|kgs|cm|mm|m|mts|oz|w|mah|v|gb|tb";

export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

type Found = { units: number; evidence: string };

function findCounts(text: string): { counts: Found[]; hasPackWord: boolean; hasUnitWord: boolean } {
  const t = normalizeText(text);
  const counts: Found[] = [];
  const push = (n: string | undefined, evidence: string) => {
    const units = Number(n);
    if (Number.isInteger(units) && units > 0 && units <= 100000) counts.push({ units, evidence: evidence.trim() });
  };

  // "caja x 12", "pack de 6", "bulto 24 u", "caja c/12"
  for (const m of t.matchAll(new RegExp(`\\b(?:${PACK_WORDS})\\b\\s*(?:de|x|por|c\\/|con)?\\s*(\\d+)(?!\\d)(?![.,]\\d)(?!\\s*(?:${SIZE_UNITS})\\b)(?:\\s*(?:${UNIT_WORDS})\\b)?`, "g"))) {
    push(m[1], m[0]);
  }
  // "6 pack", "6-pack", "12 unidades por caja"
  for (const m of t.matchAll(new RegExp(`\\b(\\d+)\\s*-?\\s*(?:${PACK_WORDS})\\b`, "g"))) push(m[1], m[0]);
  for (const m of t.matchAll(new RegExp(`\\b(\\d+)\\s*(?:${UNIT_WORDS})\\b\\.?\\s*(?:por|x|p\\/)\\s*(?:${PACK_WORDS})\\b`, "g"))) {
    push(m[1], m[0]);
  }
  // "x 12 u", "x12un", "x 24 unidades"
  for (const m of t.matchAll(new RegExp(`\\bx\\s*(\\d+)\\s*(?:${UNIT_WORDS})\\b`, "g"))) push(m[1], m[0]);
  // "x12" sin unidad, pero no "x 500 ml"
  for (const m of t.matchAll(new RegExp(`\\bx\\s*(\\d+)\\b(?!\\s*(?:${SIZE_UNITS}|${UNIT_WORDS})\\b)(?![.,]\\d)`, "g"))) {
    push(m[1], m[0]);
  }
  // "docena", "media docena"
  for (const m of t.matchAll(/\b(media\s+)?docenas?\b/g)) push(m[1] ? "6" : "12", m[0]);

  const hasPackWord = new RegExp(`\\b(?:${PACK_WORDS}|docenas?)\\b`).test(t);
  const hasUnitWord = new RegExp(`\\b(?:unidad|unitario|c\\/u|por unidad|suelto)\\b`).test(t);
  return { counts, hasPackWord, hasUnitWord };
}

/**
 * Analiza presentación y descripción de una línea.
 * La presentación tiene prioridad; si presentación y descripción indican cantidades distintas, se pide confirmar.
 */
export function detectPackaging(presentation: string | null | undefined, description: string | null | undefined): PackagingDetection {
  const p = findCounts(presentation ?? "");
  const d = findCounts(description ?? "");
  const all = [...p.counts, ...d.counts];
  const distinct = [...new Set(all.map((c) => c.units))];
  const hasPackWord = p.hasPackWord || d.hasPackWord;

  if (distinct.length > 1) {
    return {
      kind: "desconocido",
      unitsPerPack: null,
      evidence: all.map((c) => c.evidence).join(" / "),
      needsConfirmation: true,
      message: `El texto indica cantidades distintas (${distinct.join(" y ")}). Confirmá cuántas unidades trae cada presentación.`,
    };
  }
  if (distinct.length === 1) {
    const units = distinct[0]!;
    const evidence = all[0]!.evidence;
    if (units === 1) {
      return { kind: "unidad", unitsPerPack: "1", evidence, needsConfirmation: false, message: "Se compra por unidad." };
    }
    return {
      kind: "pack",
      unitsPerPack: String(units),
      evidence,
      needsConfirmation: false,
      message: `Se detectó una presentación de ${units} unidades ("${evidence}"). El costo se divide por ${units}.`,
    };
  }
  if (hasPackWord) {
    return {
      kind: "desconocido",
      unitsPerPack: null,
      evidence: null,
      needsConfirmation: true,
      message: "El texto menciona una caja o paquete pero no cuántas unidades trae. Indicá la cantidad de unidades.",
    };
  }
  return {
    kind: "unidad",
    unitsPerPack: "1",
    evidence: null,
    needsConfirmation: false,
    message: p.hasUnitWord || d.hasUnitWord
      ? "Se compra por unidad."
      : "No se mencionan cajas ni paquetes: se toma como unidad. Verificalo antes de confirmar.",
  };
}
