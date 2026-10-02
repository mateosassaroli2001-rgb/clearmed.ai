import { useState } from "react";
import type { ProposalRow } from "../../core/margins";
import { formatMoney, formatPercent } from "../../core/numbers";
import type { Invoice } from "../../core/types";
import { api, type AppState } from "../api";
import type { StepId } from "../App";
import { Banner, Empty } from "../ui";

type Props = {
  state: AppState;
  goTo: (s: StepId) => void;
  invoice: Invoice;
  rows: ProposalRow[];
  withFlush: <T>(fn: () => Promise<T>) => Promise<T>;
};

export function ExportStep({ goTo, invoice, rows, withFlush }: Props) {
  const approved = rows.filter((r) => r.approved);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setError(null);
    setDownloading(true);
    try {
      // Se guardan primero los últimos cambios para que el archivo refleje lo que ves.
      await withFlush(async () => undefined);
      const res = await fetch(api.exportUrl(invoice.id));
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "marginwatch-propuestas.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="step-panel">
      <div className="panel-head">
        <h1>5. Exportación para revisión</h1>
        <p className="lead">Descargá un CSV con las propuestas aprobadas para revisarlas con calma o compartirlas.</p>
      </div>

      <Banner tone="warn" title="Este archivo NO es para importar en Shopify">
        Es una planilla de revisión. Todavía no verificamos el formato oficial de importación de Shopify, así que no lo subas a tu
        tienda. MarginWatch no cambió ningún precio ni costo real.
      </Banner>

      <div className="card">
        <div className="card-head">
          <h2>
            Propuestas aprobadas <span className="count">{approved.length}</span>
          </h2>
        </div>
        {approved.length === 0 ? (
          <Empty title="No hay propuestas aprobadas">
            Aprobá al menos un producto en el paso de márgenes.
            <div className="actions center">
              <button type="button" className="btn btn-primary" onClick={() => goTo("margenes")}>Ir a márgenes</button>
            </div>
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Costo nuevo</th>
                    <th className="num">Precio actual</th>
                    <th className="num">Precio propuesto</th>
                    <th className="num">Margen bruto estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map((r) => (
                    <tr key={r.item.id}>
                      <td data-label="Producto">
                        {r.item.name}
                        {r.item.variant && <span className="muted"> — {r.item.variant}</span>}
                      </td>
                      <td data-label="Costo nuevo" className="num">{formatMoney(r.newCost, r.item.currency)}</td>
                      <td data-label="Precio actual" className="num">{formatMoney(r.price, r.item.currency)}</td>
                      <td data-label="Precio propuesto" className="num"><b>{formatMoney(r.finalPrice, r.item.currency)}</b></td>
                      <td data-label="Margen" className="num">{formatPercent(r.finalMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void download()}>
                {downloading ? "Preparando…" : "Descargar CSV para revisión"}
              </button>
            </div>
            {error && <Banner tone="error" title="No se pudo exportar">{error}</Banner>}
            <p className="muted small">
              El archivo incluye costo anterior y nuevo, variación, márgenes, precio sugerido y propuesto, proveedor y número de
              factura. Se abre con Excel o Google Sheets.
            </p>
          </>
        )}
      </div>

      <div className="next-row">
        <button type="button" className="btn btn-ghost" onClick={() => goTo("margenes")}>← Márgenes</button>
        <button type="button" className="btn btn-ghost" onClick={() => goTo("factura")}>Cargar otra factura</button>
      </div>
    </section>
  );
}
