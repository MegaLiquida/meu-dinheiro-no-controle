import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluggyConnectToken, fetchPluggyTransactions } from "./pluggy";

type MockResponse = { ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> };

function response(body: unknown, status = 200): MockResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("Pluggy sandbox client", () => {
  beforeEach(() => {
    process.env.PLUGGY_CLIENT_ID = "client-id-test";
    process.env.PLUGGY_CLIENT_SECRET = "client-secret-test";
    vi.restoreAllMocks();
  });

  it("creates a short-lived Connect Token with the user mapping inside options", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ apiKey: "api-key-test" }))
      .mockResolvedValueOnce(response({ accessToken: "connect-token-test" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPluggyConnectToken("user-123")).resolves.toBe("connect-token-test");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.pluggy.ai/auth", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.pluggy.ai/connect_token", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-API-KEY": "api-key-test" }),
      body: JSON.stringify({ options: { clientUserId: "user-123", avoidDuplicates: true } }),
    }));
  });

  it("lists sandbox connector ids so test accounts cannot choose live institutions", async () => {
    vi.resetModules();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ apiKey: "api-key-test" }))
      .mockResolvedValueOnce(response({ results: [{ id: 999, name: "Pluggy Bank" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const { getPluggySandboxConnectorIds } = await import("./pluggy");
    await expect(getPluggySandboxConnectorIds()).resolves.toEqual([999]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.pluggy.ai/connectors?sandbox=true", expect.objectContaining({ headers: expect.objectContaining({ "X-API-KEY": "api-key-test" }) }));
  });

  it("reads all v2 cursor pages and normalizes debit and credit transactions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ results: [{ id: "account-1", type: "BANK", subtype: "CHECKING_ACCOUNT" }], totalPages: 1 }))
      .mockResolvedValueOnce(response({
        results: [{ id: "tx-1", accountId: "account-1", amount: -84.9, date: "2026-10-19T00:00:00.000Z", description: "MERCADO", type: "DEBIT", status: "POSTED", category: "Food" }],
        next: "?accountId=account-1&after=cursor-1",
      }))
      .mockResolvedValueOnce(response({
        results: [{ id: "tx-2", accountId: "account-1", amount: 3200, date: "2026-10-18T00:00:00.000Z", description: "SALARIO", type: "CREDIT", status: "POSTED", category: "Salary" }],
        next: null,
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPluggyTransactions("item-1");
    expect(result.accounts).toHaveLength(1);
    expect(result.transactions).toEqual([
      expect.objectContaining({ externalTransactionId: "tx-1", direction: "outflow", amountCents: 8490, transactionDate: "2026-10-19", category: "Food" }),
      expect.objectContaining({ externalTransactionId: "tx-2", direction: "inflow", amountCents: 320000, transactionDate: "2026-10-18", category: "Salary" }),
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.pluggy.ai/v2/transactions?accountId=account-1", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.pluggy.ai/v2/transactions?accountId=account-1&after=cursor-1", expect.anything());
  });
});
