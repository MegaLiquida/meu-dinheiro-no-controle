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
export type Debt = { id: string; name: string; creditor?: string | null; balance: number; installment: number; dueDay?: number | null; interestRate?: number | null; priority: "essential" | "high" | "normal" | "low"; status: "open" | "negotiating" | "paid"; notes?: string | null };
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
  importCsv: (csv: string) => request<{ imported: number }>("/import/csv", { method: "POST", body: JSON.stringify({ csv }) }),
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
  debts: () => request<{ debts: Debt[] }>("/debts"),
  addDebt: (body: Omit<Debt, "id">) => request<{ debt: Debt }>("/debts", { method: "POST", body: JSON.stringify(body) }),
  updateDebt: (id: string, body: Partial<Omit<Debt, "id">>) => request<{ debt: Debt }>(`/debts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
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
