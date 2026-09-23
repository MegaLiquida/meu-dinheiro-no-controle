export type LaunchType = "entrada" | "conta" | "parcela";
export type LaunchStatus = "pending" | "paid";

export type Launch = {
  id: string;
  type: LaunchType;
  name: string;
  amount: number;
  dueDate: string;
  status: LaunchStatus;
  installmentsRemaining?: number;
  paidAt?: string | null;
};

export type Dashboard = {
  today: string;
  monthLabel: string;
  currentBalance: number;
  projectedBalance: number;
  nextIncome: { name: string; amount: number; dueDate: string } | null;
  upcoming: Launch[];
  launches: Launch[];
  metrics: {
    incomeTotal: number;
    fixedTotal: number;
    installmentsTotal: number;
  };
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthEndIso(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

function monthPrefix(dateIso: string) {
  return dateIso.slice(0, 7);
}

function sum(launches: Launch[]) {
  return launches.reduce((total, launch) => total + launch.amount, 0);
}

export function buildDashboard(launches: Launch[], today = todayIso()): Dashboard {
  const ordered = [...launches].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextIncome = ordered.find((launch) => launch.type === "entrada" && launch.dueDate >= today) ?? null;
  const horizon = nextIncome?.dueDate ?? monthEndIso(today);
  const month = monthPrefix(today);
  const income = ordered.filter((launch) => launch.type === "entrada");
  const expenses = ordered.filter((launch) => launch.type !== "entrada");
  const paidIncome = income.filter((launch) => launch.status === "paid");
  const paidExpenses = expenses.filter((launch) => launch.status === "paid");
  const pendingBeforeNextIncome = expenses.filter(
    (launch) => launch.status === "pending" && launch.dueDate >= today && launch.dueDate < horizon,
  );
  const upcoming = expenses.filter(
    (launch) => launch.status === "pending" && launch.dueDate >= today && launch.dueDate <= horizon,
  );

  return {
    today,
    monthLabel: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`)),
    currentBalance: sum(paidIncome) - sum(paidExpenses),
    projectedBalance: sum(paidIncome) - sum(paidExpenses) - sum(pendingBeforeNextIncome),
    nextIncome: nextIncome
      ? { name: nextIncome.name, amount: nextIncome.amount, dueDate: nextIncome.dueDate }
      : null,
    upcoming,
    launches: ordered,
    metrics: {
      incomeTotal: sum(income.filter((launch) => launch.dueDate.startsWith(month))),
      fixedTotal: sum(expenses.filter((launch) => launch.type === "conta" && launch.dueDate.startsWith(month))),
      installmentsTotal: sum(expenses.filter((launch) => launch.type === "parcela" && launch.dueDate.startsWith(month))),
    },
  };
}

export function buildSimulation(launches: Launch[], amount: number, installments: number, firstDueDate: string) {
  const first = new Date(`${firstDueDate}T00:00:00Z`);
  const monthly = amount / installments;
  const projection = Array.from({ length: Math.max(8, Math.min(24, installments + 2)) }, (_, index) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
    const prefix = date.toISOString().slice(0, 7);
    const base = sum(launches.filter((launch) => launch.type === "entrada" && launch.dueDate.startsWith(prefix)))
      - sum(launches.filter((launch) => launch.type !== "entrada" && launch.dueDate.startsWith(prefix)));
    const active = index < installments;
    return {
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date),
      balance: base - (active ? monthly : 0),
      active,
    };
  });
  const lowest = Math.min(...projection.map((item) => item.balance));
  const result = lowest < 0 ? "danger" : lowest < 600 ? "attention" : "good";
  return { monthlyInstallment: monthly, projection, lowest, result };
}
