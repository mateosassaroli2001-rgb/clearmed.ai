// Configuración leída de variables de entorno (archivo .env).
import "dotenv/config";
import path from "node:path";
import { AnthropicProvider } from "./extraction/anthropic";
import { NoProvider, type ExtractionProvider } from "./extraction/provider";

const int = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : def;
};

export const config = {
  port: int(process.env.PORT, 3000),
  // Por defecto sólo se escucha en esta computadora (no en la red local).
  host: process.env.HOST || "127.0.0.1",
  dataDir: path.resolve(process.env.DATA_DIR || "data"),
  maxInvoiceBytes: int(process.env.MAX_INVOICE_MB, 10) * 1024 * 1024,
  maxCatalogBytes: 2 * 1024 * 1024,
  production: process.argv.includes("--production"),
};

export function createExtractionProvider(): ExtractionProvider {
  const requested = (process.env.EXTRACTION_PROVIDER || "anthropic").trim().toLowerCase();
  if (requested === "none" || requested === "ninguno") {
    return new NoProvider("La extracción automática está desactivada (EXTRACTION_PROVIDER=none). Podés cargar las líneas a mano.");
  }
  if (requested !== "anthropic") {
    return new NoProvider(`El proveedor de extracción "${requested}" no existe. Opciones válidas: anthropic, none.`);
  }
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || key.includes("xxxx")) {
    return new NoProvider(
      "Extracción real pendiente: falta configurar ANTHROPIC_API_KEY en el archivo .env. " +
        "Mientras tanto podés cargar las líneas a mano o probar la factura de ejemplo.",
    );
  }
  return new AnthropicProvider(key, process.env.EXTRACTION_MODEL?.trim() || "claude-opus-5-5");
}
