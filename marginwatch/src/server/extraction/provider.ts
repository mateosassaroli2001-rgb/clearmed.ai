// Proveedor de extracción configurable por variables de entorno.
// EXTRACTION_PROVIDER=anthropic (con ANTHROPIC_API_KEY) o EXTRACTION_PROVIDER=none.
import type { ExtractedInvoice } from "./schema";

export type InvoiceFile = { buffer: Buffer; mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp" };

export interface ExtractionProvider {
  readonly name: string;
  readonly model: string | null;
  /** false = falta configuración (por ejemplo, la clave API). */
  readonly configured: boolean;
  /** Mensaje para mostrar cuando no está configurado. */
  readonly statusMessage: string;
  extract(file: InvoiceFile): Promise<ExtractedInvoice>;
}

export class ExtractionError extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
  }
}

export class NoProvider implements ExtractionProvider {
  readonly name = "ninguno";
  readonly model = null;
  readonly configured = false;
  constructor(readonly statusMessage: string) {}
  async extract(): Promise<ExtractedInvoice> {
    throw new ExtractionError("provider not configured", this.statusMessage);
  }
}
