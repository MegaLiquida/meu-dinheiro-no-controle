import { describe, expect, it } from "vitest";
import { buildDashboard, buildSimulation, type Launch } from "./domain";

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
});
