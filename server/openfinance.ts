import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type OpenFinanceProvider = "pluggy" | "belvo" | "android_notification";
export type TransactionDirection = "inflow" | "outflow";
export type ImportedTransactionState = "pending" | "accepted" | "ignored" | "reversed";

export type ProviderTransactionInput = {
  externalTransactionId: string;
  externalAccountId?: string | null;
  direction: TransactionDirection;
  amountCents: number;
  transactionDate: string;
  description: string;
  merchantName?: string | null;
  category?: string | null;
  providerStatus?: string | null;
};

export type IngestResult = {
  connectionId: string;
  created: number;
  updated: number;
  transactionIds: string[];
};

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data de transação inválida.");
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data de transação inválida.");
}

function normalizeText(value: string, max: number, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return (normalized || fallback).slice(0, max);
}

export function transactionFingerprint(input: ProviderTransactionInput) {
  return createHash("sha256")
    .update([
      input.externalTransactionId.trim(),
      input.externalAccountId?.trim() ?? "",
      input.direction,
      String(input.amountCents),
      input.transactionDate,
      input.description.trim().toLowerCase(),
    ].join("|"))
    .digest("hex");
}

export async function ingestImportedTransactions(
  client: PoolClient,
  params: {
    userId: string;
    connectionId: string;
    transactions: ProviderTransactionInput[];
  },
): Promise<IngestResult> {
  const connection = await client.query<{ id: string }>(
    "SELECT id FROM financial_connections WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [params.connectionId, params.userId],
  );
  if (!connection.rowCount) throw new Error("Conexão financeira não encontrada para este usuário.");

  let created = 0;
  let updated = 0;
  const transactionIds: string[] = [];
  for (const input of params.transactions) {
    const externalId = input.externalTransactionId.trim();
    if (!externalId || externalId.length > 180) throw new Error("Identificador externo de transação inválido.");
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Valor de transação inválido.");
    assertDate(input.transactionDate);
    const description = normalizeText(input.description, 240, "Transação financeira");
    const merchantName = input.merchantName ? normalizeText(input.merchantName, 160, "") || null : null;
    const fingerprint = transactionFingerprint({ ...input, externalTransactionId: externalId, description });
    const existing = await client.query<{ id: string; state: ImportedTransactionState }>(
      "SELECT id, state FROM imported_transactions WHERE connection_id=$1 AND external_transaction_id=$2 FOR UPDATE",
      [params.connectionId, externalId],
    );

    if (existing.rowCount) {
      const current = existing.rows[0];
      const nextState = input.providerStatus?.toLowerCase().includes("revers") ? "reversed" : current.state;
      await client.query(
        `UPDATE imported_transactions
            SET external_account_id=$3, direction=$4, amount_cents=$5, transaction_date=$6,
                description=$7, merchant_name=$8, category=COALESCE(category,$9),
                provider_status=$10, state=$11, fingerprint=$12, updated_at=NOW()
          WHERE id=$1 AND user_id=$2`,
        [current.id, params.userId, input.externalAccountId?.trim() || null, input.direction, input.amountCents, input.transactionDate, description, merchantName, input.category?.trim() || null, input.providerStatus?.trim() || null, nextState, fingerprint],
      );
      updated += 1;
      transactionIds.push(current.id);
      continue;
    }

    const id = randomUUID();
    const state: ImportedTransactionState = input.providerStatus?.toLowerCase().includes("revers") ? "reversed" : "pending";
    await client.query(
      `INSERT INTO imported_transactions
        (id,user_id,connection_id,external_transaction_id,external_account_id,direction,amount_cents,transaction_date,description,merchant_name,category,provider_status,state,fingerprint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, params.userId, params.connectionId, externalId, input.externalAccountId?.trim() || null, input.direction, input.amountCents, input.transactionDate, description, merchantName, input.category?.trim() || null, input.providerStatus?.trim() || null, state, fingerprint],
    );
    created += 1;
    transactionIds.push(id);
  }

  await client.query(
    "UPDATE financial_connections SET status='active', last_synced_at=NOW(), error_message=NULL, updated_at=NOW() WHERE id=$1 AND user_id=$2",
    [params.connectionId, params.userId],
  );
  return { connectionId: params.connectionId, created, updated, transactionIds };
}

export async function acceptImportedTransaction(client: PoolClient, userId: string, transactionId: string) {
  const transaction = await client.query<Record<string, unknown>>(
    "SELECT * FROM imported_transactions WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [transactionId, userId],
  );
  if (!transaction.rowCount) return null;
  const row = transaction.rows[0];
  if (row.financial_launch_id) return { transactionId, launchId: String(row.financial_launch_id), alreadyAccepted: true };
  if (row.state === "reversed") throw new Error("Uma transação revertida não pode ser registrada como novo lançamento.");
  if (row.state !== "pending") throw new Error("A transação não está aguardando revisão.");

  const launch = await client.query<{ id: string }>(
    `INSERT INTO financial_launches
      (id,user_id,type,name,amount_cents,due_date,status,category,imported_transaction_id,paid_at)
     VALUES ($1,$2,$3,$4,$5,$6,'paid',$7,$8,NOW())
     ON CONFLICT (imported_transaction_id) DO UPDATE SET updated_at=NOW()
     RETURNING id`,
    [
      randomUUID(),
      userId,
      row.direction === "inflow" ? "entrada" : "conta",
      normalizeText(String(row.merchant_name || row.description), 120, "Transação importada"),
      Number(row.amount_cents),
      row.transaction_date,
      row.category ?? null,
      transactionId,
    ],
  );
  const launchId = launch.rows[0].id;
  await client.query(
    "UPDATE imported_transactions SET state='accepted', financial_launch_id=$3, updated_at=NOW() WHERE id=$1 AND user_id=$2",
    [transactionId, userId, launchId],
  );
  return { transactionId, launchId, alreadyAccepted: false };
}

export async function updateImportedTransactionReview(client: PoolClient, userId: string, transactionId: string, state: "pending" | "ignored", category?: string | null) {
  const current = await client.query<{ financial_launch_id: string | null; state: ImportedTransactionState }>(
    "SELECT financial_launch_id, state FROM imported_transactions WHERE id=$1 AND user_id=$2 FOR UPDATE",
    [transactionId, userId],
  );
  if (!current.rowCount) return null;
  if (current.rows[0].financial_launch_id || current.rows[0].state === "accepted") throw new Error("Uma transação já aceita não pode voltar para revisão.");
  if (current.rows[0].state === "reversed" && state !== "pending") throw new Error("Uma transação revertida não pode ser ignorada novamente.");
  const result = await client.query(
    `UPDATE imported_transactions
        SET state=$3, category=CASE WHEN $4::boolean THEN $5 ELSE category END, updated_at=NOW()
      WHERE id=$1 AND user_id=$2
      RETURNING *`,
    [transactionId, userId, state, category !== undefined, category?.trim() || null],
  );
  return result.rows[0] ?? null;
}
