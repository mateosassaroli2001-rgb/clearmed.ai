// Servidor local de MarginWatch.
// - Recibe y valida archivos (catálogo CSV y facturas PDF/imagen).
// - Llama a la IA del lado servidor: la clave nunca llega al navegador.
// - Guarda todo en la carpeta data/ para poder retomar el trabajo.
// - NO se conecta a ninguna tienda: no cambia precios ni costos reales.
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { parseCatalogCsv } from "../core/catalog-csv";
import { buildProposalsCsv, approvedRows } from "../core/export";
import { buildLine } from "../core/lines";
import { computeProposals } from "../core/margins";
import { proposeMatch } from "../core/matching";
import {
  InvoiceUpdateSchema,
  SettingsSchema,
  newId,
  type AppData,
  type CatalogItem,
  type Invoice,
} from "../core/types";
import { config, createExtractionProvider } from "./config";
import { ExtractionError } from "./extraction/provider";
import { ExtractedInvoiceSchema, type ExtractedInvoice } from "./extraction/schema";
import { decodeCsv, validateInvoiceFile, type InvoiceMime } from "./files";
import { JsonStore } from "./store";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLES = path.join(ROOT, "samples");

const store = new JsonStore(config.dataDir);
const provider = createExtractionProvider();

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// ── Helpers ──────────────────────────────────────────────────

const now = () => new Date().toISOString();

function findInvoice(data: AppData, id: string): Invoice {
  const inv = data.invoices.find((i) => i.id === id);
  if (!inv) throw new HttpError(404, "No se encontró la factura.");
  return inv;
}

function catalogItems(data: AppData): CatalogItem[] {
  return data.catalog?.items ?? [];
}

/** Convierte lo extraído (por IA o del ejemplo) en datos de factura editables. */
function applyExtraction(inv: Invoice, ex: ExtractedInvoice, catalog: CatalogItem[]): void {
  const warnings: string[] = [];
  const currency = ex.moneda?.trim().toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) warnings.push(`La moneda detectada ("${ex.moneda}") no es un código válido: confirmala.`);
  inv.supplier = (ex.proveedor ?? "").slice(0, 200);
  inv.invoiceNumber = (ex.numero_factura ?? "").slice(0, 100);
  inv.date = (ex.fecha ?? "").slice(0, 40);
  inv.currency = currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
  inv.taxBasis = ex.importes_incluyen_impuestos === null ? null : ex.importes_incluyen_impuestos ? "con_impuestos" : "sin_impuestos";
  inv.taxRatePercent = ex.tasa_impuesto_pct?.replace("%", "").trim() || null;
  inv.globalDiscountPercent = ex.descuento_general_pct?.replace("%", "").trim() || null;
  inv.lines = ex.lineas.slice(0, 500).map((l) => {
    const built = buildLine(
      {
        text: l.texto_original.slice(0, 1000),
        description: l.descripcion.slice(0, 500),
        code: l.codigo?.slice(0, 120) || null,
        quantity: l.cantidad?.slice(0, 60) ?? null,
        presentation: l.presentacion?.slice(0, 200) ?? null,
        unitPrice: l.precio_unitario?.slice(0, 60) ?? null,
        amount: l.importe?.slice(0, 60) ?? null,
        discount: l.descuento_pct?.slice(0, 60) ?? null,
      },
      catalog,
    );
    warnings.push(...built.warnings);
    return built.line;
  });
  if (ex.lineas.length > 500) warnings.push("La factura tiene más de 500 líneas: sólo se cargaron las primeras 500.");
  if (!inv.currency) warnings.push("No se pudo determinar la moneda: confirmala antes de calcular.");
  if (!inv.taxBasis) warnings.push("No se pudo determinar si los importes incluyen impuestos: confirmalo antes de calcular.");
  inv.extraction.warnings = [...ex.observaciones.map((o) => o.slice(0, 500)), ...warnings].slice(0, 50);
  inv.proposals = {};
}

function blankInvoice(source: Invoice["source"]): Invoice {
  const t = now();
  return {
    id: newId("fac"),
    createdAt: t,
    updatedAt: t,
    source,
    file: null,
    extraction: { status: "manual", provider: null, model: null, message: null, warnings: [] },
    supplier: "",
    invoiceNumber: "",
    date: "",
    currency: null,
    taxBasis: null,
    taxRatePercent: null,
    globalDiscountPercent: null,
    lines: [],
    proposals: {},
  };
}

async function runExtraction(invoiceId: string): Promise<void> {
  const data = store.get();
  const inv = findInvoice(data, invoiceId);
  if (!inv.file) throw new HttpError(400, "Esta factura no tiene un archivo asociado.");
  if (!provider.configured) {
    await store.update((d) => {
      const i = findInvoice(d, invoiceId);
      i.extraction = { status: "pendiente_sin_clave", provider: null, model: null, message: provider.statusMessage, warnings: [] };
      i.updatedAt = now();
    });
    return;
  }
  const buffer = await fs.readFile(path.join(store.uploadsDir, inv.file.storedName));
  const started = Date.now();
  // Sólo se registran datos técnicos: nunca el contenido de la factura.
  console.log(`[extracción] iniciando (${inv.file.mimeType}, ${Math.round(inv.file.size / 1024)} KB)`);
  try {
    const extracted = await provider.extract({ buffer, mimeType: inv.file.mimeType as InvoiceMime });
    await store.update((d) => {
      const i = findInvoice(d, invoiceId);
      i.extraction = { status: "completada", provider: provider.name, model: provider.model, message: null, warnings: [] };
      applyExtraction(i, extracted, catalogItems(d));
      i.updatedAt = now();
    });
    console.log(`[extracción] completada: ${extracted.lineas.length} líneas en ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (err) {
    const userMessage = err instanceof ExtractionError ? err.userMessage : "Ocurrió un error inesperado al extraer la factura.";
    console.warn(`[extracción] falló: ${err instanceof ExtractionError ? err.message : "error inesperado"}`);
    await store.update((d) => {
      const i = findInvoice(d, invoiceId);
      i.extraction = { status: "error", provider: provider.name, model: provider.model, message: userMessage, warnings: [] };
      i.updatedAt = now();
    });
  }
}

function statePayload() {
  const data = store.get();
  return {
    catalog: data.catalog,
    settings: data.settings,
    invoices: data.invoices
      .map((i) => ({
        id: i.id,
        supplier: i.supplier,
        invoiceNumber: i.invoiceNumber,
        date: i.date,
        source: i.source,
        fileName: i.file?.originalName ?? null,
        lineCount: i.lines.length,
        extractionStatus: i.extraction.status,
        updatedAt: i.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    currentInvoice: data.invoices.find((i) => i.id === data.currentInvoiceId) ?? null,
    extraction: { provider: provider.name, model: provider.model, configured: provider.configured, message: provider.statusMessage },
    limits: { maxInvoiceMB: Math.round(config.maxInvoiceBytes / 1024 / 1024), maxCatalogMB: 2 },
  };
}

// ── App ──────────────────────────────────────────────────────

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// Protección contra sitios externos que intenten usar este servidor local (DNS rebinding).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
app.use("/api", (req, _res, next) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (config.host === "127.0.0.1" && !LOCAL_HOSTS.has(host)) return next(new HttpError(403, "Acceso no permitido."));
  next();
});

app.use("/api", (req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    // Registro mínimo: método, ruta y resultado. Sin contenido de archivos ni datos del negocio.
    if (req.method !== "GET" || res.statusCode >= 400) {
      console.log(`[api] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - started} ms)`);
    }
  });
  next();
});

app.use(express.json({ limit: "2mb" }));

const invoiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxInvoiceBytes, files: 1, fields: 5 } });
const catalogUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxCatalogBytes, files: 1, fields: 5 } });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", (_req, res) => {
  res.json(statePayload());
});

// Catálogo
async function importCatalog(text: string, source: "archivo" | "ejemplo", fileName: string | null, res: Response) {
  const result = parseCatalogCsv(text);
  if (result.items.length === 0) {
    res.status(422).json({ error: "No se importó ningún producto.", report: result });
    return;
  }
  await store.update((d) => {
    d.catalog = { items: result.items, source, fileName, importedAt: now() };
    // Las coincidencias ya propuestas apuntan al catálogo anterior: se vuelven a calcular.
    for (const inv of d.invoices) {
      for (const line of inv.lines) {
        line.match = proposeMatch(line, result.items);
        line.confirmed = false;
      }
      inv.proposals = {};
    }
  });
  res.json({ report: { ...result, items: undefined, imported: result.items.length }, state: statePayload() });
}

app.post("/api/catalog/import", catalogUpload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "No se recibió ningún archivo.");
  const decoded = decodeCsv(req.file.buffer, req.file.originalname, config.maxCatalogBytes);
  if (!decoded.ok) throw new HttpError(400, decoded.error);
  await importCatalog(decoded.value, "archivo", req.file.originalname.slice(0, 260), res);
});

app.post("/api/catalog/demo", async (_req, res) => {
  const text = await fs.readFile(path.join(SAMPLES, "catalogo-ejemplo.csv"), "utf8");
  await importCatalog(text, "ejemplo", "catalogo-ejemplo.csv", res);
});

app.delete("/api/catalog", async (_req, res) => {
  await store.update((d) => {
    d.catalog = null;
  });
  res.json(statePayload());
});

app.put("/api/settings", async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Configuración inválida.");
  await store.update((d) => {
    d.settings = parsed.data;
  });
  res.json(statePayload());
});

// Facturas
app.post("/api/invoices/upload", invoiceUpload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "No se recibió ningún archivo.");
  const check = validateInvoiceFile(req.file.buffer, req.file.originalname, config.maxInvoiceBytes);
  if (!check.ok) throw new HttpError(400, check.error);

  const inv = blankInvoice("archivo");
  const ext = path.extname(req.file.originalname).toLowerCase();
  const storedName = `${inv.id}${ext}`;
  await fs.writeFile(path.join(store.uploadsDir, storedName), req.file.buffer);
  inv.file = {
    storedName,
    originalName: req.file.originalname.slice(0, 260),
    mimeType: check.value,
    size: req.file.size,
    sha256: crypto.createHash("sha256").update(req.file.buffer).digest("hex"),
  };
  inv.extraction = provider.configured
    ? { status: "manual", provider: provider.name, model: provider.model, message: "Procesando…", warnings: [] }
    : { status: "pendiente_sin_clave", provider: null, model: null, message: provider.statusMessage, warnings: [] };
  await store.update((d) => {
    d.invoices.push(inv);
    d.currentInvoiceId = inv.id;
  });
  if (provider.configured) await runExtraction(inv.id);
  res.json(statePayload());
});

app.post("/api/invoices/:id/extract", async (req, res) => {
  await runExtraction(req.params.id);
  res.json(statePayload());
});

app.post("/api/invoices/demo", async (_req, res) => {
  const raw = JSON.parse(await fs.readFile(path.join(SAMPLES, "factura-ejemplo.json"), "utf8"));
  const ex = ExtractedInvoiceSchema.parse(raw);
  const inv = blankInvoice("ejemplo");
  await store.update((d) => {
    applyExtraction(inv, ex, catalogItems(d));
    inv.extraction = {
      ...inv.extraction,
      status: "ejemplo",
      message: "FACTURA DE EJEMPLO con datos ficticios precargados. No proviene de procesar un archivo real.",
    };
    d.invoices.push(inv);
    d.currentInvoiceId = inv.id;
  });
  res.json(statePayload());
});

app.post("/api/invoices/manual", async (_req, res) => {
  const inv = blankInvoice("manual");
  await store.update((d) => {
    d.invoices.push(inv);
    d.currentInvoiceId = inv.id;
  });
  res.json(statePayload());
});

app.put("/api/invoices/:id", async (req, res) => {
  const parsed = InvoiceUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Los datos de la factura no son válidos.");
  const updatedAt = await store.update((d) => {
    const inv = findInvoice(d, req.params.id);
    const originalRaw = new Map(inv.lines.map((l) => [l.id, l.raw]));
    Object.assign(inv, parsed.data);
    // El texto original extraído no se puede modificar desde el navegador.
    inv.lines = inv.lines.map((l) => ({ ...l, raw: originalRaw.get(l.id) ?? l.raw }));
    inv.updatedAt = now();
    return inv.updatedAt;
  });
  res.json({ ok: true, updatedAt });
});

app.put("/api/current-invoice", async (req, res) => {
  const id = z.object({ id: z.string().nullable() }).parse(req.body).id;
  await store.update((d) => {
    if (id) findInvoice(d, id);
    d.currentInvoiceId = id;
  });
  res.json(statePayload());
});

app.delete("/api/invoices/:id", async (req, res) => {
  const removed = await store.update((d) => {
    const inv = findInvoice(d, req.params.id);
    d.invoices = d.invoices.filter((i) => i.id !== inv.id);
    if (d.currentInvoiceId === inv.id) d.currentInvoiceId = null;
    return inv;
  });
  if (removed.file) await fs.rm(path.join(store.uploadsDir, removed.file.storedName), { force: true });
  res.json(statePayload());
});

app.get("/api/invoices/:id/file", async (req, res) => {
  const inv = findInvoice(store.get(), req.params.id);
  if (!inv.file) throw new HttpError(404, "Esta factura no tiene archivo.");
  res.setHeader("Content-Type", inv.file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="factura${path.extname(inv.file.storedName)}"`);
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(store.uploadsDir, inv.file.storedName));
});

app.get("/api/invoices/:id/export.csv", (req, res) => {
  const data = store.get();
  const inv = findInvoice(data, req.params.id);
  const rows = computeProposals(inv, catalogItems(data), data.settings);
  if (approvedRows(rows).length === 0) throw new HttpError(409, "No hay propuestas aprobadas para exportar.");
  const csv = buildProposalsCsv(rows, inv, data.settings);
  const date = now().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="marginwatch-propuestas-revision-${date}.csv"`);
  res.send(csv);
});

app.use("/api", (_req, _res, next) => next(new HttpError(404, "Ruta no encontrada.")));

// Frontend
if (config.production) {
  const clientDir = path.join(ROOT, "dist/client");
  app.use(express.static(clientDir));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(ROOT, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

// Errores: mensajes claros en español, sin exponer detalles internos.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "El archivo es demasiado grande."
        : err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT"
          ? "Subí un solo archivo por vez."
          : "No se pudo recibir el archivo.";
    res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: msg });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Datos inválidos." });
    return;
  }
  if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Los datos enviados son demasiado grandes." });
    return;
  }
  console.error("[error] error interno:", err instanceof Error ? err.name : "desconocido");
  res.status(500).json({ error: "Ocurrió un error interno. Probá de nuevo." });
});

await store.init();
app.listen(config.port, config.host, () => {
  console.log("");
  console.log("  MarginWatch está funcionando.");
  console.log(`  Abrí en tu navegador:  http://localhost:${config.port}`);
  console.log(`  Datos guardados en:    ${config.dataDir}`);
  console.log(`  Extracción IA:         ${provider.configured ? `activa (${provider.model})` : "PENDIENTE — falta ANTHROPIC_API_KEY"}`);
  console.log("");
});
