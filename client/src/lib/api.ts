export type UserRole = "client" | "support" | "admin" | "owner";
export type UserStatus = "active" | "inactive";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
  updatedAt?: string;
  launches?: number;
};

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
  recurringId?: string | null;
  purchaseInstallmentId?: string | null;
  category?: string | null;
};

export type RecurringCommitment = { id: string; kind: "entrada" | "conta"; name: string; amount: number; dueDay: number; startDate: string; category?: string | null; active: boolean };
export type PurchaseInstallment = { id: string; installmentNumber: number; amount: number; dueDate: string; status: LaunchStatus; paidAt?: string | null };
export type Purchase = { id: string; name: string; totalAmount: number; installmentCount: number; firstDueDate: string; category?: string | null; installments: PurchaseInstallment[] };
export type DebtPriority = "essential" | "high" | "normal" | "low";
export type DebtStatus = "open" | "negotiating" | "paid";
export type DebtPrioritization = { rank: number; score: number; reasons: string[] };
export type Debt = {
  id: string;
  name: string;
  creditor?: string | null;
  balance: number;
  installment: number;
  dueDay?: number | null;
  interestRate?: number | null;
  priority: DebtPriority;
  status: DebtStatus;
  notes?: string | null;
  originalAmount?: number | null;
  debtType?: string | null;
  dueDate?: string | null;
  daysOverdue?: number | null;
  totalCostRate?: number | null;
  remainingInstallments?: number | null;
  secured?: boolean | null;
  contractReference?: string | null;
  collectionChannel?: string | null;
  negativeListing?: boolean | null;
  balanceUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  prioritization?: DebtPrioritization;
};
export type DebtInput = Omit<Debt, "id" | "prioritization" | "balanceUpdatedAt" | "createdAt" | "updatedAt">;
export type Goal = { id: string; name: string; target: number; current: number; dueDate?: string | null; status: "active" | "completed" | "paused" };
export type Notification = { id: string; tone: "danger" | "attention" | "good"; title: string; detail: string; read: boolean; createdAt?: string };
export type MonthlyData = { month: string; launches: Launch[]; summary: { plannedIncome: number; plannedExpenses: number; plannedBalance: number; realizedIncome: number; realizedExpenses: number; realizedBalance: number }; categories: { category: string; total: number }[]; budgets: { id: string; category: string; month: string; limit: number }[]; goals: Goal[] };

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

export type EssentialCategory = "housing" | "utilities" | "food" | "health" | "transport" | "education" | "child_support" | "insurance" | "taxes" | "other";
export type EssentialExpense = {
  id: string;
  name: string;
  category: EssentialCategory;
  monthlyAmount: number;
  required: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};
export type Diagnosis = {
  monthlyIncome: number;
  incomeFrequency: IncomeFrequency;
  variableIncome: number;
  normalizedMonthlyIncome: number;
  conservativeMonthlyIncome: number;
  dependents: number;
  currentBalance: number;
  balanceAsOfDate: string;
  nextIncomeDate: string | null;
  existingMonthlyCommitments: number;
  safetyMargin: number;
  essentialFloor: number;
  safeCapacity: number;
  capacityDisclaimer: string;
  notes: string | null;
  completedAt: string | null;
};
export type DiagnosisInput = {
  incomeAmount: number;
  incomeFrequency: IncomeFrequency;
  conservativeMonthlyIncome?: number | null;
  variableIncome?: number;
  dependents?: number;
  currentBalance?: number;
  balanceAsOfDate?: string;
  nextIncomeDate?: string | null;
  existingMonthlyCommitments?: number;
  safetyMargin?: number;
  notes?: string | null;
};
export type NegotiationChannel = "phone" | "email" | "chat" | "whatsapp" | "in_person" | "letter" | "other";
export type NegotiationStatus = "draft" | "offered" | "accepted" | "rejected" | "expired" | "cancelled";
export type DebtNegotiation = {
  id: string;
  debtId: string;
  contact: string | null;
  channel: NegotiationChannel | null;
  offerAmount: number | null;
  downPayment: number | null;
  installmentCount: number | null;
  installmentAmount: number | null;
  totalAmount: number | null;
  charges: number | null;
  validUntil: string | null;
  status: NegotiationStatus;
  decidedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type DebtNegotiationInput = Omit<DebtNegotiation, "id" | "debtId" | "decidedAt" | "createdAt" | "updatedAt">;
export type RecoveryPlanStatus = "draft" | "active" | "paused" | "completed" | "cancelled";
export type RecoveryPlanItem = {
  id?: string;
  debtId: string;
  acceptedNegotiationId?: string | null;
  monthlyAmount: number;
  dueDay?: number | null;
  sequence: number;
  notes?: string | null;
};
export type RecoveryPlan = {
  id: string;
  name: string;
  status: RecoveryPlanStatus;
  normalizedIncome: number;
  essentialFloor: number;
  existingMonthlyCommitments: number;
  safetyMargin: number;
  safeCapacity: number;
  monthlyTotal: number;
  startDate: string | null;
  targetEndDate: string | null;
  assumptions: Record<string, unknown>;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: RecoveryPlanItem[];
};
export type RecoveryPlanInput = {
  name: string;
  status?: RecoveryPlanStatus;
  startDate?: string | null;
  targetEndDate?: string | null;
  assumptions?: Record<string, unknown>;
  items: RecoveryPlanItem[];
};
export type PaymentSource = "manual" | "bank_transfer" | "cash" | "card" | "payroll" | "other";
export type DebtPayment = {
  id: string;
  debtId: string;
  balanceBefore: number;
  amount: number;
  balanceAfter: number;
  paidOn: string;
  source: PaymentSource;
  proofReference: string | null;
  overpaymentConfirmed: boolean;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
};
export type ActionStatus = "open" | "snoozed" | "resolved";
export type ActionItem = {
  id: string;
  weeklyReviewId: string | null;
  debtId: string | null;
  title: string;
  detail: string | null;
  status: ActionStatus;
  dueDate: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type WeeklyReview = {
  id: string;
  weekStart: string;
  status: ActionStatus;
  summary: string | null;
  balanceSnapshot: number | null;
  reviewedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  actions?: ActionItem[];
};
export type WeeklyReviewInput = {
  weekStart: string;
  status?: ActionStatus;
  summary?: string | null;
  balanceSnapshot?: number | null;
  snoozedUntil?: string | null;
  actions?: Array<{ title: string; detail?: string | null; debtId?: string | null; dueDate?: string | null }>;
};
export type CsvPreviewRow = { type: LaunchType; name: string; amount: number; dueDate: string; category: string | null; status: LaunchStatus };
export type CsvPreview = { hash: string; rows: CsvPreviewRow[]; count: number; alreadyImported: boolean; previousBatch: { id: string; row_count: number; completed_at: string } | null };

export type Dashboard = {
  today: string;
  monthLabel: string;
  currentBalance: number;
  projectedBalance: number;
  nextIncome: { name: string; amount: number; dueDate: string } | null;
  upcoming: Launch[];
  launches: Launch[];
  metrics: { incomeTotal: number; fixedTotal: number; installmentsTotal: number; committedPercent: number };
  profile: FinancialProfile;
  overdue: Launch[];
  alerts: { id: string; tone: "danger" | "attention" | "good"; title: string; detail: string }[];
  priorities: { id: string; title: string; detail: string }[];
};

export type AdminMetrics = { users: number; activeUsers: number; attentionUsers: number; launches: number };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let message = "Não foi possível concluir a operação.";
    try {
      const body = await response.json();
      if (body.message) message = body.message;
    } catch {
      // Keep the generic message when the server does not return JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User }>("/auth/me"),
  login: (body: { email: string; password: string }) => request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: { name: string; email: string; password: string }) => request<{ user: User }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  changePassword: (body: { currentPassword: string; newPassword: string }) => request<void>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  exportData: () => fetch("/api/export", { credentials: "include" }).then(async (response) => { if (!response.ok) throw new Error("Não foi possível exportar seus dados."); return response.blob(); }),
  previewCsv: (csv: string) => request<CsvPreview>("/import/csv/preview", { method: "POST", body: JSON.stringify({ csv }) }),
  importCsv: (csv: string) => request<{ imported: number; duplicate: boolean; batchId?: string }>("/import/csv", { method: "POST", body: JSON.stringify({ csv }) }),
  dashboard: () => request<Dashboard>("/dashboard"),
  profile: () => request<{ profile: FinancialProfile }>("/profile"),
  saveProfile: (body: FinancialProfile) => request<{ profile: FinancialProfile }>("/profile", { method: "PUT", body: JSON.stringify(body) }),
  addLaunch: (body: { type: LaunchType; name: string; amount: number; dueDate: string; installmentsRemaining?: number; category?: string | null }) => request<{ launch: Launch }>("/launches", { method: "POST", body: JSON.stringify(body) }),
  updateLaunch: (id: string, body: Partial<Pick<Launch, "status" | "name" | "amount" | "dueDate" | "category">>) => request<{ launch: Launch }>(`/launches/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLaunch: (id: string) => request<void>(`/launches/${id}`, { method: "DELETE" }),
  simulate: (body: { amount: number; installments: number; firstDueDate: string }) => request<{ monthlyInstallment: number; projection: { label: string; balance: number; active: boolean }[]; lowest: number; result: "good" | "attention" | "danger"; scenarios: { installments: number; monthlyInstallment: number; lowest: number; result: "good" | "attention" | "danger"; projection: { label: string; balance: number; active: boolean }[] }[] }>("/simulate", { method: "POST", body: JSON.stringify(body) }),
  recurring: () => request<{ recurring: RecurringCommitment[] }>("/recurring"),
  addRecurring: (body: Omit<RecurringCommitment, "id" | "active">) => request<{ recurring: RecurringCommitment }>("/recurring", { method: "POST", body: JSON.stringify(body) }),
  updateRecurring: (id: string, active: boolean) => request<{ recurring: RecurringCommitment }>(`/recurring/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),
  purchases: () => request<{ purchases: Purchase[] }>("/purchases"),
  addPurchase: (body: { name: string; totalAmount: number; installmentCount: number; firstDueDate: string; category?: string | null }) => request<{ purchaseId: string }>("/purchases", { method: "POST", body: JSON.stringify(body) }),
  updatePurchaseInstallment: (id: string, status: LaunchStatus) => request<{ installment: { id: string; status: LaunchStatus } }>(`/purchase-installments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  diagnosis: () => request<{ diagnosis: Diagnosis; essentialExpenses: EssentialExpense[] }>("/diagnosis"),
  saveDiagnosis: (body: DiagnosisInput) => request<{ updated: true; normalization: { monthlyIncome: number; source: string; warning: string | null } }>("/diagnosis", { method: "PUT", body: JSON.stringify(body) }),
  essentialExpenses: () => request<{ essentialExpenses: EssentialExpense[]; essentialFloor: number }>("/essential-expenses"),
  addEssentialExpense: (body: Omit<EssentialExpense, "id" | "createdAt" | "updatedAt">) => request<{ essentialExpense: EssentialExpense }>("/essential-expenses", { method: "POST", body: JSON.stringify(body) }),
  updateEssentialExpense: (id: string, body: Partial<Omit<EssentialExpense, "id" | "createdAt" | "updatedAt">>) => request<{ essentialExpense: EssentialExpense }>(`/essential-expenses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEssentialExpense: (id: string) => request<void>(`/essential-expenses/${id}`, { method: "DELETE" }),
  debts: () => request<{ debts: Debt[] }>("/debts"),
  addDebt: (body: DebtInput) => request<{ debt: Debt }>("/debts", { method: "POST", body: JSON.stringify(body) }),
  updateDebt: (id: string, body: Partial<DebtInput>) => request<{ debt: Debt }>(`/debts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  debtNegotiations: (debtId: string) => request<{ negotiations: DebtNegotiation[] }>(`/debts/${debtId}/negotiations`),
  addDebtNegotiation: (debtId: string, body: DebtNegotiationInput) => request<{ negotiation: DebtNegotiation }>(`/debts/${debtId}/negotiations`, { method: "POST", body: JSON.stringify(body) }),
  updateDebtNegotiation: (debtId: string, negotiationId: string, body: Partial<DebtNegotiationInput>) => request<{ negotiation: DebtNegotiation }>(`/debts/${debtId}/negotiations/${negotiationId}`, { method: "PATCH", body: JSON.stringify(body) }),
  recoveryPlans: () => request<{ recoveryPlans: RecoveryPlan[] }>("/recovery-plans"),
  addRecoveryPlan: (body: RecoveryPlanInput) => request<{ recoveryPlan: RecoveryPlan }>("/recovery-plans", { method: "POST", body: JSON.stringify(body) }),
  updateRecoveryPlan: (id: string, body: Partial<RecoveryPlanInput>) => request<{ recoveryPlan: RecoveryPlan }>(`/recovery-plans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  activateRecoveryPlan: (id: string) => request<{ recoveryPlan: RecoveryPlan }>(`/recovery-plans/${id}/activate`, { method: "POST" }),
  recalculateRecoveryPlan: (id: string) => request<{ recoveryPlan: RecoveryPlan }>(`/recovery-plans/${id}/recalculate`, { method: "POST" }),
  debtPayments: (debtId: string) => request<{ payments: DebtPayment[] }>(`/debts/${debtId}/payments`),
  addDebtPayment: (debtId: string, body: { amount: number; paidOn: string; source?: PaymentSource; proofReference?: string | null; confirmOverpayment?: boolean }) => request<{ paymentId: string; balanceAfter: number }>(`/debts/${debtId}/payments`, { method: "POST", body: JSON.stringify(body) }),
  reverseDebtPayment: (debtId: string, paymentId: string, reason: string) => request<{ reversed: true; balance: number }>(`/debts/${debtId}/payments/${paymentId}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }),
  weeklyReviews: () => request<{ weeklyReviews: WeeklyReview[] }>("/weekly-reviews"),
  addWeeklyReview: (body: WeeklyReviewInput) => request<{ weeklyReview: WeeklyReview }>("/weekly-reviews", { method: "POST", body: JSON.stringify(body) }),
  updateWeeklyReview: (id: string, body: Partial<Omit<WeeklyReviewInput, "weekStart">>) => request<{ weeklyReview: WeeklyReview }>(`/weekly-reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  actions: (statuses: ActionStatus[] = []) => request<{ actions: ActionItem[] }>(`/actions${statuses.length ? `?status=${encodeURIComponent(statuses.join(","))}` : ""}`),
  updateAction: (id: string, body: Partial<Pick<ActionItem, "status" | "snoozedUntil" | "title" | "detail" | "dueDate">>) => request<{ action: ActionItem }>(`/actions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  monthly: (month: string) => request<MonthlyData>(`/monthly?month=${encodeURIComponent(month)}`),
  addBudget: (body: { category: string; month: string; limit: number }) => request<{ budget: { id: string; category: string; month: string; limit: number } }>("/budgets", { method: "POST", body: JSON.stringify(body) }),
  deleteBudget: (id: string) => request<void>(`/budgets/${id}`, { method: "DELETE" }),
  goals: () => request<{ goals: Goal[] }>("/goals"),
  addGoal: (body: { name: string; target: number; current?: number; dueDate?: string | null }) => request<{ goal: Goal }>("/goals", { method: "POST", body: JSON.stringify(body) }),
  updateGoal: (id: string, body: Partial<Omit<Goal, "id">>) => request<{ goal: Goal }>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  notifications: () => request<{ notifications: Notification[]; unread: number }>("/notifications"),
  markNotificationRead: (id: string) => request<{ notification: Notification }>(`/notifications/${id}/read`, { method: "PATCH" }),
  adminMetrics: () => request<AdminMetrics>("/admin/metrics"),
  adminUsers: (params: { query?: string; status?: string; page?: number; limit?: number } = {}) => request<{ users: User[]; total: number; page: number; limit: number }>(`/admin/users?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== "") as [string, string][]).toString()}`),
  adminUser: (id: string) => request<{ user: User; launches: Launch[] }>(`/admin/users/${id}`),
  updateUserStatus: (id: string, status: UserStatus) => request<{ user: User }>(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
