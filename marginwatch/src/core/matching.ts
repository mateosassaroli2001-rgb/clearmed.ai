// Propuesta de coincidencias entre líneas de factura y productos del catálogo.
// Prioridad: SKU exacto → SKU mencionado en el texto → similitud de nombre.
// Una coincidencia ambigua nunca se preselecciona: el comerciante debe elegir.
import { normalizeText } from "./packaging";
import type { CatalogItem, InvoiceLine, MatchCandidate, MatchStatus } from "./types";

export type MatchProposal = {
  catalogItemId: string | null;
  status: MatchStatus;
  candidates: MatchCandidate[];
  note: string | null;
};

export function normalizeSku(s: string | null | undefined): string {
  return normalizeText(s ?? "").replace(/[^a-z0-9]/g, "").toUpperCase();
}

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "con", "para", "en", "por", "x", "a", "al", "sin",
  "caja", "cajas", "cja", "cj", "pack", "paquete", "paq", "bulto", "display", "unidad", "unidades",
  "u", "un", "und", "unid", "uds", "ud", "c", "art", "cod", "codigo",
]);

export function tokenize(s: string): string[] {
  const t = normalizeText(s)
    // "500 ml" → "500ml" para que la medida cuente como un solo dato
    .replace(/(\d+(?:[.,]\d+)?)\s*(ml|cc|l|lt|g|gr|kg|cm|mm|oz)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ");
  return t.split(" ").filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  // Abreviaturas comunes: "algod" ~ "algodon" (sólo palabras, no números)
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/** Similitud entre 0 y 1 (coeficiente de Dice sobre palabras). */
export function nameSimilarity(a: string, b: string): number {
  const ta = [...new Set(tokenize(a))];
  const tb = [...new Set(tokenize(b))];
  if (ta.length === 0 || tb.length === 0) return 0;
  const used = new Set<number>();
  let common = 0;
  for (const x of ta) {
    const idx = tb.findIndex((y, i) => !used.has(i) && tokenMatches(x, y));
    if (idx >= 0) {
      used.add(idx);
      common++;
    }
  }
  return (2 * common) / (ta.length + tb.length);
}

export function itemLabel(item: CatalogItem): string {
  return item.variant ? `${item.name} — ${item.variant}` : item.name;
}

const MIN_CANDIDATE_SCORE = 0.34;
const PROBABLE_SCORE = 0.6;
const PROBABLE_GAP = 0.15;

export function proposeMatch(
  line: Pick<InvoiceLine, "code" | "description">,
  catalog: CatalogItem[],
): MatchProposal {
  if (catalog.length === 0) {
    return { catalogItemId: null, status: "sin_coincidencia", candidates: [], note: "El catálogo está vacío." };
  }
  const code = normalizeSku(line.code);
  let note: string | null = null;

  // 1) Código de la factura = SKU del catálogo
  if (code) {
    const exact = catalog.filter((i) => normalizeSku(i.sku) === code);
    if (exact.length === 1) {
      return {
        catalogItemId: exact[0]!.id,
        status: "sku_exacto",
        candidates: [{ catalogItemId: exact[0]!.id, score: 1, reason: `SKU ${exact[0]!.sku} igual al código de la factura` }],
        note: null,
      };
    }
    if (exact.length > 1) {
      return {
        catalogItemId: null,
        status: "ambigua",
        candidates: exact.map((i) => ({ catalogItemId: i.id, score: 1, reason: "Varios productos comparten este SKU" })),
        note: `Hay ${exact.length} productos con el SKU ${line.code}. Elegí el correcto.`,
      };
    }
    note = `El código "${line.code}" no coincide con ningún SKU del catálogo (puede ser un código del proveedor).`;
  }

  // 2) SKU del catálogo mencionado dentro de la descripción
  const descTokens = new Set(
    normalizeText(line.description).split(/[^a-z0-9-]+/).map((w) => normalizeSku(w)).filter((w) => w.length >= 4),
  );
  const inText = catalog.filter((i) => {
    const sku = normalizeSku(i.sku);
    return sku.length >= 4 && descTokens.has(sku);
  });
  if (inText.length === 1) {
    return {
      catalogItemId: inText[0]!.id,
      status: "sku_en_texto",
      candidates: [{ catalogItemId: inText[0]!.id, score: 0.95, reason: `La descripción menciona el SKU ${inText[0]!.sku}` }],
      note,
    };
  }

  // 3) Similitud de nombre + variante
  const scored = catalog
    .map((item) => ({ item, score: nameSimilarity(line.description, `${item.name} ${item.variant}`) }))
    .filter((x) => x.score >= MIN_CANDIDATE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const candidates: MatchCandidate[] = scored.map((x) => ({
    catalogItemId: x.item.id,
    score: Math.round(x.score * 100) / 100,
    reason: `Nombre parecido (${Math.round(x.score * 100)} %)`,
  }));

  if (inText.length > 1) {
    return {
      catalogItemId: null,
      status: "ambigua",
      candidates: inText.map((i) => ({ catalogItemId: i.id, score: 0.95, reason: `Menciona el SKU ${i.sku}` })),
      note: "La descripción menciona más de un SKU. Elegí el correcto.",
    };
  }
  if (scored.length === 0) {
    return { catalogItemId: null, status: "sin_coincidencia", candidates: [], note: note ?? "No se encontró un producto parecido." };
  }
  const [top, second] = scored;
  if (top!.score >= PROBABLE_SCORE && (!second || top!.score - second.score >= PROBABLE_GAP)) {
    return {
      catalogItemId: top!.item.id,
      status: "probable",
      candidates,
      note: note ?? "Coincidencia sugerida por nombre: revisala antes de confirmar.",
    };
  }
  return {
    catalogItemId: null,
    status: "ambigua",
    candidates,
    note: "Hay varios productos parecidos o la similitud es baja. Elegí el correcto o dejá la línea sin asignar.",
  };
}
