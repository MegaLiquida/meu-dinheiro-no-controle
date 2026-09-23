import { describe, expect, it } from "vitest";
import { parseLaunchCsv } from "./csv";

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
});
