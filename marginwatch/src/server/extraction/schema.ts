// Formato que debe devolver cualquier proveedor de extracción (IA o ejemplo).
// Los números vienen como texto normalizado ("1234.56") y se validan otra vez al armar las líneas.
import { z } from "zod";

export const ExtractedLineSchema = z.object({
  texto_original: z.string().describe("La línea tal como aparece en la factura, sin corregir."),
  descripcion: z.string(),
  codigo: z.string().nullable().describe("Código o SKU del artículo si aparece; null si no."),
  cantidad: z.string().nullable(),
  presentacion: z.string().nullable().describe('Ej.: "Caja x 12", "Pack x 6", "Unidad". null si no figura.'),
  precio_unitario: z.string().nullable().describe("Precio de cada presentación (no por unidad interna)."),
  importe: z.string().nullable().describe("Importe total de la línea."),
  descuento_pct: z.string().nullable(),
});

export const ExtractedInvoiceSchema = z.object({
  proveedor: z.string().nullable(),
  numero_factura: z.string().nullable(),
  fecha: z.string().nullable().describe("Formato AAAA-MM-DD si se puede determinar sin ambigüedad."),
  moneda: z.string().nullable().describe("Código ISO 4217 de 3 letras, o null si no se puede determinar."),
  importes_incluyen_impuestos: z.boolean().nullable(),
  tasa_impuesto_pct: z.string().nullable(),
  descuento_general_pct: z.string().nullable(),
  lineas: z.array(ExtractedLineSchema),
  observaciones: z.array(z.string()),
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
