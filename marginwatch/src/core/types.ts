// Modelo de datos compartido entre servidor y navegador.
// Los importes se guardan como texto decimal normalizado ("1234.56") para no perder precisión.
import { z } from "zod";

/** Si los importes incluyen impuestos (IVA u otros) o no. */
export const TaxBasisSchema = z.enum(["sin_impuestos", "con_impuestos"]);
export type TaxBasis = z.infer<typeof TaxBasisSchema>;

export const TAX_BASIS_LABEL: Record<TaxBasis, string> = {
  sin_impuestos: "sin impuestos (neto)",
  con_impuestos: "con impuestos incluidos",
};

const Amount = z.string().max(40).nullable();
const ShortText = z.string().max(500);

export const CatalogItemSchema = z.object({
  id: z.string().min(1).max(64),
  sku: z.string().max(120),
  name: z.string().min(1).max(300),
  variant: z.string().max(200),
  unitCost: Amount,
  price: Amount,
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CatalogSchema = z.object({
  items: z.array(CatalogItemSchema),
  source: z.enum(["archivo", "ejemplo"]),
  fileName: z.string().max(260).nullable(),
  importedAt: z.string(),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export const SettingsSchema = z.object({
  /** Base tributaria de costos y precios del catálogo. null = el comerciante todavía no lo confirmó. */
  catalogTaxBasis: TaxBasisSchema.nullable(),
  /** Margen bruto objetivo en porcentaje, por ejemplo "35". */
  targetMarginPercent: z.string().max(20),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const MatchStatusSchema = z.enum([
  "sku_exacto",
  "sku_en_texto",
  "probable",
  "ambigua",
  "sin_coincidencia",
  "manual",
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const MatchCandidateSchema = z.object({
  catalogItemId: z.string(),
  score: z.number(),
  reason: z.string().max(200),
});
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;

/** Texto tal como vino de la factura (no se edita: sirve para comparar con lo corregido). */
export const RawLineSchema = z.object({
  text: z.string().max(1000),
  description: ShortText,
  code: z.string().max(120).nullable(),
  quantity: z.string().max(60).nullable(),
  presentation: z.string().max(200).nullable(),
  unitPrice: z.string().max(60).nullable(),
  amount: z.string().max(60).nullable(),
  discount: z.string().max(60).nullable(),
});
export type RawLine = z.infer<typeof RawLineSchema>;

export const AmountSourceSchema = z.enum(["auto", "importe", "precio_unitario"]);
export type AmountSource = z.infer<typeof AmountSourceSchema>;

export const InvoiceLineSchema = z.object({
  id: z.string().min(1).max(64),
  raw: RawLineSchema,
  description: ShortText,
  code: z.string().max(120),
  /** Cantidad de presentaciones compradas (ej.: 3 cajas). */
  quantity: Amount,
  /** Presentación en la que se compra (ej.: "Caja x 12"). */
  presentation: z.string().max(200),
  /** Cuántas unidades vendibles trae cada presentación. null = sin confirmar. */
  unitsPerPack: Amount,
  unitsPerPackSource: z.enum(["detectado", "usuario", "unidad"]).nullable(),
  /** Precio de cada presentación tal como figura en la factura. */
  unitPrice: Amount,
  /** Importe total de la línea. */
  lineAmount: Amount,
  /** Descuento de la línea en porcentaje. */
  discountPercent: Amount,
  amountSource: AmountSourceSchema,
  match: z.object({
    catalogItemId: z.string().nullable(),
    status: MatchStatusSchema,
    candidates: z.array(MatchCandidateSchema).max(20),
    note: z.string().max(300).nullable(),
  }),
  confirmed: z.boolean(),
  ignored: z.boolean(),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const ProposalOverrideSchema = z.object({
  approved: z.boolean(),
  /** Precio que el comerciante decide proponer (si es null se usa el sugerido). */
  finalPrice: Amount,
  /** Margen objetivo propio de este producto (si es null se usa el general). */
  targetMarginPercent: Amount,
});
export type ProposalOverride = z.infer<typeof ProposalOverrideSchema>;

export const ExtractionStatusSchema = z.enum([
  "completada",
  "pendiente_sin_clave",
  "error",
  "manual",
  "ejemplo",
]);
export type ExtractionStatus = z.infer<typeof ExtractionStatusSchema>;

export const InvoiceSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(["archivo", "ejemplo", "manual"]),
  file: z
    .object({
      storedName: z.string(),
      originalName: z.string().max(260),
      mimeType: z.string(),
      size: z.number(),
      sha256: z.string(),
    })
    .nullable(),
  extraction: z.object({
    status: ExtractionStatusSchema,
    provider: z.string().nullable(),
    model: z.string().nullable(),
    message: z.string().max(1000).nullable(),
    warnings: z.array(z.string().max(500)).max(50),
  }),
  supplier: z.string().max(200),
  invoiceNumber: z.string().max(100),
  date: z.string().max(40),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  taxBasis: TaxBasisSchema.nullable(),
  /** Tasa de impuesto para convertir entre bases (ej.: "21" para IVA 21 %). */
  taxRatePercent: Amount,
  /** Descuento o bonificación general de la factura, en porcentaje. */
  globalDiscountPercent: Amount,
  lines: z.array(InvoiceLineSchema).max(500),
  proposals: z.record(z.string(), ProposalOverrideSchema),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/** Lo que el navegador puede modificar de una factura (el texto original y el archivo no). */
export const InvoiceUpdateSchema = InvoiceSchema.pick({
  supplier: true,
  invoiceNumber: true,
  date: true,
  currency: true,
  taxBasis: true,
  taxRatePercent: true,
  globalDiscountPercent: true,
  lines: true,
  proposals: true,
});
export type InvoiceUpdate = z.infer<typeof InvoiceUpdateSchema>;

export const AppDataSchema = z.object({
  version: z.literal(1),
  catalog: CatalogSchema.nullable(),
  settings: SettingsSchema,
  invoices: z.array(InvoiceSchema),
  currentInvoiceId: z.string().nullable(),
});
export type AppData = z.infer<typeof AppDataSchema>;

export const DEFAULT_SETTINGS: Settings = { catalogTaxBasis: null, targetMarginPercent: "35" };

export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rnd}`;
}
