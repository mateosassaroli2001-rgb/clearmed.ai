import { describe, expect, it } from "vitest";
import { detectPackaging } from "../src/core/packaging";

describe("detección de cajas, paquetes y unidades", () => {
  it.each([
    ["Caja x 12", 12],
    ["Caja x 10 u", 10],
    ["Pack de 6", 6],
    ["pack x6", 6],
    ["Bulto 24 unidades", 24],
    ["6-pack", 6],
    ["12 u. por caja", 12],
    ["x 24 un", 24],
    ["Docena", 12],
    ["Media docena", 6],
    ["Caja c/12", 12],
  ])("'%s' → %i unidades", (text, units) => {
    const d = detectPackaging(text, "");
    expect(d.kind).toBe("pack");
    expect(d.unitsPerPack).toBe(String(units));
    expect(d.needsConfirmation).toBe(false);
  });

  it("no confunde el contenido (500 ml) con la cantidad de unidades", () => {
    const d = detectPackaging(null, "Shampoo x 500 ml");
    expect(d.kind).toBe("unidad");
    expect(d.unitsPerPack).toBe("1");
  });

  it("caja x 12 de botellas de 500 ml → 12", () => {
    expect(detectPackaging("Caja x 12", "Agua mineral 500 ml").unitsPerPack).toBe("12");
  });

  it("caja sin cantidad → pide confirmación y no asume 1", () => {
    const d = detectPackaging("Caja", "Bombilla acero inox");
    expect(d.kind).toBe("desconocido");
    expect(d.unitsPerPack).toBeNull();
    expect(d.needsConfirmation).toBe(true);
  });

  it("cantidades contradictorias → pide confirmación", () => {
    const d = detectPackaging("Caja x 12", "Galletitas pack x 6");
    expect(d.unitsPerPack).toBeNull();
    expect(d.needsConfirmation).toBe(true);
  });

  it("'Unidad' explícita → 1", () => {
    const d = detectPackaging("Unidad", "Termo de acero 1 L");
    expect(d.kind).toBe("unidad");
    expect(d.unitsPerPack).toBe("1");
  });

  it("sin datos → unidad, con aviso para verificar", () => {
    const d = detectPackaging(null, "Termo de acero");
    expect(d.unitsPerPack).toBe("1");
    expect(d.message).toMatch(/Verificalo/);
  });
});
