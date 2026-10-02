// Extracción de facturas con la API de Claude (Anthropic), del lado servidor.
// La clave nunca llega al navegador y el contenido de la factura no se registra en los logs.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionError, type ExtractionProvider, type InvoiceFile } from "./provider";
import { ExtractedInvoiceSchema, type ExtractedInvoice } from "./schema";

const INSTRUCTIONS = `Extraé los datos de esta factura de proveedor para un comercio.
Reglas:
- Copiá en "texto_original" cada línea tal como aparece. No inventes datos: si algo no está o no se lee, usá null.
- Números como texto sin separador de miles y con punto decimal (ej.: "28000.00"). No conviertas monedas.
- "cantidad" es la cantidad facturada; "presentacion" es cómo se vende (caja, pack, bulto, unidad) e incluí cuántas unidades trae si figura (ej.: "Caja x 12").
- "precio_unitario" es el precio de cada presentación tal como figura; NO lo dividas por unidades internas.
- "importe" es el total de la línea tal como figura. "descuento_pct" sólo si la línea muestra un porcentaje de descuento.
- "importes_incluyen_impuestos": true si los precios de las líneas incluyen IVA u otros impuestos, false si son netos y el impuesto se suma aparte, null si no se puede saber.
- "moneda": código ISO de 3 letras sólo si la factura lo permite determinar (el símbolo "$" solo es ambiguo: indicalo en observaciones).
- Incluí líneas de flete, recargos o bonificaciones como líneas separadas.
- En "observaciones" anotá dudas, partes ilegibles y totales de la factura.`;

export class AnthropicProvider implements ExtractionProvider {
  readonly name = "anthropic";
  readonly configured = true;
  readonly statusMessage: string;
  private client: Anthropic;

  constructor(apiKey: string, readonly model: string) {
    this.client = new Anthropic({ apiKey, timeout: 5 * 60 * 1000, maxRetries: 2 });
    this.statusMessage = `Extracción automática activa (Claude, modelo ${model}).`;
  }

  async extract(file: InvoiceFile): Promise<ExtractedInvoice> {
    const data = file.buffer.toString("base64");
    const fileBlock: Anthropic.Beta.BetaContentBlockParam =
      file.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: file.mimeType, data } };

    try {
      const response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        // Si el modelo principal rechaza la solicitud, la API reintenta con un modelo alternativo.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(ExtractedInvoiceSchema) },
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: INSTRUCTIONS }] }],
      });

      if (response.stop_reason === "refusal") {
        throw new ExtractionError("refusal", "El servicio de IA no procesó este archivo. Cargá las líneas a mano.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new ExtractionError("max_tokens", "La factura es demasiado larga para procesarla de una vez.");
      }
      const parsed = response.parsed_output ? ExtractedInvoiceSchema.safeParse(response.parsed_output) : null;
      if (!parsed?.success) {
        throw new ExtractionError("invalid output", "La IA devolvió datos con un formato inesperado. Probá de nuevo o cargá las líneas a mano.");
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ExtractionError("auth", "La clave de Anthropic no es válida. Revisá ANTHROPIC_API_KEY en el archivo .env.");
      }
      if (err instanceof Anthropic.PermissionDeniedError) {
        throw new ExtractionError("permission", "La clave de Anthropic no tiene permiso para usar este modelo.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new ExtractionError("rate limit", "Se alcanzó el límite de uso de la API. Esperá un momento y reintentá.");
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new ExtractionError(`bad request ${err.status}`, "La API rechazó el archivo (puede estar dañado, protegido o ser demasiado grande).");
      }
      if (err instanceof Anthropic.APIConnectionError) {
        throw new ExtractionError("connection", "No se pudo conectar con la API de Anthropic. Revisá tu conexión a internet.");
      }
      if (err instanceof Anthropic.APIError) {
        throw new ExtractionError(`api ${err.status}`, "El servicio de IA respondió con un error. Reintentá en unos minutos.");
      }
      throw new ExtractionError("unknown", "Ocurrió un error inesperado al extraer la factura.");
    }
  }
}
