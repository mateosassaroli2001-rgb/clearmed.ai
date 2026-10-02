import { describe, expect, it } from "vitest";
import { buildProposalsCsv } from "../src/core/export";
import { computeProposals } from "../src/core/margins";
import { invoice, item, line, settings } from "./helpers";

describe("exportación CSV", () => {
  it("incluye sólo propuestas aprobadas y neutraliza fórmulas", () => {
    const p1 = item({ id: "p1", name: "=HYPERLINK(\"x\")" });
    const p2 = item({ id: "p2", sku: "SKU-2" });
    const l1 = line({ id: "a" });
    const l2 = line({ id: "b", match: { catalogItemId: "p2", status: "sku_exacto", candidates: [], note: null } });
    const inv = invoice([l1, l2], { proposals: { p1: { approved: true, finalPrice: null, targetMarginPercent: null } } });
    const csv = buildProposalsCsv(computeProposals(inv, [p1, p2], settings), inv, settings);
    const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("'=HYPERLINK");
    expect(rows[1]).toContain("184.62"); // 120 / 0,65 redondeado hacia arriba
    expect(rows[1]).toContain("No es un archivo de importación de Shopify");
  });
});
