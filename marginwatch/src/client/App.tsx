import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeProposals } from "../core/margins";
import type { Invoice, Settings } from "../core/types";
import { api, type AppState } from "./api";
import { CatalogStep } from "./steps/CatalogStep";
import { ExportStep } from "./steps/ExportStep";
import { InvoiceStep } from "./steps/InvoiceStep";
import { MarginsStep } from "./steps/MarginsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { Banner, Spinner } from "./ui";

export type StepId = "catalogo" | "factura" | "revision" | "margenes" | "exportacion";

const STEPS: { id: StepId; label: string }[] = [
  { id: "catalogo", label: "Catálogo" },
  { id: "factura", label: "Factura" },
  { id: "revision", label: "Revisión" },
  { id: "margenes", label: "Márgenes" },
  { id: "exportacion", label: "Exportación" },
];

type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<StepId>("catalogo");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingInvoice = useRef<Invoice | null>(null);

  const applyState = useCallback((s: AppState) => {
    setState(s);
    setInvoice(s.currentInvoice);
  }, []);

  useEffect(() => {
    api
      .state()
      .then((s) => {
        applyState(s);
        // Retomar donde se dejó
        if (s.currentInvoice) setStep("revision");
        else if (s.catalog) setStep("factura");
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [applyState]);

  const flushSave = useCallback(async () => {
    const inv = pendingInvoice.current;
    if (!inv) return;
    pendingInvoice.current = null;
    setSaveStatus("saving");
    try {
      const { supplier, invoiceNumber, date, currency, taxBasis, taxRatePercent, globalDiscountPercent, lines, proposals } = inv;
      await api.saveInvoice(inv.id, { supplier, invoiceNumber, date, currency, taxBasis, taxRatePercent, globalDiscountPercent, lines, proposals });
      setSaveStatus(pendingInvoice.current ? "pending" : "saved");
      setSaveError(null);
    } catch (e) {
      setSaveStatus("error");
      setSaveError((e as Error).message);
    }
  }, []);

  /** Modifica la factura actual y la guarda automáticamente (con una pequeña demora). */
  const updateInvoice = useCallback(
    (fn: (inv: Invoice) => Invoice) => {
      setInvoice((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        pendingInvoice.current = next;
        return next;
      });
      setSaveStatus("pending");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flushSave(), 500);
    },
    [flushSave],
  );

  // Guardar antes de cambiar de factura o recargar desde el servidor
  const withFlush = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      await flushSave();
      return fn();
    },
    [flushSave],
  );

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingInvoice.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const saveSettings = useCallback(
    async (s: Settings) => {
      setState((prev) => (prev ? { ...prev, settings: s } : prev));
      try {
        const next = await api.saveSettings(s);
        setState((prev) => (prev ? { ...prev, settings: next.settings } : prev));
      } catch (e) {
        setSaveError((e as Error).message);
        setSaveStatus("error");
      }
    },
    [],
  );

  const proposals = useMemo(
    () => (invoice && state ? computeProposals(invoice, state.catalog?.items ?? [], state.settings) : []),
    [invoice, state],
  );

  if (loadError) {
    return (
      <Shell>
        <Banner tone="error" title="No se pudo cargar MarginWatch">
          {loadError}
        </Banner>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell>
        <Spinner label="Cargando tus datos…" />
      </Shell>
    );
  }

  const hasCatalog = (state.catalog?.items.length ?? 0) > 0;
  const enabled: Record<StepId, boolean> = {
    catalogo: true,
    factura: hasCatalog,
    revision: hasCatalog && !!invoice,
    margenes: hasCatalog && !!invoice,
    exportacion: hasCatalog && !!invoice,
  };
  const pendingLines = invoice ? invoice.lines.filter((l) => !l.confirmed && !l.ignored).length : 0;
  const approved = proposals.filter((p) => p.approved).length;
  const badge: Partial<Record<StepId, string>> = {
    catalogo: hasCatalog ? `${state.catalog!.items.length}` : undefined,
    revision: invoice && invoice.lines.length > 0 ? (pendingLines > 0 ? `${pendingLines} pend.` : "✓") : undefined,
    exportacion: approved > 0 ? `${approved}` : undefined,
  };

  const common = { state, applyState, goTo: setStep };

  return (
    <Shell
      saveStatus={saveStatus}
      saveError={saveError}
      nav={
        <nav className="stepper" aria-label="Pasos">
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`step ${step === s.id ? "step-active" : ""}`}
                  disabled={!enabled[s.id]}
                  aria-current={step === s.id ? "step" : undefined}
                  onClick={() => setStep(s.id)}
                >
                  <span className="step-num">{i + 1}</span>
                  <span className="step-label">{s.label}</span>
                  {badge[s.id] && <span className="step-badge">{badge[s.id]}</span>}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      }
    >
      {step === "catalogo" && <CatalogStep {...common} saveSettings={saveSettings} withFlush={withFlush} />}
      {step === "factura" && <InvoiceStep {...common} withFlush={withFlush} />}
      {step === "revision" && invoice && <ReviewStep {...common} invoice={invoice} updateInvoice={updateInvoice} withFlush={withFlush} />}
      {step === "margenes" && invoice && (
        <MarginsStep {...common} invoice={invoice} rows={proposals} updateInvoice={updateInvoice} saveSettings={saveSettings} />
      )}
      {step === "exportacion" && invoice && <ExportStep {...common} invoice={invoice} rows={proposals} withFlush={withFlush} />}
    </Shell>
  );
}

function Shell(props: { children: React.ReactNode; nav?: React.ReactNode; saveStatus?: SaveStatus; saveError?: string | null }) {
  const label: Record<SaveStatus, string> = {
    idle: "",
    pending: "Cambios sin guardar…",
    saving: "Guardando…",
    saved: "Guardado",
    error: "Error al guardar",
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect width="32" height="32" rx="7" fill="currentColor" />
              <path d="M7 22l6-7 5 4 7-9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            <strong>MarginWatch</strong>
            <small>Costos y márgenes desde tus facturas</small>
          </span>
        </div>
        {props.saveStatus && props.saveStatus !== "idle" && (
          <span className={`save-status save-${props.saveStatus}`} title={props.saveError ?? undefined}>
            {label[props.saveStatus]}
          </span>
        )}
      </header>
      {props.nav}
      <main className="content">
        {props.saveStatus === "error" && props.saveError && (
          <Banner tone="error" title="No se pudieron guardar los últimos cambios">
            {props.saveError}
          </Banner>
        )}
        {props.children}
      </main>
      <footer className="footer">
        Versión local de prueba · No se conecta a ninguna tienda: no cambia precios ni costos reales.
      </footer>
    </div>
  );
}
