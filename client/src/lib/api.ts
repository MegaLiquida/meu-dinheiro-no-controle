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
};

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
  dashboard: () => request<Dashboard>("/dashboard"),
  profile: () => request<{ profile: FinancialProfile }>("/profile"),
  saveProfile: (body: FinancialProfile) => request<{ profile: FinancialProfile }>("/profile", { method: "PUT", body: JSON.stringify(body) }),
  addLaunch: (body: { type: LaunchType; name: string; amount: number; dueDate: string; installmentsRemaining?: number }) => request<{ launch: Launch }>("/launches", { method: "POST", body: JSON.stringify(body) }),
  updateLaunch: (id: string, body: Partial<Pick<Launch, "status" | "name" | "amount" | "dueDate">>) => request<{ launch: Launch }>(`/launches/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteLaunch: (id: string) => request<void>(`/launches/${id}`, { method: "DELETE" }),
  simulate: (body: { amount: number; installments: number; firstDueDate: string }) => request<{ monthlyInstallment: number; projection: { label: string; balance: number; active: boolean }[]; lowest: number; result: "good" | "attention" | "danger" }>("/simulate", { method: "POST", body: JSON.stringify(body) }),
  adminMetrics: () => request<AdminMetrics>("/admin/metrics"),
  adminUsers: (params: { query?: string; status?: string; page?: number; limit?: number } = {}) => request<{ users: User[]; total: number; page: number; limit: number }>(`/admin/users?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== "") as [string, string][]).toString()}`),
  adminUser: (id: string) => request<{ user: User; launches: Launch[] }>(`/admin/users/${id}`),
  updateUserStatus: (id: string, status: UserStatus) => request<{ user: User }>(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
