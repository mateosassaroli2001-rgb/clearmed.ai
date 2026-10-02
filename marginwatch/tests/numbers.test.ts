import { describe, expect, it } from "vitest";
import { formatMoney, parseDecimalInput } from "../src/core/numbers";

const ok = (s: string) => {
  const r = parseDecimalInput(s);
  return r.ok ? r.value : `ERROR`;
};

describe("lectura de números", () => {
  it.each([
    ["1234.56", "1234.56"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["12,5", "12.5"],
    ["$ 28.000,00", "28000"],
    ["1.234.567", "1234567"],
    ["0,500", "0.5"],
    ["-15", "-15"],
    ["(15)", "-15"],
    ["ARS 4.200", "ERROR"],
  ])("'%s' → %s", (input, expected) => {
    expect(ok(input)).toBe(expected);
  });

  it("rechaza formatos ambiguos en vez de adivinar", () => {
    expect(parseDecimalInput("1.500").ok).toBe(false);
    expect(parseDecimalInput("2,000").ok).toBe(false);
  });

  it("rechaza texto inválido", () => {
    expect(parseDecimalInput("doce").ok).toBe(false);
    expect(parseDecimalInput("1,2,3.4.5").ok).toBe(false);
    expect(parseDecimalInput("").ok).toBe(false);
  });

  it("formatea dinero en estilo local", () => {
    expect(formatMoney("4307.7", "ARS")).toBe("ARS 4.307,70");
  });
});
