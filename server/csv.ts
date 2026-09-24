import { createHash } from "node:crypto";
import { moneyToCents } from "./domain";

export type CsvLaunchRow = { type: "entrada" | "conta" | "parcela"; name: string; amount: number; dueDate: string; category: string | null; status: "pending" | "paid" };

export function launchCsvHash(csv: string) {
  const canonical = csv.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function parseLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += character;
  }
  values.push(value.trim());
  return values;
}

export function parseLaunchCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vazio ou sem linhas de lançamento.");
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
  const required = ["tipo", "nome", "valor", "data"];
  if (required.some((header) => !headers.includes(header))) throw new Error("O CSV precisa das colunas tipo, nome, valor e data.");
  const index = (header: string) => headers.indexOf(header);
  if (lines.length > 501) throw new Error("Importe no máximo 500 lançamentos por vez.");
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseLine(line);
    const rawAmount = (values[index("valor")] ?? "").replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".");
    const type = values[index("tipo")] as CsvLaunchRow["type"];
    const amount = Number(rawAmount);
    const dueDate = values[index("data")] ?? "";
    const status = ((values[index("status")] ?? "pending").toLowerCase() === "paid" ? "paid" : "pending") as CsvLaunchRow["status"];
    try { moneyToCents(amount); } catch { throw new Error(`Linha ${rowIndex + 2} inválida. O valor deve ter no máximo duas casas decimais e estar no limite permitido.`); }
    if (!["entrada", "conta", "parcela"].includes(type) || !values[index("nome")] || amount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error(`Linha ${rowIndex + 2} inválida. Use tipo, nome, valor e data no formato AAAA-MM-DD.`);
    return { type, name: values[index("nome")], amount, dueDate, category: index("categoria") >= 0 ? values[index("categoria")] || null : null, status };
  });
}
