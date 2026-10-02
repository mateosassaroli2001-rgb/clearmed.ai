import { parseTargetMargin, type ProposalRow } from "../../core/margins";
import { Dec, formatMoney, formatPercent } from "../../core/numbers";
import type { Invoice, ProposalOverride, Settings } from "../../core/types";
import type { AppState } from "../api";
import type { StepId } from "../App";
import { Banner, Empty, NumberField } from "../ui";

type Props = {
  state: AppState;
  goTo: (s: StepId) => void;
  invoice: Invoice;
  rows: ProposalRow[];
  updateInvoice: (fn: (inv: Invoice) => Invoice) => void;
  saveSettings: (s: Settings) => Promise<void>;
};

export function MarginsStep({ state, goTo, invoice, rows, updateInvoice, saveSettings }: Props) {
  const target = parseTargetMargin(state.settings.targetMarginPercent);
  const pendingLines = invoice.lines.filter((l) => !l.ignored && !l.confirmed).length;
  const unmatchedConfirmed = invoice.lines.filter((l) => !l.ignored && l.confirmed && !l.match.catalogItemId).length;
  const okRows = rows.filter((r) => r.status === "ok");
  const blocked = rows.filter((r) => r.status === "bloqueado");

  const setOverride = (itemId: string, patch: Partial<ProposalOverride>) =>
    updateInvoice((inv) => {
      const current = inv.proposals[itemId] ?? { approved: false, finalPrice: null, targetMarginPercent: null };
      return { ...inv, proposals: { ...inv.proposals, [itemId]: { ...current, ...patch } } };
    });

  const approveAll = (value: boolean) =>
    updateInvoice((inv) => {
      const proposals = { ...inv.proposals };
      for (const r of okRows) {
        if (r.finalPriceError || !r.finalPrice) continue;
        proposals[r.item.id] = { ...(proposals[r.item.id] ?? { finalPrice: null, targetMarginPercent: null }), approved: value };
      }
      return { ...inv, proposals };
    });

  return (
    <section className="step-panel">
      <div className="panel-head">
        <h1>4. Costos y márgenes</h1>
        <p className="lead">Cómo cambian tus costos con esta factura y qué precio mantendría el margen que buscás.</p>
      </div>

      <Banner tone="info" title="Margen bruto estimado">
        No incluye envío, comisiones de venta o de pago, ni otros gastos. Sirve para comparar, no es tu ganancia final.
      </Banner>

      <div className="card">
        <div className="grid grid-2 align-end">
          <NumberField
            id="target"
            label="Margen bruto objetivo"
            suffix="%"
            value={state.settings.targetMarginPercent}
            onChange={(v) => void saveSettings({ ...state.settings, targetMarginPercent: v ?? "" })}
            hint={target.ok ? "Se aplica a todos los productos (podés cambiarlo por producto)." : undefined}
          />
          <details className="details explainer">
            <summary>¿Margen o recargo? No son lo mismo</summary>
            <p>
              <b>Margen bruto</b> = (precio − costo) ÷ precio. <b>Recargo</b> = (precio − costo) ÷ costo.
            </p>
            <p>
              Ejemplo: costo $100 y precio $150 → recargo 50 %, pero margen 33,3 %. Para tener 35 % de margen sobre un costo de
              $100, el precio es 100 ÷ (1 − 0,35) = <b>$153,85</b>.
            </p>
          </details>
        </div>
        {!target.ok && <Banner tone="error">{target.error}</Banner>}
      </div>

      {(pendingLines > 0 || unmatchedConfirmed > 0) && (
        <Banner tone="warn" title={`Hay ${pendingLines} línea(s) sin confirmar`}>
          Las líneas sin confirmar no se usan en el cálculo.{" "}
          <button type="button" className="link" onClick={() => goTo("revision")}>Ir a revisión</button>
        </Banner>
      )}

      <div className="card">
        <div className="card-head">
          <h2>
            Productos de esta factura <span className="count">{rows.length}</span>
          </h2>
          {okRows.length > 0 && (
            <span className="actions">
              <button type="button" className="btn btn-small" onClick={() => approveAll(true)}>Aprobar todas</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => approveAll(false)}>Quitar aprobación</button>
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <Empty title="Todavía no hay productos para calcular">
            Confirmá al menos una línea con un producto del catálogo en el paso de revisión.
            <div className="actions center">
              <button type="button" className="btn btn-primary" onClick={() => goTo("revision")}>Ir a revisión</button>
            </div>
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table table-stack margins-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Costo unitario<br /><span className="th-sub">anterior → nuevo</span></th>
                  <th className="num">Precio actual</th>
                  <th className="num">Margen bruto est.<br /><span className="th-sub">anterior → nuevo</span></th>
                  <th className="num">Margen objetivo</th>
                  <th className="num">Precio sugerido</th>
                  <th className="num">Precio propuesto</th>
                  <th>Aprobar</th>
                </tr>
              </thead>
              <tbody>
                {[...okRows, ...blocked].map((r) => (
                  <Row key={r.item.id} row={r} globalTarget={state.settings.targetMarginPercent} invoice={invoice} setOverride={setOverride} goTo={goTo} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="next-row">
        <button type="button" className="btn btn-ghost" onClick={() => goTo("revision")}>← Revisión</button>
        <button type="button" className="btn btn-primary" onClick={() => goTo("exportacion")}>
          Siguiente: exportar →
        </button>
      </div>
    </section>
  );
}

function Row(props: {
  row: ProposalRow;
  globalTarget: string;
  invoice: Invoice;
  setOverride: (id: string, p: Partial<ProposalOverride>) => void;
  goTo: (s: StepId) => void;
}) {
  const { row: r, setOverride } = props;
  const cur = r.item.currency;
  const override = props.invoice.proposals[r.item.id];
  const product = (
    <td data-label="Producto" className="product-cell">
      <strong>{r.item.name}</strong>
      {r.item.variant && <span className="muted"> — {r.item.variant}</span>}
      <span className="muted small block">
        SKU {r.item.sku || "—"} · {r.lineIds.length} línea(s)
      </span>
    </td>
  );

  if (r.status === "bloqueado") {
    return (
      <tr className="row-blocked">
        {product}
        <td colSpan={7} data-label="Bloqueado">
          <span className="pill pill-incompleta">Cálculo bloqueado</span>
          <ul className="issues">
            {r.reasons.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <button type="button" className="link" onClick={() => props.goTo("revision")}>Corregir en revisión</button>
        </td>
      </tr>
    );
  }

  const up = r.costChange?.gt(0);
  const down = r.costChange?.lt(0);
  const targetFraction = new Dec(r.targetPercent || "0").div(100);
  const belowTarget = r.newMargin && !r.targetError ? r.newMargin.lt(targetFraction) : false;

  return (
    <tr className={r.approved ? "row-approved" : ""}>
      {product}
      <td data-label="Costo anterior → nuevo" className="num">
        <span className="cell-value">
        <span className="muted">{formatMoney(r.oldCost, cur)} →</span>{" "}
        <b>{formatMoney(r.newCost, cur)}</b>
        {r.notes.length > 0 && (
          <span className="info-dot" title={r.notes.join("\n")} aria-label={r.notes.join(" ")}>ⓘ</span>
        )}
        <span className={`block small ${up ? "text-bad" : down ? "text-good" : "muted"}`}>
          {r.costChangeFraction ? `${up ? "▲ +" : down ? "▼ " : ""}${formatPercent(r.costChangeFraction)}` : "sin variación calculable"}
        </span>
        </span>
      </td>
      <td data-label="Precio actual" className="num">{formatMoney(r.price, cur)}</td>
      <td data-label="Margen anterior → nuevo" className="num">
        <span className="cell-value">
        <span className="muted">{formatPercent(r.oldMargin)} →</span>{" "}
        <b className={belowTarget ? "text-bad" : ""}>{formatPercent(r.newMargin)}</b>
        {belowTarget && <span className="block small text-bad">debajo del objetivo</span>}
        </span>
      </td>
      <td data-label="Margen objetivo" className="num">
        <NumberField
          id={`t-${r.item.id}`}
          label="Margen objetivo"
          compact
          suffix="%"
          placeholder={props.globalTarget}
          value={override?.targetMarginPercent ?? null}
          onChange={(v) => setOverride(r.item.id, { targetMarginPercent: v })}
        />
        {r.targetError && <span className="field-error">{r.targetError}</span>}
      </td>
      <td data-label="Precio sugerido" className="num">
        <b>{formatMoney(r.suggested, cur)}</b>
      </td>
      <td data-label="Precio propuesto" className="num">
        <NumberField
          id={`fp-${r.item.id}`}
          label="Precio propuesto"
          compact
          className="field-price"
          placeholder={r.suggested ? r.suggested.toFixed(2) : ""}
          value={override?.finalPrice ?? null}
          onChange={(v) => setOverride(r.item.id, { finalPrice: v })}
          hint={r.finalMargin ? `Margen: ${formatPercent(r.finalMargin)}` : undefined}
        />
        {r.finalPriceError && <span className="field-error">{r.finalPriceError}</span>}
      </td>
      <td data-label="Aprobar">
        <label className="check">
          <input
            type="checkbox"
            checked={r.approved}
            disabled={!!r.finalPriceError || !r.finalPrice}
            onChange={(e) => setOverride(r.item.id, { approved: e.target.checked })}
          />
          <span>{r.approved ? "Aprobada" : "Aprobar"}</span>
        </label>
      </td>
    </tr>
  );
}
