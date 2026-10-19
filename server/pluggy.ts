import type { ProviderTransactionInput } from "./openfinance";

const PLUGGY_API_URL = (process.env.PLUGGY_API_URL?.trim() || "https://api.pluggy.ai").replace(/\/$/, "");
let cachedApiKey: { value: string; expiresAt: number } | null = null;

export type PluggyItem = {
  id: string;
  status?: string | null;
  executionStatus?: string | null;
  connector?: { id?: number; name?: string | null } | null;
  institution?: { name?: string | null } | null;
  consentExpiresAt?: string | null;
  error?: { code?: string | null; message?: string | null } | null;
};

type PluggyAccount = {
  id: string;
  type?: string | null;
  subtype?: string | null;
  marketingName?: string | null;
  name?: string | null;
};

type PluggyTransaction = {
  id: string;
  accountId?: string | null;
  description?: string | null;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  category?: string | null;
  status?: string | null;
  type?: string | null;
  providerId?: string | null;
  merchant?: { name?: string | null } | null;
  paymentData?: { receiver?: { name?: string | null } | null } | null;
};

type PluggyListResponse<T> = { results?: T[]; totalPages?: number; page?: number; next?: string | null };
type PluggyConnector = { id?: number | null; isSandbox?: boolean | null };

let cachedSandboxConnectorIds: { value: number[]; expiresAt: number } | null = null;

function configured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID?.trim() && process.env.PLUGGY_CLIENT_SECRET?.trim());
}

export function isPluggyConfigured() {
  return configured();
}

export function isPluggySandbox() {
  return process.env.PLUGGY_INCLUDE_SANDBOX?.trim().toLowerCase() === "true" || process.env.NODE_ENV !== "production";
}

export async function getPluggySandboxConnectorIds() {
  if (!isPluggySandbox()) return [];
  if (cachedSandboxConnectorIds && cachedSandboxConnectorIds.expiresAt > Date.now()) return cachedSandboxConnectorIds.value;
  const result = await pluggyRequest<PluggyListResponse<PluggyConnector> | PluggyConnector[]>("/connectors?sandbox=true", {}, await getPluggyApiKey());
  const connectors = Array.isArray(result) ? result : result.results ?? [];
  const ids = connectors.filter((connector) => connector.isSandbox === true).map((connector) => connector.id).filter((id): id is number => typeof id === "number" && Number.isInteger(id));
  if (!ids.length) throw new Error("A Pluggy não retornou um conector de teste disponível.");
  cachedSandboxConnectorIds = { value: ids, expiresAt: Date.now() + 15 * 60 * 1000 };
  return ids;
}

export function pluggyWebhookUrl() {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  const secret = process.env.PLUGGY_WEBHOOK_SECRET?.trim();
  return appUrl && secret ? `${appUrl}/api/webhooks/pluggy/${encodeURIComponent(secret)}` : null;
}

async function pluggyRequest<T>(path: string, init: RequestInit = {}, apiKey?: string) {
  const response = await fetch(`${PLUGGY_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(apiKey ? { "X-API-KEY": apiKey } : {}), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Pluggy respondeu ${response.status}: ${detail || "erro sem detalhes"}`);
  }
  return response.json() as Promise<T>;
}

export async function getPluggyApiKey() {
  if (!configured()) throw new Error("Pluggy não está configurado. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.");
  if (cachedApiKey && cachedApiKey.expiresAt > Date.now() + 60_000) return cachedApiKey.value;
  const result = await pluggyRequest<{ apiKey: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID!.trim(), clientSecret: process.env.PLUGGY_CLIENT_SECRET!.trim() }),
  });
  cachedApiKey = { value: result.apiKey, expiresAt: Date.now() + 110 * 60 * 1000 };
  return result.apiKey;
}

export async function createPluggyConnectToken(userId: string) {
  const apiKey = await getPluggyApiKey();
  const webhookUrl = pluggyWebhookUrl();
  const result = await pluggyRequest<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body: JSON.stringify({
      options: {
        clientUserId: userId,
        avoidDuplicates: true,
        ...(webhookUrl ? { webhookUrl } : {}),
      },
    }),
  }, apiKey);
  return result.accessToken;
}

export async function getPluggyItem(itemId: string) {
  return pluggyRequest<PluggyItem>(`/items/${encodeURIComponent(itemId)}`, {}, await getPluggyApiKey());
}

async function listPluggyAccounts(itemId: string) {
  const apiKey = await getPluggyApiKey();
  const accounts: PluggyAccount[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await pluggyRequest<PluggyListResponse<PluggyAccount>>(`/accounts?itemId=${encodeURIComponent(itemId)}&page=${page}&pageSize=500`, {}, apiKey);
    accounts.push(...(result.results ?? []));
    totalPages = result.totalPages ?? page;
    page += 1;
  } while (page <= totalPages);
  return accounts;
}

async function listPluggyTransactions(accountId: string, apiKey: string) {
  const transactions: PluggyTransaction[] = [];
  let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
  while (path) {
    const result = await pluggyRequest<PluggyListResponse<PluggyTransaction>>(path, {}, apiKey);
    transactions.push(...(result.results ?? []));
    path = result.next ? `/v2/transactions${result.next}` : "";
  }
  return transactions;
}

function transactionInput(transaction: PluggyTransaction, fallbackAccountId: string): ProviderTransactionInput {
  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new Error(`Transação Pluggy ${transaction.id} tem valor inválido.`);
  const description = transaction.description?.trim() || transaction.descriptionRaw?.trim() || "Transação Pluggy";
  const merchantName = transaction.merchant?.name?.trim() || transaction.paymentData?.receiver?.name?.trim() || null;
  return {
    externalTransactionId: transaction.id,
    externalAccountId: transaction.accountId || fallbackAccountId,
    direction: amount < 0 || transaction.type?.toUpperCase() === "DEBIT" ? "outflow" : "inflow",
    amountCents: Math.round(Math.abs(amount) * 100),
    transactionDate: transaction.date.slice(0, 10),
    description,
    merchantName,
    category: transaction.category?.trim() || null,
    providerStatus: transaction.status?.trim() || null,
  };
}

export async function fetchPluggyTransactions(itemId: string) {
  const apiKey = await getPluggyApiKey();
  const accounts = await listPluggyAccounts(itemId);
  const transactions: ProviderTransactionInput[] = [];
  for (const account of accounts) {
    const page = await listPluggyTransactions(account.id, apiKey);
    for (const transaction of page) transactions.push(transactionInput(transaction, account.id));
  }
  return { accounts, transactions };
}

export function pluggyInstitutionName(item: PluggyItem) {
  return item.connector?.name?.trim() || item.institution?.name?.trim() || "Instituição conectada";
}

export function pluggyConnectionStatus(item: PluggyItem) {
  const status = `${item.status ?? ""} ${item.executionStatus ?? ""}`.toUpperCase();
  if (status.includes("ERROR") || status.includes("FAILED")) return "error" as const;
  if (status.includes("WAITING") || status.includes("PENDING") || status.includes("UPDATING")) return "pending" as const;
  if (status.includes("REVOKED") || status.includes("DELETED")) return "revoked" as const;
  return "active" as const;
}

export function pluggyConsentStatus(item: PluggyItem) {
  return item.consentExpiresAt && new Date(item.consentExpiresAt).getTime() <= Date.now() ? "expired" as const : "active" as const;
}
