export type LaunchType = "entrada" | "conta" | "parcela";
export type LaunchStatus = "pending" | "paid";
export type IncomeFrequency = "monthly" | "biweekly" | "weekly" | "irregular";

export const MAX_MONEY_CENTS = 9_000_000_000_000;

export function moneyToCents(value: number) {
  if (!Number.isFinite(value) || value < -MAX_MONEY_CENTS / 100 || value > MAX_MONEY_CENTS / 100) {
    throw new Error("Valor monetário fora do limite permitido.");
  }
  const scaled = value * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-7) {
    throw new Error("Use no máximo duas casas decimais.");
  }
  const result = Math.round(scaled);
  if (!Number.isSafeInteger(result)) throw new Error("Valor monetário não pode ser representado com segurança.");
  return result;
}

export function normalizeMonthlyIncomeCents(
  incomeCents: number,
  frequency: IncomeFrequency,
  conservativeIrregularIncomeCents?: number | null,
) {
  if (!Number.isSafeInteger(incomeCents) || incomeCents < 0) throw new Error("Renda inválida.");
  if (conservativeIrregularIncomeCents != null && (!Number.isSafeInteger(conservativeIrregularIncomeCents) || conservativeIrregularIncomeCents < 0)) {
    throw new Error("Renda conservadora inválida.");
  }
  if (frequency === "irregular") {
    return {
      monthlyIncomeCents: conservativeIrregularIncomeCents ?? 0,
      source: conservativeIrregularIncomeCents == null ? "documented_zero_fallback" as const : "explicit_conservative" as const,
      warning: conservativeIrregularIncomeCents == null
        ? "Renda irregular sem estimativa conservadora: foi usado zero até que uma estimativa seja informada."
        : null,
    };
  }
  const multiplier = frequency === "biweekly" ? 26 / 12 : frequency === "weekly" ? 52 / 12 : 1;
  return { monthlyIncomeCents: Math.round(incomeCents * multiplier), source: "frequency_normalization" as const, warning: null };
}

export function calculateEssentialFloorCents(expenses: Array<{ monthlyAmountCents: number; active: boolean }>) {
  return expenses.reduce((total, expense) => expense.active ? total + expense.monthlyAmountCents : total, 0);
}

export function calculateSafeCapacityCents(input: {
  conservativeMonthlyIncomeCents: number;
  essentialFloorCents: number;
  existingMonthlyCommitmentsCents: number;
  safetyMarginCents: number;
}) {
  return Math.max(0, input.conservativeMonthlyIncomeCents - input.essentialFloorCents - input.existingMonthlyCommitmentsCents - input.safetyMarginCents);
}

export type PrioritizableDebt = {
  id: string;
  balanceCents: number;
  priority?: "essential" | "high" | "normal" | "low" | null;
  secured?: boolean | null;
  daysOverdue?: number | null;
  dueDate?: string | null;
  interestRate?: number | null;
  totalCostRate?: number | null;
  negativeListing?: boolean | null;
};

export function deriveDaysOverdue(dueDate?: string | null, today = todayIso()) {
  if (!dueDate || dueDate >= today) return 0;
  const due = new Date(`${dueDate}T00:00:00Z`).valueOf();
  const reference = new Date(`${today}T00:00:00Z`).valueOf();
  if (!Number.isFinite(due) || !Number.isFinite(reference)) return 0;
  return Math.max(0, Math.floor((reference - due) / 86_400_000));
}

export function prioritizeDebts<T extends PrioritizableDebt>(debts: T[], today = todayIso()) {
  return debts.map((debt) => {
    let score = 0;
    const reasons: string[] = [];
    if (debt.priority === "essential") { score += 100; reasons.push("serviço ou compromisso marcado como essencial"); }
    else if (debt.priority === "high") { score += 35; reasons.push("prioridade alta informada"); }
    if (debt.secured === true) { score += 60; reasons.push("dívida com garantia informada"); }
    const daysOverdue = debt.daysOverdue ?? deriveDaysOverdue(debt.dueDate, today);
    if (daysOverdue > 0) { score += Math.min(50, 10 + Math.floor(daysOverdue / 30) * 5); reasons.push(`${daysOverdue} dia(s) em atraso`); }
    const cost = debt.totalCostRate ?? debt.interestRate;
    if (cost != null) { score += Math.min(40, Math.floor(cost)); reasons.push(`custo conhecido de ${cost}%`); }
    if (debt.negativeListing === true) { score += 15; reasons.push("negativação informada"); }
    score += Math.min(20, Math.floor(debt.balanceCents / 100_000));
    if (debt.balanceCents > 0) reasons.push("saldo devedor considerado como critério de desempate");
    return { ...debt, daysOverdue, score, reasons };
  }).sort((a, b) => b.score - a.score || b.balanceCents - a.balanceCents || a.id.localeCompare(b.id));
}

export function assertPlanCanActivate(monthlyTotalCents: number, safeCapacityCents: number) {
  if (monthlyTotalCents > safeCapacityCents) {
    throw new Error(`O total mensal do plano (${monthlyTotalCents} centavos) excede a capacidade segura (${safeCapacityCents} centavos).`);
  }
}

export function calculatePaymentBalances(balanceCents: number, amountCents: number, confirmOverpayment = false) {
  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0 || !Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Saldo ou pagamento inválido.");
  if (amountCents > balanceCents && !confirmOverpayment) throw new Error("O pagamento excede o saldo. Confirme explicitamente para continuar.");
  return { balanceBeforeCents: balanceCents, balanceAfterCents: Math.max(0, balanceCents - amountCents), overpaymentCents: Math.max(0, amountCents - balanceCents) };
}

export function assertDebtStatus(balanceCents: number, status: "open" | "negotiating" | "paid") {
  if (status === "paid" && balanceCents !== 0) throw new Error("A dívida só pode ser marcada como paga quando o saldo for zero.");
}

export function actionStateDates(status: "open" | "snoozed" | "resolved", snoozedUntil?: string | null, now = new Date()) {
  if (status === "snoozed" && !snoozedUntil) throw new Error("Informe até quando a ação deve ser adiada.");
  return { snoozedUntil: status === "snoozed" ? snoozedUntil! : null, resolvedAt: status === "resolved" ? now.toISOString() : null };
}

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
