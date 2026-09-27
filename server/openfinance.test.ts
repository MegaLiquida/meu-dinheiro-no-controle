import { describe, expect, it } from "vitest";
import { transactionFingerprint } from "./openfinance";

describe("open finance transaction safety", () => {
  const base = {
    externalTransactionId: "tx-123",
    externalAccountId: "account-1",
    direction: "outflow" as const,
    amountCents: 1299,
    transactionDate: "2026-09-26",
    description: "Mercado do Bairro",
  };

  it("generates a stable fingerprint for the same provider transaction", () => {
    expect(transactionFingerprint(base)).toBe(transactionFingerprint({ ...base }));
  });

  it("changes the fingerprint when material transaction data changes", () => {
    expect(transactionFingerprint(base)).not.toBe(transactionFingerprint({ ...base, amountCents: 1300 }));
    expect(transactionFingerprint(base)).not.toBe(transactionFingerprint({ ...base, externalTransactionId: "tx-124" }));
  });
});
