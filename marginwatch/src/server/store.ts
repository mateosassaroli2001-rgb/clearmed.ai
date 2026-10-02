// Almacenamiento local en un archivo JSON (data/marginwatch.json).
// Simple a propósito: un solo comerciante, una sola computadora.
// Para la integración con Shopify se puede reemplazar por una base de datos sin tocar el resto.
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppDataSchema, DEFAULT_SETTINGS, type AppData } from "../core/types";

export class JsonStore {
  private data: AppData | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  readonly file: string;
  readonly uploadsDir: string;

  constructor(readonly dir: string) {
    this.file = path.join(dir, "marginwatch.json");
    this.uploadsDir = path.join(dir, "facturas");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = AppDataSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this.data = parsed.data;
        return;
      }
      const backup = `${this.file}.danado-${Date.now()}`;
      await fs.rename(this.file, backup);
      console.warn(`[datos] El archivo de datos no tenía el formato esperado. Se guardó una copia en ${backup}.`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[datos] No se pudo leer el archivo de datos; se empieza vacío.");
      }
    }
    this.data = { version: 1, catalog: null, settings: { ...DEFAULT_SETTINGS }, invoices: [], currentInvoiceId: null };
    await this.persist();
  }

  get(): AppData {
    if (!this.data) throw new Error("store not initialized");
    return structuredClone(this.data);
  }

  /** Aplica un cambio y lo guarda en disco. Los cambios se ejecutan de a uno (sin pisarse). */
  update<T>(fn: (draft: AppData) => T): Promise<T> {
    const run = async () => {
      const draft = this.get();
      const result = fn(draft);
      const checked = AppDataSchema.parse(draft);
      this.data = checked;
      await this.persist();
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async persist(): Promise<void> {
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
    await fs.rename(tmp, this.file); // escritura atómica: nunca queda un archivo a medias
  }
}
