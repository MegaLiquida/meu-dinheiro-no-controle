export type LaunchType = "entrada" | "conta" | "parcela";
export type LaunchStatus = "pending" | "paid";
export type IncomeFrequency = "monthly" | "biweekly" | "weekly" | "irregular";

export type FinancialProfile = {
  monthlyIncome: number;
  incomeFrequency: IncomeFrequency;
  nextIncomeDate: string | null;
  currentBalance: number;
  balanceAsOfDate: string;
  safetyMargin: number;
  onboardingCompleted: boolean;
};

export type Launch = {
  id: string;
  type: LaunchType;
  name: string;
  amount: number;
  dueDate: string;
  status: LaunchStatus;
  installmentsRemaining?: number;
  paidAt?: string | null;
  recurringId?: string | null;
  purchaseInstallmentId?: string | null;
  category?: string | null;
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
    committedPercent: number;
  };
  profile: FinancialProfile;
  overdue: Launch[];
  alerts: DashboardAlert[];
  priorities: PriorityAction[];
};

export type DashboardAlert = {
  id: string;
  tone: "danger" | "attention" | "good";
  title: string;
  detail: string;
};

export type PriorityAction = {
  id: string;
  title: string;
  detail: string;
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

export function buildDashboard(launches: Launch[], today = todayIso(), profile?: FinancialProfile): Dashboard {
  const ordered = [...launches].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const launchNextIncome = ordered.find((launch) => launch.type === "entrada" && launch.dueDate >= today) ?? null;
  const nextIncome = launchNextIncome ?? (profile?.nextIncomeDate
    ? { id: "profile-next-income", type: "entrada" as const, name: "Próxima entrada", amount: profile.monthlyIncome, dueDate: profile.nextIncomeDate, status: "pending" as const }
    : null);
  const horizon = nextIncome?.dueDate ?? monthEndIso(today);
  const month = monthPrefix(today);
  const income = ordered.filter((launch) => launch.type === "entrada");
  const expenses = ordered.filter((launch) => launch.type !== "entrada");
  const paidIncome = income.filter((launch) => launch.status === "paid");
  const paidExpenses = expenses.filter((launch) => launch.status === "paid");
  const pendingBeforeNextIncome = expenses.filter(
    (launch) => launch.status === "pending" && launch.dueDate >= today && launch.dueDate <= horizon,
  );
  const upcoming = expenses.filter(
    (launch) => launch.status === "pending" && launch.dueDate >= today && launch.dueDate <= horizon,
  );
  const overdue = expenses.filter((launch) => launch.status === "pending" && launch.dueDate < today);
  const monthlyIncome = profile?.monthlyIncome || sum(income.filter((launch) => launch.dueDate.startsWith(month)));
  const fixedTotal = sum(expenses.filter((launch) => launch.type === "conta" && launch.dueDate.startsWith(month)));
  const installmentsTotal = sum(expenses.filter((launch) => launch.type === "parcela" && launch.dueDate.startsWith(month)));
  const balanceChangesSinceSnapshot = profile
    ? ordered.filter((launch) => launch.status === "paid" && launch.dueDate > profile.balanceAsOfDate && launch.dueDate <= today)
    : [];
  const currentBalance = profile
    ? profile.currentBalance + sum(balanceChangesSinceSnapshot.filter((launch) => launch.type === "entrada")) - sum(balanceChangesSinceSnapshot.filter((launch) => launch.type !== "entrada"))
    : sum(paidIncome) - sum(paidExpenses);
  const projectedBalance = currentBalance - sum(pendingBeforeNextIncome);
  const safetyMargin = profile?.safetyMargin ?? 0;
  const alerts: DashboardAlert[] = [];
  if (overdue.length) alerts.push({ id: "overdue", tone: "danger", title: `${overdue.length} compromisso${overdue.length > 1 ? "s" : ""} em atraso`, detail: `Regularize ${overdue.length === 1 ? overdue[0].name : "as contas atrasadas"} para recuperar previsibilidade.` });
  if (projectedBalance < 0) alerts.push({ id: "negative-projection", tone: "danger", title: "O saldo ficará negativo", detail: `A projeção chega a ${formatMoney(projectedBalance)} antes da próxima entrada.` });
  else if (profile && projectedBalance < safetyMargin) alerts.push({ id: "safety-margin", tone: "attention", title: "Sua margem de segurança será usada", detail: `A projeção é ${formatMoney(projectedBalance)} e sua margem é ${formatMoney(safetyMargin)}.` });
  if (!nextIncome) alerts.push({ id: "missing-income", tone: "attention", title: "Cadastre sua próxima entrada", detail: "Sem uma data de entrada, o sistema não consegue dimensionar seu período com precisão." });
  const priorities: PriorityAction[] = [];
  if (overdue.length) priorities.push({ id: "overdue", title: "Regularizar atrasos", detail: "Comece pelas contas essenciais e pelas que geram juros ou corte de serviço." });
  if (projectedBalance < 0) priorities.push({ id: "projection", title: "Evitar novos compromissos", detail: "Revise parcelas e use o simulador antes de assumir uma nova compra." });
  else if (profile && projectedBalance < safetyMargin) priorities.push({ id: "margin", title: "Proteger sua margem", detail: "Adie gastos não essenciais até a próxima entrada ou revise os vencimentos." });
  if (!nextIncome) priorities.push({ id: "income", title: "Cadastrar próxima entrada", detail: "Informe quando e quanto deve entrar para receber uma projeção mais útil." });
  if (!priorities.length) priorities.push({ id: "weekly-review", title: "Fazer a revisão da semana", detail: "Confirme pagamentos e confira os compromissos dos próximos sete dias." });

  return {
    today,
    monthLabel: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`)),
    currentBalance,
    projectedBalance,
    nextIncome: nextIncome
      ? { name: nextIncome.name, amount: nextIncome.amount, dueDate: nextIncome.dueDate }
      : null,
    upcoming,
    launches: ordered,
    metrics: {
      incomeTotal: monthlyIncome,
      fixedTotal,
      installmentsTotal,
      committedPercent: monthlyIncome > 0 ? Math.round(((fixedTotal + installmentsTotal) / monthlyIncome) * 100) : 0,
    },
    profile: profile ?? { monthlyIncome: monthlyIncome, incomeFrequency: "monthly", nextIncomeDate: nextIncome?.dueDate ?? null, currentBalance, balanceAsOfDate: today, safetyMargin: 0, onboardingCompleted: false },
    overdue,
    alerts,
    priorities: priorities.slice(0, 3),
  };
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function buildSimulation(launches: Launch[], amount: number, installments: number, firstDueDate: string, safetyMargin = 600) {
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
  const result = lowest < 0 ? "danger" : lowest < safetyMargin ? "attention" : "good";
  return { monthlyInstallment: monthly, projection, lowest, result };
}

export function buildSimulationScenarios(launches: Launch[], amount: number, firstDueDate: string, safetyMargin = 600) {
  const options = [1, 3, 6, 10, 12, 18, 24].filter((installments) => installments <= 60 && installments <= Math.max(24, Math.ceil(amount / 0.01)));
  return options.map((installments) => ({ installments, ...buildSimulation(launches, amount, installments, firstDueDate, safetyMargin) }));
}
