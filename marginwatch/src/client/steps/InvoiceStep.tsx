import { useRef, useState } from "react";
import { api, type AppState, type InvoiceSummary } from "../api";
import type { StepId } from "../App";
import { Banner, Empty, Spinner } from "../ui";

type Props = {
  state: AppState;
  applyState: (s: AppState) => void;
  goTo: (s: StepId) => void;
  withFlush: <T>(fn: () => Promise<T>) => Promise<T>;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const OK_EXT = /\.(pdf|jpe?g|png|webp)$/i;

const STATUS_LABEL: Record<InvoiceSummary["extractionStatus"], string> = {
  completada: "Extraída con IA",
  pendiente_sin_clave: "Extracción pendiente",
  error: "Error de extracción",
  manual: "Carga manual",
  ejemplo: "EJEMPLO",
};

export function InvoiceStep({ state, applyState, goTo, withFlush }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ex = state.extraction;

  const run = async (label: string, fn: () => Promise<AppState>, next: StepId | null = "revision") => {
    setBusy(label);
    setError(null);
    try {
      const s = await withFlush(fn);
      applyState(s);
      if (next) goTo(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!OK_EXT.test(file.name)) {
      setError("Formato no admitido. Subí un PDF o una imagen JPG, PNG o WEBP.");
      return;
    }
    if (file.size > state.limits.maxInvoiceMB * 1024 * 1024) {
      setError(`El archivo supera el máximo de ${state.limits.maxInvoiceMB} MB.`);
      return;
    }
    if (file.size === 0) {
      setError("El archivo está vacío.");
      return;
    }
    void run(
      ex.configured ? "Leyendo la factura con IA… puede tardar hasta un minuto." : "Guardando el archivo…",
      () => api.uploadInvoice(file),
    );
  };

  return (
    <section className="step-panel">
      <div className="panel-head">
        <h1>2. Factura del proveedor</h1>
        <p className="lead">Subí la factura en PDF o como foto. Después vas a revisar cada línea antes de calcular.</p>
      </div>

      {ex.configured ? (
        <Banner tone="ok" title="Extracción automática activa">
          {ex.message} La IA puede equivocarse: siempre vas a revisar los datos en el paso siguiente.
        </Banner>
      ) : (
        <Banner tone="warn" title="Extracción real pendiente">
          {ex.message}
        </Banner>
      )}

      <div className="card">
        <h2>Subir factura</h2>
        <div
          className={`dropzone ${dragOver ? "dropzone-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
        >
          <p>
            <strong>Arrastrá el archivo acá</strong> o
          </p>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            Elegir archivo
          </button>
          <p className="muted small">PDF, JPG, PNG o WEBP · hasta {state.limits.maxInvoiceMB} MB</p>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {busy && <Spinner label={busy} />}
        {error && <Banner tone="error" title="No se pudo cargar la factura">{error}</Banner>}

        <div className="alt-actions">
          <div>
            <h3>¿Sin archivo o sin clave de IA?</h3>
            <p className="muted small">Podés cargar los datos de la factura a mano, línea por línea.</p>
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void run("Creando factura…", api.manualInvoice)}>
              Cargar líneas a mano
            </button>
          </div>
          <div>
            <h3>
              Modo ejemplo <span className="tag tag-demo">FICTICIO</span>
            </h3>
            <p className="muted small">
              Carga una factura inventada que combina con el catálogo de ejemplo. No procesa ningún archivo.
            </p>
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => void run("Cargando ejemplo…", api.demoInvoice)}>
              Cargar factura de ejemplo
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Facturas guardadas</h2>
        {state.invoices.length === 0 ? (
          <Empty title="Todavía no hay facturas">Las facturas que cargues quedan guardadas para retomarlas después.</Empty>
        ) : (
          <ul className="invoice-list">
            {state.invoices.map((i) => (
              <li key={i.id} className={state.currentInvoice?.id === i.id ? "current" : ""}>
                <div className="invoice-info">
                  <strong>{i.supplier || i.fileName || "Factura sin datos"}</strong>
                  <span className="muted small">
                    {[i.invoiceNumber, i.date, `${i.lineCount} líneas`].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`tag ${i.source === "ejemplo" ? "tag-demo" : ""}`}>{STATUS_LABEL[i.extractionStatus]}</span>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!!busy}
                    onClick={() => void run("Abriendo…", () => api.openInvoice(i.id))}
                  >
                    {state.currentInvoice?.id === i.id ? "Continuar" : "Abrir"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-danger-ghost"
                    disabled={!!busy}
                    onClick={() =>
                      window.confirm("¿Eliminar esta factura y su revisión? No se puede deshacer.") &&
                      void run("Eliminando…", () => api.deleteInvoice(i.id), null)
                    }
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
