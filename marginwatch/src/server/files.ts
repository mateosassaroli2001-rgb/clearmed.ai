// Validación de archivos subidos: tipo real (por contenido, no sólo por extensión) y tamaño.
export type InvoiceMime = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";

export const INVOICE_EXTENSIONS: Record<InvoiceMime, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

/** Detecta el tipo por los primeros bytes del archivo ("firma"). */
export function sniffInvoiceType(buf: Buffer): InvoiceMime | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateInvoiceFile(buf: Buffer, originalName: string, maxBytes: number): ValidationResult<InvoiceMime> {
  if (buf.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (buf.length > maxBytes) {
    return { ok: false, error: `El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  const type = sniffInvoiceType(buf);
  if (!type) return { ok: false, error: "Formato no admitido. Subí un PDF o una imagen JPG, PNG o WEBP." };
  const ext = originalName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!INVOICE_EXTENSIONS[type].includes(ext)) {
    return { ok: false, error: `La extensión "${ext || "(ninguna)"}" no coincide con el contenido del archivo (${type}).` };
  }
  return { ok: true, value: type };
}

/** Decodifica un CSV: UTF-8 si es válido; si no, Windows-1252 (típico de Excel en español). */
export function decodeCsv(buf: Buffer, originalName: string, maxBytes: number): ValidationResult<string> {
  if (buf.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (buf.length > maxBytes) return { ok: false, error: "El CSV supera el máximo de 2 MB." };
  if (!/\.(csv|txt)$/i.test(originalName)) return { ok: false, error: "Subí un archivo .csv (podés exportarlo desde Excel o Google Sheets)." };
  if (buf.includes(0)) return { ok: false, error: "El archivo no parece ser un CSV de texto (¿es un .xlsx renombrado?)." };
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(buf) };
  } catch {
    return { ok: true, value: new TextDecoder("windows-1252").decode(buf) };
  }
}
