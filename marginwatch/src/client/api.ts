// Comunicación con el servidor local.
import type { Catalog, Invoice, InvoiceUpdate, Settings } from "../core/types";

export type InvoiceSummary = {
  id: string;
  supplier: string;
  invoiceNumber: string;
  date: string;
  source: Invoice["source"];
  fileName: string | null;
  lineCount: number;
  extractionStatus: Invoice["extraction"]["status"];
  updatedAt: string;
};

export type AppState = {
  catalog: Catalog | null;
  settings: Settings;
  invoices: InvoiceSummary[];
  currentInvoice: Invoice | null;
  extraction: { provider: string; model: string | null; configured: boolean; message: string };
  limits: { maxInvoiceMB: number; maxCatalogMB: number };
};

export type CatalogReport = {
  imported: number;
  errors: { row: number; message: string }[];
  warnings: string[];
  missingColumns: string[];
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor de MarginWatch. ¿Sigue abierta la terminal donde lo iniciaste?", 0, null);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `Error ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

const formWith = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
};

export const api = {
  state: () => request<AppState>("GET", "/api/state"),
  importCatalog: (file: File) =>
    request<{ report: CatalogReport; state: AppState }>("POST", "/api/catalog/import", formWith(file)),
  demoCatalog: () => request<{ report: CatalogReport; state: AppState }>("POST", "/api/catalog/demo"),
  deleteCatalog: () => request<AppState>("DELETE", "/api/catalog"),
  saveSettings: (s: Settings) => request<AppState>("PUT", "/api/settings", s),
  uploadInvoice: (file: File) => request<AppState>("POST", "/api/invoices/upload", formWith(file)),
  retryExtraction: (id: string) => request<AppState>("POST", `/api/invoices/${id}/extract`),
  demoInvoice: () => request<AppState>("POST", "/api/invoices/demo"),
  manualInvoice: () => request<AppState>("POST", "/api/invoices/manual"),
  saveInvoice: (id: string, update: InvoiceUpdate) =>
    request<{ ok: true; updatedAt: string }>("PUT", `/api/invoices/${id}`, update),
  openInvoice: (id: string | null) => request<AppState>("PUT", "/api/current-invoice", { id }),
  deleteInvoice: (id: string) => request<AppState>("DELETE", `/api/invoices/${id}`),
  fileUrl: (id: string) => `/api/invoices/${id}/file`,
  exportUrl: (id: string) => `/api/invoices/${id}/export.csv`,
};
