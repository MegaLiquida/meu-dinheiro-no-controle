import { describe, expect, it } from "vitest";
import {
  actionStateDates,
  assertDebtStatus,
  assertPlanCanActivate,
  buildDashboard,
  buildSimulation,
  buildSimulationScenarios,
  calculateEssentialFloorCents,
  calculatePaymentBalances,
  calculateSafeCapacityCents,
  moneyToCents,
  normalizeMonthlyIncomeCents,
  prioritizeDebts,
  type Launch,
} from "./domain";

const launches: Launch[] = [
  { id: "income", type: "entrada", name: "Salário", amount: 3800, dueDate: "2026-09-05", status: "paid" },
  { id: "rent", type: "conta", name: "Aluguel", amount: 1200, dueDate: "2026-09-10", status: "paid" },
  { id: "energy", type: "conta", name: "Energia", amount: 210, dueDate: "2026-09-22", status: "pending" },
  { id: "phone", type: "parcela", name: "Celular", amount: 190, dueDate: "2026-09-25", status: "pending", installmentsRemaining: 4 },
  { id: "next-income", type: "entrada", name: "Próximo salário", amount: 3800, dueDate: "2026-10-05", status: "pending" },
];

describe("financial domain", () => {
  it("separates current balance from projected balance", () => {
    const dashboard = buildDashboard(launches, "2026-09-21");
    expect(dashboard.currentBalance).toBe(2600);
    expect(dashboard.projectedBalance).toBe(2200);
    expect(dashboard.upcoming.map((launch) => launch.id)).toEqual(["energy", "phone"]);
  });

  it("does not count paid expenses as upcoming commitments", () => {
    const dashboard = buildDashboard(launches.map((launch) => launch.id === "energy" ? { ...launch, status: "paid" as const } : launch), "2026-09-21");
    expect(dashboard.upcoming.map((launch) => launch.id)).toEqual(["phone"]);
  });

  it("returns a negative result when a purchase exceeds the monthly margin", () => {
    const simulation = buildSimulation(launches, 5000, 2, "2026-09-25");
    expect(simulation.monthlyInstallment).toBe(2500);
    expect(simulation.result).toBe("danger");
    expect(simulation.lowest).toBeLessThan(0);
  });

  it("uses the financial profile to calculate the protected margin and priorities", () => {
    const dashboard = buildDashboard(launches, "2026-09-21", {
      monthlyIncome: 3800,
      incomeFrequency: "monthly",
      nextIncomeDate: "2026-10-05",
      currentBalance: 900,
      balanceAsOfDate: "2026-09-21",
      safetyMargin: 1000,
      onboardingCompleted: true,
    });
    expect(dashboard.currentBalance).toBe(900);
    expect(dashboard.projectedBalance).toBe(500);
    expect(dashboard.metrics.committedPercent).toBe(42);
    expect(dashboard.alerts.some((alert) => alert.id === "safety-margin")).toBe(true);
    expect(dashboard.priorities[0].id).toBe("margin");
  });

  it("compares installment scenarios using the configured safety margin", () => {
    const scenarios = buildSimulationScenarios(launches, 1200, "2026-09-25", 1000);
    expect(scenarios.map((scenario) => scenario.installments)).toEqual([1, 3, 6, 10, 12, 18, 24]);
    expect(scenarios[0].monthlyInstallment).toBe(1200);
    expect(scenarios[0].result).toBe("attention");
    expect(scenarios.at(-1)?.monthlyInstallment).toBe(50);
  });
});

describe("recovery planning rules", () => {
  it("normalizes monthly, biweekly and weekly income using documented factors", () => {
    expect(normalizeMonthlyIncomeCents(300_000, "monthly").monthlyIncomeCents).toBe(300_000);
    expect(normalizeMonthlyIncomeCents(100_000, "biweekly").monthlyIncomeCents).toBe(216_667);
    expect(normalizeMonthlyIncomeCents(100_000, "weekly").monthlyIncomeCents).toBe(433_333);
  });

  it("uses explicit conservative irregular income and otherwise falls back to zero", () => {
    expect(normalizeMonthlyIncomeCents(500_000, "irregular", 280_000)).toMatchObject({ monthlyIncomeCents: 280_000, source: "explicit_conservative", warning: null });
    expect(normalizeMonthlyIncomeCents(500_000, "irregular")).toMatchObject({ monthlyIncomeCents: 0, source: "documented_zero_fallback" });
  });

  it("sums only active essential expenses and never returns negative safe capacity", () => {
    const essentialFloorCents = calculateEssentialFloorCents([
      { monthlyAmountCents: 120_000, active: true },
      { monthlyAmountCents: 30_000, active: false },
      { monthlyAmountCents: 40_000, active: true },
    ]);
    expect(essentialFloorCents).toBe(160_000);
    expect(calculateSafeCapacityCents({ conservativeMonthlyIncomeCents: 400_000, essentialFloorCents, existingMonthlyCommitmentsCents: 80_000, safetyMarginCents: 20_000 })).toBe(140_000);
    expect(calculateSafeCapacityCents({ conservativeMonthlyIncomeCents: 100_000, essentialFloorCents, existingMonthlyCommitmentsCents: 80_000, safetyMarginCents: 20_000 })).toBe(0);
  });

  it("prioritizes only informed criteria and explains the result", () => {
    const ranked = prioritizeDebts([
      { id: "ordinary", balanceCents: 900_000 },
      { id: "secured", balanceCents: 100_000, secured: true },
      { id: "essential", balanceCents: 50_000, priority: "essential" },
      { id: "overdue", balanceCents: 60_000, dueDate: "2026-01-01", totalCostRate: 18 },
    ], "2026-03-02");
    expect(ranked.map((debt) => debt.id)).toEqual(["essential", "secured", "overdue", "ordinary"]);
    expect(ranked[0].reasons).toContain("serviço ou compromisso marcado como essencial");
    expect(ranked.find((debt) => debt.id === "ordinary")?.reasons).not.toEqual(expect.arrayContaining([expect.stringContaining("juros")]));
  });

  it("enforces activation, payment, paid-state and action-state guardrails", () => {
    expect(() => assertPlanCanActivate(120_001, 120_000)).toThrow("excede a capacidade segura");
    expect(() => assertPlanCanActivate(120_000, 120_000)).not.toThrow();
    expect(calculatePaymentBalances(100_000, 25_000)).toEqual({ balanceBeforeCents: 100_000, balanceAfterCents: 75_000, overpaymentCents: 0 });
    expect(() => calculatePaymentBalances(100_000, 120_000)).toThrow("Confirme explicitamente");
    expect(calculatePaymentBalances(100_000, 120_000, true).balanceAfterCents).toBe(0);
    expect(() => assertDebtStatus(1, "paid")).toThrow("saldo for zero");
    expect(() => actionStateDates("snoozed")).toThrow("até quando");
    expect(actionStateDates("resolved", null, new Date("2026-09-24T12:00:00Z"))).toEqual({ snoozedUntil: null, resolvedAt: "2026-09-24T12:00:00.000Z" });
  });

  it("rejects non-finite money and values with more than two decimal places", () => {
    expect(moneyToCents(12.34)).toBe(1234);
    expect(() => moneyToCents(12.345)).toThrow("duas casas");
    expect(() => moneyToCents(Number.NaN)).toThrow("limite");
    expect(() => moneyToCents(Number.POSITIVE_INFINITY)).toThrow("limite");
  });
});
