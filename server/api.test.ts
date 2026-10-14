import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getDb: () => ({ query: mocks.query }),
  withTransaction: async (callback: (client: { query: typeof mocks.query }) => unknown) => callback({ query: mocks.query }),
}));

vi.mock("./auth", () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  getUserFromRequest: vi.fn(),
  hashPassword: vi.fn(async () => "hash"),
  requireAuth: (request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = { id: "user-1", name: "Teste", email: "teste@example.com", role: "client", status: "active" };
    next();
  },
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  verifyPassword: vi.fn(async () => true),
}));

import api from "./api";

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
});
