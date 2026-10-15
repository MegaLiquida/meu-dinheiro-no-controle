import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), sendPasswordResetEmail: vi.fn() }));

vi.mock("./db", () => ({
  getDb: () => ({ query: mocks.query }),
  withTransaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query }),
}));

vi.mock("./auth", () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  getUserFromRequest: vi.fn(),
  hashPassword: vi.fn(async () => "hash"),
  requireAuth: (request: { user?: unknown; headers?: Record<string, string | string[] | undefined> }, _response: unknown, next: () => void) => {
    const header = request.headers?.["x-test-user"];
    const id = typeof header === "string" && header ? header : "user-1";
    request.user = { id, name: `Teste ${id}`, email: `${id}@example.com`, role: "client", status: "active" };
    next();
  },
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  verifyPassword: vi.fn(async () => true),
}));

vi.mock("./email", () => ({
  isPasswordResetEmailConfigured: () => true,
  passwordResetEmailStatus: () => "configured",
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));

import api from "./api";

process.env.DATABASE_URL = "postgresql://test";

describe("API integration contracts", () => {
  const app = express();
  let server: ReturnType<typeof app.listen>;
  let baseUrl = "";

  beforeAll(async () => {
    app.use(express.json());
    app.use("/api", api);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Servidor de teste não iniciou.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.sendPasswordResetEmail.mockReset();
    const today = new Date().toISOString().slice(0, 10);
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          monthly_income_cents: 300000,
          income_frequency: "monthly",
          next_income_date: null,
          current_balance_cents: 100000,
          balance_as_of_date: today,
          safety_margin_cents: 20000,
          onboarding_completed: true,
        }],
      });
  });

  it("returns cumulative projections based on the authenticated user's balance", async () => {
    const response = await fetch(`${baseUrl}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 1200, installments: 2, firstDueDate: "2026-11-01" }),
    });
    const body = await response.json() as { monthlyInstallment: number; projection: { balance: number }[]; result: string };

    expect(response.status).toBe(200);
    expect(body.monthlyInstallment).toBe(600);
    expect(body.projection.slice(0, 3).map((month) => month.balance)).toEqual([400, -200, -200]);
    expect(body.result).toBe("danger");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("keeps launch lists scoped to the authenticated user", async () => {
    mocks.query.mockReset();
    mocks.query.mockImplementation(async (_sql: unknown, params: unknown[]) => {
      const userId = String(params[0]);
      return {
        rowCount: 1,
        rows: [{
          id: `launch-${userId}`,
          type: "conta",
          name: `Conta de ${userId}`,
          amount_cents: 12500,
          due_date: "2026-11-10",
          status: "pending",
          installments_remaining: null,
          paid_at: null,
          recurring_id: null,
          purchase_installment_id: null,
          category: "housing",
        }],
      };
    });

    for (const userId of ["user-a", "user-b"]) {
      const response = await fetch(`${baseUrl}/api/launches`, { headers: { "x-test-user": userId } });
      const body = await response.json() as { launches: { id: string }[] };

      expect(response.status).toBe(200);
      expect(body.launches.map((launch) => launch.id)).toEqual([`launch-${userId}`]);
    }
  });

  it("does not update a launch that belongs to another user", async () => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await fetch(`${baseUrl}/api/launches/launch-user-b`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-user": "user-a" },
      body: JSON.stringify({ status: "paid" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND user_id = $2"),
      ["launch-user-b", "user-a"],
    );
  });

  it("exports only data queried for the authenticated user", async () => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });

    const response = await fetch(`${baseUrl}/api/export`, { headers: { "x-test-user": "user-a" } });

    expect(response.status).toBe(200);
    for (const [, params] of mocks.query.mock.calls as [unknown, unknown[]][]) {
      expect(params).toContain("user-a");
    }
  });

  it("does not reveal whether an email exists when requesting a reset", async () => {
    const requestReset = async (rowCount: number) => {
      mocks.query.mockReset();
      mocks.query.mockResolvedValueOnce({ rowCount, rows: rowCount ? [{ id: "user-a", name: "Ana", email: "ana@example.com" }] : [] });
      if (rowCount) mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [] });
      const response = await fetch(`${baseUrl}/api/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: rowCount ? "ana@example.com" : "naoexiste@example.com" }),
      });
      return { status: response.status, body: await response.json() as { message: string } };
    };

    const existing = await requestReset(1);
    const unknown = await requestReset(0);

    expect(existing).toEqual(unknown);
    expect(existing.status).toBe(202);
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("updates the password, invalidates sessions and consumes a reset token once", async () => {
    mocks.query.mockReset();
    mocks.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "token-1", user_id: "user-a" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "user-a" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const response = await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(64), newPassword: "senha-nova-segura" }),
    });

    expect(response.status).toBe(204);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM sessions WHERE user_id = $1"),
      ["user-a"],
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE password_reset_tokens SET used_at = NOW()"),
      ["token-1"],
    );
  });

  it("rejects an expired or already used reset token", async () => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "b".repeat(64), newPassword: "senha-nova-segura" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "O link é inválido, expirou ou já foi utilizado." });
  });
});
