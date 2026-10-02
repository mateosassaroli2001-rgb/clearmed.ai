import { useRef, useState } from "react";
import { formatMoney } from "../../core/numbers";
import { TAX_BASIS_LABEL, type Settings, type TaxBasis } from "../../core/types";
import { REQUIRED_COLUMNS_LABEL } from "../../core/catalog-csv";
import { api, type AppState, type CatalogReport } from "../api";
import type { StepId } from "../App";
import { Banner, Empty, Spinner } from "../ui";

type Props = {
  state: AppState;
  applyState: (s: AppState) => void;
  goTo: (s: StepId) => void;
  saveSettings: (s: Settings) => Promise<void>;
  withFlush: <T>(fn: () => Promise<T>) => Promise<T>;
};

export function CatalogStep({ state, applyState, goTo, saveSettings, withFlush }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CatalogReport | null>(null);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const catalog = state.catalog;
  const hasInvoices = state.invoices.length > 0;

  const confirmReplace = () =>
    !catalog ||
    window.confirm(
      "Esto reemplaza el catálogo actual." +
        (hasInvoices ? " Las coincidencias ya revisadas en tus facturas se van a volver a proponer y tendrás que confirmarlas otra vez." : "") +
        " ¿Continuar?",
    );

  const run = async (label: string, fn: () => Promise<{ report: CatalogReport; state: AppState }>) => {
    setBusy(label);
    setError(null);
    setReport(null);
    try {
      const r = await withFlush(fn);
      setReport(r.report);
      applyState(r.state);
    } catch (e) {
      const body = (e as { body?: { report?: CatalogReport } }).body;
      if (body?.report) setReport({ ...body.report, imported: 0 });
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > state.limits.maxCatalogMB * 1024 * 1024) {
      setError(`El archivo supera el máximo de ${state.limits.maxCatalogMB} MB.`);
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Subí un archivo .csv. Si tu catálogo está en Excel, usá «Guardar como → CSV».");
      return;
    }
    if (!confirmReplace()) return;
    void run("Importando catálogo…", () => api.importCatalog(file));
  };

  const setBasis = (v: string) =>
    void saveSettings({ ...state.settings, catalogTaxBasis: v === "" ? null : (v as TaxBasis) });

  const items = (catalog?.items ?? []).filter((i) =>
    `${i.sku} ${i.name} ${i.variant}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <section className="step-panel">
      <div className="panel-head">
        <h1>1. Catálogo de productos</h1>
        <p className="lead">
          Importá tus productos con su costo y precio actuales. Es la base para comparar con la factura del proveedor.
        </p>
      </div>

      <div className="card">
        <h2>Importar desde CSV</h2>
        <p className="muted">
          Columnas: <code>{REQUIRED_COLUMNS_LABEL}</code>. Se acepta coma o punto y coma como separador, y números como{" "}
          <code>1234.56</code> o <code>1.234,56</code>.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            Elegir archivo CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!!busy}
            onClick={() => confirmReplace() && void run("Cargando catálogo de ejemplo…", api.demoCatalog)}
          >
            Usar catálogo de ejemplo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            hidden
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {busy && <Spinner label={busy} />}
        {error && <Banner tone="error" title="No se pudo importar el catálogo">{error}</Banner>}
        {report && <ImportReport report={report} />}
      </div>

      <div className="card">
        <h2>¿Los costos y precios del catálogo incluyen impuestos?</h2>
        <p className="muted">
          Para comparar bien, el costo del catálogo y el de la factura tienen que estar en la misma base. Sin este dato, los
          cálculos quedan bloqueados.
        </p>
        <div className="radio-row" role="radiogroup" aria-label="Base tributaria del catálogo">
          {(["sin_impuestos", "con_impuestos"] as TaxBasis[]).map((b) => (
            <label key={b} className={`radio-card ${state.settings.catalogTaxBasis === b ? "radio-card-on" : ""}`}>
              <input
                type="radio"
                name="taxbasis"
                checked={state.settings.catalogTaxBasis === b}
                onChange={() => setBasis(b)}
              />
              <span>
                Costos y precios <strong>{TAX_BASIS_LABEL[b]}</strong>
              </span>
            </label>
          ))}
        </div>
        {!state.settings.catalogTaxBasis && catalog && (
          <Banner tone="warn">Elegí una opción para poder calcular márgenes.</Banner>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            Productos {catalog && <span className="count">{catalog.items.length}</span>}
          </h2>
          {catalog && (
            <span className="muted small">
              {catalog.source === "ejemplo" ? "Catálogo de EJEMPLO (ficticio)" : catalog.fileName} · importado{" "}
              {new Date(catalog.importedAt).toLocaleString("es-AR")}
            </span>
          )}
        </div>
        {!catalog ? (
          <Empty title="Todavía no hay productos">Importá un CSV o probá con el catálogo de ejemplo.</Empty>
        ) : (
          <>
            <input
              className="search"
              type="search"
              placeholder="Buscar por SKU, nombre o variante"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Buscar productos"
            />
            {items.length === 0 ? (
              <Empty title="Ningún producto coincide con la búsqueda" />
            ) : (
              <div className="table-wrap">
                <table className="table table-stack">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Variante</th>
                      <th className="num">Costo unitario</th>
                      <th className="num">Precio de venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, 300).map((i) => (
                      <tr key={i.id}>
                        <td data-label="SKU"><code>{i.sku || "—"}</code></td>
                        <td data-label="Producto">{i.name}</td>
                        <td data-label="Variante">{i.variant || "—"}</td>
                        <td data-label="Costo" className="num">{formatMoney(i.unitCost, i.currency)}</td>
                        <td data-label="Precio" className="num">{formatMoney(i.price, i.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length > 300 && <p className="muted small">Se muestran los primeros 300. Usá la búsqueda para ver otros.</p>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="next-row">
        <button type="button" className="btn btn-primary" disabled={!catalog} onClick={() => goTo("factura")}>
          Siguiente: subir factura →
        </button>
      </div>
    </section>
  );
}

function ImportReport({ report }: { report: CatalogReport }) {
  return (
    <div className="report">
      {report.imported > 0 && <Banner tone="ok" title={`Se importaron ${report.imported} productos.`} />}
      {report.errors.length > 0 && (
        <Banner tone={report.imported > 0 ? "warn" : "error"} title={`${report.errors.length} fila(s) con errores (no se importaron):`}>
          <ul className="compact-list">
            {report.errors.slice(0, 20).map((e, i) => (
              <li key={i}>{e.row > 0 ? `Fila ${e.row}: ` : ""}{e.message}</li>
            ))}
            {report.errors.length > 20 && <li>… y {report.errors.length - 20} más.</li>}
          </ul>
        </Banner>
      )}
      {report.warnings.length > 0 && (
        <details className="details">
          <summary>{report.warnings.length} aviso(s)</summary>
          <ul className="compact-list">
            {report.warnings.slice(0, 30).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
