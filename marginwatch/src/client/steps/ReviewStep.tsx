import { useMemo, useState } from "react";
import { emptyRawLine } from "../../core/lines";
import { lineIssues } from "../../core/margins";
import { itemLabel, proposeMatch } from "../../core/matching";
import { formatMoney } from "../../core/numbers";
import { detectPackaging } from "../../core/packaging";
import {
  TAX_BASIS_LABEL,
  newId,
  type AmountSource,
  type CatalogItem,
  type Invoice,
  type InvoiceLine,
  type MatchStatus,
  type Settings,
  type TaxBasis,
} from "../../core/types";
import { api, type AppState } from "../api";
import type { StepId } from "../App";
import { Banner, Empty, NumberField, Spinner, TextField } from "../ui";

type Props = {
  state: AppState;
  applyState: (s: AppState) => void;
  goTo: (s: StepId) => void;
  invoice: Invoice;
  updateInvoice: (fn: (inv: Invoice) => Invoice) => void;
  withFlush: <T>(fn: () => Promise<T>) => Promise<T>;
};

const MATCH_LABEL: Record<MatchStatus, { text: string; tone: string }> = {
  sku_exacto: { text: "SKU exacto", tone: "ok" },
  sku_en_texto: { text: "SKU en la descripción — revisar", tone: "info" },
  probable: { text: "Sugerida por nombre — revisar", tone: "info" },
  ambigua: { text: "Ambigua — elegí el producto", tone: "warn" },
  sin_coincidencia: { text: "Sin coincidencia", tone: "muted" },
  manual: { text: "Elegida por vos", tone: "ok" },
};

const COMMON_CURRENCIES = ["ARS", "USD", "EUR", "MXN", "CLP", "COP", "UYU", "PEN", "BRL"];

type Filter = "todas" | "pendientes" | "confirmadas" | "ignoradas";

export function ReviewStep({ state, applyState, goTo, invoice, updateInvoice, withFlush }: Props) {
  const catalog = state.catalog?.items ?? [];
  const settings = state.settings;
  const [filter, setFilter] = useState<Filter>("todas");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const issuesById = useMemo(
    () => new Map(invoice.lines.map((l) => [l.id, lineIssues(l, invoice, catalog, settings)])),
    [invoice, catalog, settings],
  );

  const setHeader = <K extends keyof Invoice>(key: K, value: Invoice[K]) =>
    // Cambiar datos de cabecera puede cambiar los cálculos: las líneas confirmadas se mantienen,
    // pero los bloqueos se recalculan automáticamente en Márgenes.
    updateInvoice((inv) => ({ ...inv, [key]: value }));

  const setLine = (id: string, patch: Partial<InvoiceLine>, keepConfirmed = false) =>
    updateInvoice((inv) => ({
      ...inv,
      lines: inv.lines.map((l) => (l.id === id ? { ...l, ...patch, confirmed: keepConfirmed ? (patch.confirmed ?? l.confirmed) : false } : l)),
    }));

  const confirmSafeSku = () =>
    updateInvoice((inv) => ({
      ...inv,
      lines: inv.lines.map((l) =>
        !l.confirmed && !l.ignored && l.match.status === "sku_exacto" && (issuesById.get(l.id) ?? []).length === 0
          ? { ...l, confirmed: true }
          : l,
      ),
    }));

  const rematch = () =>
    updateInvoice((inv) => ({
      ...inv,
      lines: inv.lines.map((l) => (l.confirmed || l.ignored ? l : { ...l, match: proposeMatch(l, catalog) })),
    }));

  const addLine = () =>
    updateInvoice((inv) => ({
      ...inv,
      lines: [
        ...inv.lines,
        {
          id: newId("lin"),
          raw: { ...emptyRawLine(), text: "(línea agregada a mano)" },
          description: "",
          code: "",
          quantity: null,
          presentation: "",
          unitsPerPack: "1",
          unitsPerPackSource: "usuario",
          unitPrice: null,
          lineAmount: null,
          discountPercent: null,
          amountSource: "auto",
          match: { catalogItemId: null, status: "sin_coincidencia", candidates: [], note: null },
          confirmed: false,
          ignored: false,
        },
      ],
    }));

  const retry = async () => {
    if (invoice.lines.some((l) => l.confirmed) && !window.confirm("Volver a extraer reemplaza las líneas actuales y tu revisión. ¿Continuar?")) return;
    setBusy("Leyendo la factura con IA… puede tardar hasta un minuto.");
    setError(null);
    try {
      applyState(await withFlush(() => api.retryExtraction(invoice.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const counts = {
    total: invoice.lines.length,
    confirmed: invoice.lines.filter((l) => l.confirmed && !l.ignored).length,
    ignored: invoice.lines.filter((l) => l.ignored).length,
  };
  const pending = counts.total - counts.confirmed - counts.ignored;
  const safeSku = invoice.lines.filter(
    (l) => !l.confirmed && !l.ignored && l.match.status === "sku_exacto" && (issuesById.get(l.id) ?? []).length === 0,
  ).length;

  const visible = invoice.lines.filter((l) =>
    filter === "pendientes" ? !l.confirmed && !l.ignored : filter === "confirmadas" ? l.confirmed && !l.ignored : filter === "ignoradas" ? l.ignored : true,
  );

  const basesDiffer = !!settings.catalogTaxBasis && !!invoice.taxBasis && settings.catalogTaxBasis !== invoice.taxBasis;

  return (
    <section className="step-panel">
      <div className="panel-head">
        <h1>3. Revisión de la factura</h1>
        <p className="lead">
          Compará cada línea con el texto original, corregí lo que haga falta y confirmá el producto del catálogo. Sólo las
          líneas confirmadas se usan para calcular.
        </p>
      </div>

      <ExtractionBanner invoice={invoice} onRetry={retry} canRetry={state.extraction.configured && !!invoice.file && !busy} />
      {busy && <Spinner label={busy} />}
      {error && <Banner tone="error">{error}</Banner>}

      <div className="card">
        <div className="card-head">
          <h2>Datos de la factura</h2>
          {invoice.file && (
            <span className="actions">
              <button type="button" className="btn btn-small" onClick={() => setShowPreview((v) => !v)}>
                {showPreview ? "Ocultar archivo" : "Ver archivo original"}
              </button>
              <a className="btn btn-small btn-ghost" href={api.fileUrl(invoice.id)} target="_blank" rel="noreferrer">
                Abrir en otra pestaña
              </a>
            </span>
          )}
        </div>
        {showPreview && invoice.file && (
          <div className="preview">
            {invoice.file.mimeType === "application/pdf" ? (
              <iframe title="Factura original" src={api.fileUrl(invoice.id)} />
            ) : (
              <img alt="Factura original" src={api.fileUrl(invoice.id)} />
            )}
          </div>
        )}
        <div className="grid grid-3">
          <TextField id="h-supplier" label="Proveedor" value={invoice.supplier} onChange={(v) => setHeader("supplier", v)} />
          <TextField id="h-number" label="Número de factura" value={invoice.invoiceNumber} maxLength={100} onChange={(v) => setHeader("invoiceNumber", v)} />
          <label className="field" htmlFor="h-date">
            <span className="field-label">Fecha</span>
            <input
              id="h-date"
              type="date"
              value={/^\d{4}-\d{2}-\d{2}$/.test(invoice.date) ? invoice.date : ""}
              onChange={(e) => setHeader("date", e.target.value)}
            />
            {invoice.date && !/^\d{4}-\d{2}-\d{2}$/.test(invoice.date) && (
              <span className="field-hint">Texto detectado: “{invoice.date}”</span>
            )}
          </label>
          <label className="field" htmlFor="h-currency">
            <span className="field-label">Moneda de la factura</span>
            <select
              id="h-currency"
              value={invoice.currency ?? ""}
              aria-invalid={!invoice.currency}
              onChange={(e) => setHeader("currency", e.target.value || null)}
            >
              <option value="">— Sin confirmar —</option>
              {[...new Set([...COMMON_CURRENCIES, ...catalog.map((c) => c.currency), ...(invoice.currency ? [invoice.currency] : [])])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {!invoice.currency && <span className="field-error">Confirmá la moneda para poder calcular.</span>}
          </label>
          <label className="field" htmlFor="h-taxbasis">
            <span className="field-label">Los importes de esta factura son…</span>
            <select
              id="h-taxbasis"
              value={invoice.taxBasis ?? ""}
              aria-invalid={!invoice.taxBasis}
              onChange={(e) => setHeader("taxBasis", (e.target.value || null) as TaxBasis | null)}
            >
              <option value="">— Sin confirmar —</option>
              <option value="sin_impuestos">{TAX_BASIS_LABEL.sin_impuestos}</option>
              <option value="con_impuestos">{TAX_BASIS_LABEL.con_impuestos}</option>
            </select>
            {!invoice.taxBasis ? (
              <span className="field-error">Confirmalo para poder calcular.</span>
            ) : settings.catalogTaxBasis ? (
              <span className="field-hint">Catálogo: {TAX_BASIS_LABEL[settings.catalogTaxBasis]}</span>
            ) : (
              <span className="field-error">Falta indicar la base del catálogo (paso 1).</span>
            )}
          </label>
          <NumberField
            id="h-taxrate"
            label="Tasa de impuesto"
            suffix="%"
            value={invoice.taxRatePercent}
            onChange={(v) => setHeader("taxRatePercent", v)}
            hint={basesDiffer ? "Se usa para convertir: la factura y el catálogo tienen bases distintas." : "Sólo se usa si las bases son distintas."}
          />
          <NumberField
            id="h-discount"
            label="Descuento general de la factura"
            suffix="%"
            value={invoice.globalDiscountPercent}
            onChange={(v) => setHeader("globalDiscountPercent", v)}
            hint="Bonificación que se aplica a todas las líneas (dejar vacío si no hay)."
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>
            Líneas <span className="count">{counts.total}</span>
          </h2>
          <span className="muted small">
            {counts.confirmed} confirmadas · {pending} pendientes · {counts.ignored} ignoradas
          </span>
        </div>
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Filtrar líneas">
            {(["todas", "pendientes", "confirmadas", "ignoradas"] as Filter[]).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f[0]!.toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn btn-small" disabled={safeSku === 0} onClick={confirmSafeSku} title="Sólo líneas con SKU exacto y sin datos faltantes">
              Confirmar {safeSku} con SKU exacto
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={rematch}>
              Volver a proponer coincidencias
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={addLine}>
              + Agregar línea
            </button>
          </div>
        </div>

        {invoice.lines.length === 0 ? (
          <Empty title="Esta factura no tiene líneas">
            {invoice.extraction.status === "pendiente_sin_clave" || invoice.extraction.status === "manual"
              ? "Agregá las líneas a mano con «+ Agregar línea»."
              : "Podés agregarlas a mano con «+ Agregar línea»."}
          </Empty>
        ) : visible.length === 0 ? (
          <Empty title="No hay líneas en este filtro" />
        ) : (
          <div className="lines">
            {visible.map((l) => (
              <LineCard
                key={l.id}
                index={invoice.lines.indexOf(l) + 1}
                line={l}
                catalog={catalog}
                issues={issuesById.get(l.id) ?? []}
                currency={invoice.currency}
                settings={settings}
                setLine={setLine}
                remove={() =>
                  window.confirm("¿Eliminar esta línea?") &&
                  updateInvoice((inv) => ({ ...inv, lines: inv.lines.filter((x) => x.id !== l.id) }))
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="next-row">
        <button type="button" className="btn btn-ghost" onClick={() => goTo("factura")}>
          ← Factura
        </button>
        <button type="button" className="btn btn-primary" onClick={() => goTo("margenes")}>
          Siguiente: ver márgenes →
        </button>
      </div>
    </section>
  );
}

function ExtractionBanner({ invoice, onRetry, canRetry }: { invoice: Invoice; onRetry: () => void; canRetry: boolean }) {
  const ex = invoice.extraction;
  const warnings = ex.warnings.length > 0 && (
    <details className="details">
      <summary>Observaciones de la extracción ({ex.warnings.length})</summary>
      <ul className="compact-list">
        {ex.warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
  switch (ex.status) {
    case "ejemplo":
      return (
        <Banner tone="demo" title="EJEMPLO — datos ficticios">
          {ex.message} Sirve para probar el recorrido completo.
          {warnings}
        </Banner>
      );
    case "completada":
      return (
        <Banner tone="info" title={`Datos extraídos con IA (${ex.model ?? ex.provider})`}>
          Revisá cada línea contra el texto original: la extracción automática puede equivocarse.
          {warnings}
        </Banner>
      );
    case "pendiente_sin_clave":
      return (
        <Banner tone="warn" title="Extracción real pendiente: esta factura NO fue procesada">
          {ex.message} El archivo quedó guardado. Cuando configures la clave, reiniciá la app y usá «Volver a extraer».
          {canRetry && (
            <div className="actions"><button type="button" className="btn btn-small" onClick={onRetry}>Volver a extraer</button></div>
          )}
        </Banner>
      );
    case "error":
      return (
        <Banner tone="error" title="La extracción falló">
          {ex.message}
          {canRetry && (
            <div className="actions"><button type="button" className="btn btn-small" onClick={onRetry}>Reintentar</button></div>
          )}
        </Banner>
      );
    default:
      return invoice.source === "manual" ? (
        <Banner tone="info" title="Carga manual">Completá los datos y agregá las líneas de la factura.</Banner>
      ) : null;
  }
}

function LineCard(props: {
  index: number;
  line: InvoiceLine;
  catalog: CatalogItem[];
  issues: string[];
  currency: string | null;
  settings: Settings;
  setLine: (id: string, patch: Partial<InvoiceLine>, keepConfirmed?: boolean) => void;
  remove: () => void;
}) {
  const { line: l, catalog, issues, setLine } = props;
  const item = catalog.find((i) => i.id === l.match.catalogItemId);
  const pack = detectPackaging(l.presentation, l.description);
  const candidateIds = new Set(l.match.candidates.map((c) => c.catalogItemId));
  const status = l.ignored ? "ignorada" : l.confirmed ? "confirmada" : issues.length > 0 ? "incompleta" : "lista";
  const statusText = { ignorada: "Ignorada", confirmada: "Confirmada", incompleta: "Falta información", lista: "Lista para confirmar" }[status];
  const set = (patch: Partial<InvoiceLine>) => setLine(l.id, patch);
  const ml = MATCH_LABEL[l.match.status];
  const raw = l.raw;
  const rawFields: [string, string | null][] = [
    ["Código", raw.code],
    ["Cantidad", raw.quantity],
    ["Presentación", raw.presentation],
    ["Precio unit.", raw.unitPrice],
    ["Importe", raw.amount],
    ["Desc.", raw.discount],
  ];

  return (
    <article className={`line-card line-${status}`} aria-label={`Línea ${props.index}`}>
      <header className="line-head">
        <span className="line-num">#{props.index}</span>
        <strong className="line-title">{l.description || "(sin descripción)"}</strong>
        <span className={`pill pill-${status}`}>{statusText}</span>
      </header>

      <div className="raw">
        <span className="raw-label">Texto original de la factura</span>
        <code className="raw-text">{raw.text || raw.description || "—"}</code>
        {rawFields.some(([, v]) => v) && (
          <span className="raw-fields">
            {rawFields.filter(([, v]) => v).map(([k, v]) => (
              <span key={k}>{k}: <b>{v}</b></span>
            ))}
          </span>
        )}
      </div>

      {!l.ignored && (
        <>
          <div className="grid grid-4">
            <label className="field field-wide" htmlFor={`d-${l.id}`}>
              <span className="field-label">Descripción</span>
              <input id={`d-${l.id}`} value={l.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
            </label>
            <label className="field" htmlFor={`c-${l.id}`}>
              <span className="field-label">Código / SKU</span>
              <input id={`c-${l.id}`} value={l.code} maxLength={120} onChange={(e) => set({ code: e.target.value })} />
            </label>
            <NumberField id={`q-${l.id}`} label="Cantidad comprada" value={l.quantity} onChange={(v) => set({ quantity: v })} />
            <label className="field" htmlFor={`p-${l.id}`}>
              <span className="field-label">Presentación</span>
              <input
                id={`p-${l.id}`}
                value={l.presentation}
                maxLength={200}
                placeholder="Ej.: Caja x 12, Unidad"
                onChange={(e) => {
                  const det = detectPackaging(e.target.value, l.description);
                  set({
                    presentation: e.target.value,
                    ...(l.unitsPerPackSource !== "usuario"
                      ? { unitsPerPack: det.unitsPerPack, unitsPerPackSource: det.unitsPerPack === null ? null : det.kind === "pack" ? "detectado" : "unidad" }
                      : {}),
                  });
                }}
              />
            </label>
            <NumberField
              id={`u-${l.id}`}
              label="Unidades por presentación"
              value={l.unitsPerPack}
              onChange={(v) => set({ unitsPerPack: v, unitsPerPackSource: "usuario" })}
              hint={
                l.unitsPerPackSource === "usuario" ? "Indicado por vos." : <span className={pack.needsConfirmation ? "text-warn" : ""}>{pack.message}</span>
              }
            />
            <NumberField id={`up-${l.id}`} label="Precio por presentación" value={l.unitPrice} onChange={(v) => set({ unitPrice: v })} hint={props.currency ?? undefined} />
            <NumberField id={`a-${l.id}`} label="Importe de la línea" value={l.lineAmount} onChange={(v) => set({ lineAmount: v })} hint={props.currency ?? undefined} />
            <NumberField id={`ds-${l.id}`} label="Descuento de la línea" suffix="%" value={l.discountPercent} onChange={(v) => set({ discountPercent: v })} />
            <label className="field" htmlFor={`as-${l.id}`}>
              <span className="field-label">Calcular con</span>
              <select id={`as-${l.id}`} value={l.amountSource} onChange={(e) => set({ amountSource: e.target.value as AmountSource })}>
                <option value="auto">Automático (verifica que coincidan)</option>
                <option value="importe">El importe de la línea</option>
                <option value="precio_unitario">Precio × cantidad − descuento</option>
              </select>
            </label>
          </div>

          <div className="match-box">
            <label className="field field-wide" htmlFor={`m-${l.id}`}>
              <span className="field-label">
                Producto del catálogo <span className={`tag tag-${ml.tone}`}>{ml.text}</span>
              </span>
              <select
                id={`m-${l.id}`}
                value={l.match.catalogItemId ?? ""}
                onChange={(e) =>
                  set({ match: { ...l.match, catalogItemId: e.target.value || null, status: e.target.value ? "manual" : "sin_coincidencia" } })
                }
              >
                <option value="">— Sin asignar —</option>
                {l.match.candidates.length > 0 && (
                  <optgroup label="Sugeridos">
                    {l.match.candidates.map((c) => {
                      const it = catalog.find((i) => i.id === c.catalogItemId);
                      return it ? (
                        <option key={c.catalogItemId} value={c.catalogItemId}>
                          {itemLabel(it)} · {it.sku || "sin SKU"} ({c.reason})
                        </option>
                      ) : null;
                    })}
                  </optgroup>
                )}
                <optgroup label="Todos los productos">
                  {catalog
                    .filter((i) => !candidateIds.has(i.id))
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {itemLabel(i)} · {i.sku || "sin SKU"}
                      </option>
                    ))}
                </optgroup>
              </select>
              {l.match.note && <span className="field-hint">{l.match.note}</span>}
            </label>
            {item && (
              <div className="item-summary">
                <span>SKU <code>{item.sku || "—"}</code></span>
                <span>Costo actual <b>{formatMoney(item.unitCost, item.currency)}</b></span>
                <span>Precio <b>{formatMoney(item.price, item.currency)}</b></span>
              </div>
            )}
          </div>

          {issues.length > 0 && (
            <ul className="issues" aria-label="Motivos de bloqueo">
              {issues.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <footer className="line-actions">
        {!l.ignored && !l.confirmed && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={issues.length > 0}
            title={issues.length > 0 ? "Completá los datos marcados antes de confirmar" : undefined}
            onClick={() => setLine(l.id, { confirmed: true }, true)}
          >
            Confirmar línea
          </button>
        )}
        {l.confirmed && !l.ignored && (
          <button type="button" className="btn btn-small" onClick={() => setLine(l.id, { confirmed: false }, true)}>
            Volver a editar
          </button>
        )}
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setLine(l.id, { ignored: !l.ignored, confirmed: false }, true)}>
          {l.ignored ? "Incluir de nuevo" : "Ignorar (flete, no está en el catálogo…)"}
        </button>
        <button type="button" className="btn btn-small btn-danger-ghost" onClick={props.remove}>
          Eliminar
        </button>
      </footer>
    </article>
  );
}
