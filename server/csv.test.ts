import { describe, expect, it } from "vitest";
import { launchCsvHash, parseLaunchCsv } from "./csv";

describe("launch CSV import", () => {
  it("parses Brazilian currency, categories and payment status", () => {
    const rows = parseLaunchCsv("tipo,nome,valor,data,categoria,status\nconta,Aluguel,1.200,2026-10-10,moradia,pending\nentrada,Salário,3800,2026-10-05,renda,paid");
    expect(rows).toEqual([
      { type: "conta", name: "Aluguel", amount: 1200, dueDate: "2026-10-10", category: "moradia", status: "pending" },
      { type: "entrada", name: "Salário", amount: 3800, dueDate: "2026-10-05", category: "renda", status: "paid" },
    ]);
  });

  it("rejects files without the required columns", () => {
    expect(() => parseLaunchCsv("nome,valor\nAluguel,1200")).toThrow("colunas tipo, nome, valor e data");
  });

  it("creates a deterministic hash after normalizing BOM and line endings", () => {
    const unix = "tipo,nome,valor,data\nconta,Água,123.45,2026-10-10\n";
    const windows = `\uFEFF${unix.replace(/\n/g, "\r\n")}`;
    expect(launchCsvHash(unix)).toBe(launchCsvHash(windows));
    expect(launchCsvHash(unix)).toMatch(/^[a-f0-9]{64}$/);
    expect(launchCsvHash(unix.replace("Água", "Luz"))).not.toBe(launchCsvHash(unix));
  });

  it("rejects imported money with more than two decimal places", () => {
    expect(() => parseLaunchCsv('tipo,nome,valor,data\nconta,Água,"10,999",2026-10-10')).toThrow("duas casas decimais");
  });
});
