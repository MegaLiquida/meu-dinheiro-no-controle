import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { createSession, destroySession, getUserFromRequest, hashPassword, requireAuth, requireRole, verifyPassword } from "./auth";
import { getDb, withTransaction } from "./db";
import { buildDashboard, buildSimulation, buildSimulationScenarios, todayIso, type FinancialProfile, type IncomeFrequency, type Launch } from "./domain";
import { addMonthsKeepingDay, monthRange, splitCents } from "./planning";

const router = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");
const launchSchema = z.object({
  type: z.enum(["entrada", "conta", "parcela"]),
  name: z.string().trim().min(2).max(120),
  amount: z.coerce.number().finite().nonnegative().max(100_000_000),
  dueDate: dateSchema,
  installmentsRemaining: z.coerce.number().int().positive().max(600).optional(),
  category: z.string().trim().max(60).optional().nullable(),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(200) });
const registerSchema = loginSchema.extend({ name: z.string().trim().min(2).max(120) });
const profileSchema = z.object({
  monthlyIncome: z.coerce.number().finite().nonnegative().max(100_000_000),
  incomeFrequency: z.enum(["monthly", "biweekly", "weekly", "irregular"]),
  nextIncomeDate: dateSchema.nullable(),
  currentBalance: z.coerce.number().finite().min(-100_000_000).max(100_000_000),
  balanceAsOfDate: dateSchema,
  safetyMargin: z.coerce.number().finite().nonnegative().max(100_000_000),
});
const recurringSchema = z.object({
  kind: z.enum(["entrada", "conta"]),
  name: z.string().trim().min(2).max(120),
  amount: z.coerce.number().finite().nonnegative().max(100_000_000),
  dueDay: z.coerce.number().int().min(1).max(31),
  startDate: dateSchema,
  category: z.string().trim().max(60).optional().nullable(),
});
const purchaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  totalAmount: z.coerce.number().finite().positive().max(100_000_000),
  installmentCount: z.coerce.number().int().positive().max(600),
  firstDueDate: dateSchema,
  category: z.string().trim().max(60).optional().nullable(),
});
const debtSchema = z.object({
  name: z.string().trim().min(2).max(120),
  creditor: z.string().trim().max(120).optional().nullable(),
  balance: z.coerce.number().finite().nonnegative().max(100_000_000),
  installment: z.coerce.number().finite().nonnegative().max(100_000_000).default(0),
  dueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  interestRate: z.coerce.number().finite().nonnegative().max(100_000).optional().nullable(),
  priority: z.enum(["essential", "high", "normal", "low"]).default("normal"),
  status: z.enum(["open", "negotiating", "paid"]).default("open"),
  notes: z.string().trim().max(1000).optional().nullable(),
});
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Use um mês no formato AAAA-MM.");
const budgetSchema = z.object({ category: z.string().trim().min(2).max(60), month: monthSchema, limit: z.coerce.number().finite().nonnegative().max(100_000_000) });
const goalSchema = z.object({ name: z.string().trim().min(2).max(120), target: z.coerce.number().finite().positive().max(100_000_000), current: z.coerce.number().finite().nonnegative().max(100_000_000).default(0), dueDate: dateSchema.nullable().optional(), status: z.enum(["active", "completed", "paused"]).default("active") });
const changePasswordSchema = z.object({ currentPassword: z.string().min(8).max(200), newPassword: z.string().min(8).max(200) });

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function requireDatabase(request: Parameters<RequestHandler>[0], response: Parameters<RequestHandler>[1]) {
  if (!process.env.DATABASE_URL) {
    response.status(503).json({ message: "Banco de dados não configurado. Defina DATABASE_URL no Render." });
    return false;
  }
  return true;
}

function validDate(value: string) {
  if (!dateSchema.safeParse(value).success) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

function money(amountCents: number) {
  return amountCents / 100;
}

function serializeUser(row: { id: string; name: string; email: string; role: string; status: string; created_at?: Date | string; updated_at?: Date | string }) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeLaunch(row: { id: string; type: Launch["type"]; name: string; amount_cents: number; due_date: string | Date; status: Launch["status"]; installments_remaining?: number | null; paid_at?: Date | string | null; recurring_id?: string | null; purchase_installment_id?: string | null; category?: string | null }): Launch {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    amount: money(row.amount_cents),
    dueDate: typeof row.due_date === "string" ? row.due_date.slice(0, 10) : row.due_date.toISOString().slice(0, 10),
    status: row.status,
    installmentsRemaining: row.installments_remaining ?? undefined,
    paidAt: row.paid_at ? typeof row.paid_at === "string" ? row.paid_at : row.paid_at.toISOString() : null,
    recurringId: row.recurring_id ?? null,
    purchaseInstallmentId: row.purchase_installment_id ?? null,
    category: row.category ?? null,
  };
}

function serializeProfile(row: { monthly_income_cents: number; income_frequency: IncomeFrequency; next_income_date: string | Date | null; current_balance_cents: number; balance_as_of_date: string | Date; safety_margin_cents: number; onboarding_completed: boolean }): FinancialProfile {
  return {
    monthlyIncome: money(row.monthly_income_cents),
    incomeFrequency: row.income_frequency,
    nextIncomeDate: row.next_income_date ? typeof row.next_income_date === "string" ? row.next_income_date.slice(0, 10) : row.next_income_date.toISOString().slice(0, 10) : null,
    currentBalance: money(row.current_balance_cents),
    balanceAsOfDate: typeof row.balance_as_of_date === "string" ? row.balance_as_of_date.slice(0, 10) : row.balance_as_of_date.toISOString().slice(0, 10),
    safetyMargin: money(row.safety_margin_cents),
    onboardingCompleted: row.onboarding_completed,
  };
}

async function getProfile(userId: string) {
  const result = await getDb().query(
    "SELECT monthly_income_cents, income_frequency, next_income_date, current_balance_cents, balance_as_of_date, safety_margin_cents, onboarding_completed FROM user_profiles WHERE user_id = $1",
    [userId],
  );
  return result.rowCount ? serializeProfile(result.rows[0]) : null;
}

function fallbackProfile(launches: Launch[]): FinancialProfile {
  const today = todayIso();
  const income = launches.filter((launch) => launch.type === "entrada" && launch.status === "paid").reduce((sum, launch) => sum + launch.amount, 0);
  const expenses = launches.filter((launch) => launch.type !== "entrada" && launch.status === "paid").reduce((sum, launch) => sum + launch.amount, 0);
  return {
    monthlyIncome: launches.filter((launch) => launch.type === "entrada").reduce((sum, launch) => sum + launch.amount, 0),
    incomeFrequency: "monthly",
    nextIncomeDate: launches.find((launch) => launch.type === "entrada" && launch.dueDate >= today)?.dueDate ?? null,
    currentBalance: income - expenses,
    balanceAsOfDate: today,
    safetyMargin: 0,
    onboardingCompleted: false,
  };
}

function getLaunches(userId: string) {
  return getDb().query(
    `SELECT id, type, name, amount_cents, due_date, status, installments_remaining, paid_at, recurring_id, purchase_installment_id, category
       FROM financial_launches
      WHERE user_id = $1
      ORDER BY due_date ASC, created_at ASC`,
    [userId],
  );
}

async function syncNotifications(userId: string) {
  const result = await getLaunches(userId);
  const launches = result.rows.map(serializeLaunch);
  const profile = await getProfile(userId);
  const dashboard = buildDashboard(launches, todayIso(), profile ?? fallbackProfile(launches));
  for (const alert of dashboard.alerts) {
    await getDb().query(
      `INSERT INTO notifications (id, user_id, dedupe_key, tone, title, detail)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, dedupe_key) DO UPDATE SET tone = EXCLUDED.tone, title = EXCLUDED.title, detail = EXCLUDED.detail, updated_at = NOW()`,
      [randomUUID(), userId, alert.id, alert.tone, alert.title, alert.detail],
    );
  }
}

function serializeNotification(row: Record<string, unknown>) {
  return { id: row.id, tone: row.tone, title: row.title, detail: row.detail, read: Boolean(row.read_at), createdAt: row.created_at };
}

async function recordAudit(actorUserId: string | null, targetUserId: string | null, action: string, metadata: Record<string, unknown> = {}) {
  await getDb().query(
    `INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), actorUserId, targetUserId, action, JSON.stringify(metadata)],
  );
}

async function generateRecurringLaunches(userId: string, recurringId: string) {
  const source = await getDb().query("SELECT kind, name, amount_cents, due_day, start_date, category FROM recurring_commitments WHERE id = $1 AND user_id = $2 AND active = TRUE", [recurringId, userId]);
  if (!source.rowCount) return;
  const row = source.rows[0];
  const today = todayIso();
  let firstDue = addMonthsKeepingDay(typeof row.start_date === "string" ? row.start_date.slice(0, 10) : row.start_date.toISOString().slice(0, 10), 0, Number(row.due_day));
  while (firstDue < today) firstDue = addMonthsKeepingDay(firstDue, 1, Number(row.due_day));
  for (let index = 0; index < 24; index += 1) {
    const dueDate = addMonthsKeepingDay(firstDue, index, Number(row.due_day));
    await getDb().query(
      `INSERT INTO financial_launches (id, user_id, type, name, amount_cents, due_date, recurring_id, category)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE NOT EXISTS (SELECT 1 FROM financial_launches WHERE recurring_id = $7 AND due_date = $6)`,
      [randomUUID(), userId, row.kind === "entrada" ? "entrada" : "conta", row.name, row.amount_cents, dueDate, recurringId, row.category ?? null],
    );
  }
}

function serializeRecurring(row: Record<string, unknown>) {
  const date = row.start_date as string | Date;
  return { id: row.id, kind: row.kind, name: row.name, amount: money(Number(row.amount_cents)), dueDay: Number(row.due_day), startDate: typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10), category: row.category ?? null, active: row.active };
}

function serializePurchase(row: Record<string, unknown>) {
  const date = row.first_due_date as string | Date;
  return { id: row.id, name: row.name, totalAmount: money(Number(row.total_cents)), installmentCount: Number(row.installment_count), firstDueDate: typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10), category: row.category ?? null, createdAt: row.created_at };
}

function serializeDebt(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, creditor: row.creditor ?? null, balance: money(Number(row.balance_cents)), installment: money(Number(row.installment_cents)), dueDay: row.due_day == null ? null : Number(row.due_day), interestRate: row.interest_rate == null ? null : Number(row.interest_rate), priority: row.priority, status: row.status, notes: row.notes ?? null, createdAt: row.created_at, updatedAt: row.updated_at };
}

router.get("/health", asyncRoute(async (_request, response) => {
  if (!process.env.DATABASE_URL) {
    response.status(503).json({ ok: false, database: "not_configured" });
    return;
  }
  await getDb().query("SELECT 1");
  response.json({ ok: true, database: "connected" });
}));

router.post("/auth/register", asyncRoute(async (request, response) => {
  if (!requireDatabase(request, response)) return;
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Confira nome, e-mail e senha.", issues: parsed.error.flatten() });
    return;
  }
  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const userId = randomUUID();
  try {
    const passwordHash = await hashPassword(password);
    const result = await getDb().query(
      `INSERT INTO users (id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, status, created_at, updated_at`,
      [userId, name, normalizedEmail, passwordHash],
    );
    await getDb().query("INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    await createSession(userId, response);
    response.status(201).json({ user: serializeUser(result.rows[0]) });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      response.status(409).json({ message: "Este e-mail já está cadastrado." });
      return;
    }
    throw error;
  }
}));

router.post("/auth/login", asyncRoute(async (request, response) => {
  if (!requireDatabase(request, response)) return;
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Informe um e-mail e uma senha válidos." });
    return;
  }
  const result = await getDb().query<{
    id: string; name: string; email: string; role: string; status: string; password_hash: string; created_at: Date; updated_at: Date;
  }>(
    `SELECT id, name, email, role, status, password_hash, created_at, updated_at
       FROM users WHERE email = $1`,
    [parsed.data.email.toLowerCase()],
  );
  const user = result.rows[0];
  if (!user || user.status !== "active" || !(await verifyPassword(parsed.data.password, user.password_hash))) {
    response.status(401).json({ message: "E-mail ou senha inválidos." });
    return;
  }
  await createSession(user.id, response);
  await recordAudit(user.id, user.id, "auth_login");
  response.json({ user: serializeUser(user) });
}));

router.post("/auth/logout", asyncRoute(async (request, response) => {
  if (!process.env.DATABASE_URL) {
    response.status(204).end();
    return;
  }
  await destroySession(request, response);
  response.status(204).end();
}));

router.get("/auth/me", asyncRoute(async (request, response) => {
  if (!process.env.DATABASE_URL) {
    response.status(401).json({ message: "Banco de dados não configurado." });
    return;
  }
  const user = await getUserFromRequest(request);
  if (!user) {
    response.status(401).json({ message: "Sua sessão não está autenticada." });
    return;
  }
  response.json({ user });
}));

router.post("/auth/change-password", requireAuth, asyncRoute(async (request, response) => {
  const parsed = changePasswordSchema.safeParse(request.body);
  if (!parsed.success || parsed.data.currentPassword === parsed.data.newPassword) {
    response.status(400).json({ message: "Informe uma nova senha diferente da atual, com pelo menos 8 caracteres." });
    return;
  }
  const current = await getDb().query("SELECT password_hash FROM users WHERE id = $1 AND status = 'active'", [request.user!.id]);
  if (!current.rowCount || !(await verifyPassword(parsed.data.currentPassword, current.rows[0].password_hash))) {
    response.status(401).json({ message: "A senha atual não confere." });
    return;
  }
  await getDb().query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1", [request.user!.id, await hashPassword(parsed.data.newPassword)]);
  await getDb().query("DELETE FROM sessions WHERE user_id = $1", [request.user!.id]);
  await createSession(request.user!.id, response);
  await recordAudit(request.user!.id, request.user!.id, "auth_password_changed");
  response.status(204).end();
}));

router.get("/profile", requireAuth, asyncRoute(async (request, response) => {
  const profile = await getProfile(request.user!.id);
  response.json({ profile: profile ?? { monthlyIncome: 0, incomeFrequency: "monthly", nextIncomeDate: null, currentBalance: 0, balanceAsOfDate: todayIso(), safetyMargin: 0, onboardingCompleted: false } });
}));

router.put("/profile", requireAuth, asyncRoute(async (request, response) => {
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success || (parsed.data.nextIncomeDate && !validDate(parsed.data.nextIncomeDate)) || !validDate(parsed.data.balanceAsOfDate)) {
    response.status(400).json({ message: "Confira renda, saldo, datas e margem de segurança." });
    return;
  }
  const data = parsed.data;
  const result = await getDb().query(
    `INSERT INTO user_profiles (user_id, monthly_income_cents, income_frequency, next_income_date, current_balance_cents, balance_as_of_date, safety_margin_cents, onboarding_completed, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
     ON CONFLICT (user_id) DO UPDATE SET monthly_income_cents = EXCLUDED.monthly_income_cents, income_frequency = EXCLUDED.income_frequency, next_income_date = EXCLUDED.next_income_date, current_balance_cents = EXCLUDED.current_balance_cents, balance_as_of_date = EXCLUDED.balance_as_of_date, safety_margin_cents = EXCLUDED.safety_margin_cents, onboarding_completed = TRUE, updated_at = NOW()
     RETURNING monthly_income_cents, income_frequency, next_income_date, current_balance_cents, balance_as_of_date, safety_margin_cents, onboarding_completed`,
    [request.user!.id, cents(data.monthlyIncome), data.incomeFrequency, data.nextIncomeDate, cents(data.currentBalance), data.balanceAsOfDate, cents(data.safetyMargin)],
  );
  await recordAudit(request.user!.id, request.user!.id, "financial_profile_updated");
  response.json({ profile: serializeProfile(result.rows[0]) });
}));

router.get("/recurring", requireAuth, asyncRoute(async (request, response) => {
  const result = await getDb().query("SELECT id, kind, name, amount_cents, due_day, start_date, category, active FROM recurring_commitments WHERE user_id = $1 ORDER BY active DESC, due_day ASC, name ASC", [request.user!.id]);
  response.json({ recurring: result.rows.map(serializeRecurring) });
}));

router.post("/recurring", requireAuth, asyncRoute(async (request, response) => {
  const parsed = recurringSchema.safeParse(request.body);
  if (!parsed.success || !validDate(parsed.data.startDate)) {
    response.status(400).json({ message: "Confira tipo, nome, valor, dia e data de início." });
    return;
  }
  const data = parsed.data;
  const recurringId = randomUUID();
  const result = await getDb().query(
    `INSERT INTO recurring_commitments (id, user_id, kind, name, amount_cents, due_day, start_date, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, kind, name, amount_cents, due_day, start_date, category, active`,
    [recurringId, request.user!.id, data.kind, data.name, cents(data.amount), data.dueDay, data.startDate, data.category ?? null],
  );
  await generateRecurringLaunches(request.user!.id, recurringId);
  await recordAudit(request.user!.id, request.user!.id, "recurring_commitment_created", { recurringId });
  response.status(201).json({ recurring: serializeRecurring(result.rows[0]) });
}));

router.patch("/recurring/:id", requireAuth, asyncRoute(async (request, response) => {
  const parsed = z.object({ active: z.boolean() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Informe um estado válido para o compromisso." });
    return;
  }
  const result = await getDb().query("UPDATE recurring_commitments SET active = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, kind, name, amount_cents, due_day, start_date, category, active", [request.params.id, request.user!.id, parsed.data.active]);
  if (!result.rowCount) {
    response.status(404).json({ message: "Compromisso recorrente não encontrado." });
    return;
  }
  if (parsed.data.active) await generateRecurringLaunches(request.user!.id, request.params.id);
  response.json({ recurring: serializeRecurring(result.rows[0]) });
}));

router.get("/purchases", requireAuth, asyncRoute(async (request, response) => {
  const purchases = await getDb().query("SELECT id, name, total_cents, installment_count, first_due_date, category, created_at FROM purchases WHERE user_id = $1 ORDER BY created_at DESC", [request.user!.id]);
  const installments = await getDb().query("SELECT id, purchase_id, installment_number, amount_cents, due_date, status, paid_at FROM purchase_installments WHERE user_id = $1 ORDER BY due_date ASC", [request.user!.id]);
  response.json({ purchases: purchases.rows.map((row) => ({ ...serializePurchase(row), installments: installments.rows.filter((item) => item.purchase_id === row.id).map((item) => ({ id: item.id, installmentNumber: Number(item.installment_number), amount: money(Number(item.amount_cents)), dueDate: typeof item.due_date === "string" ? item.due_date.slice(0, 10) : item.due_date.toISOString().slice(0, 10), status: item.status, paidAt: item.paid_at })) })) });
}));

router.post("/purchases", requireAuth, asyncRoute(async (request, response) => {
  const parsed = purchaseSchema.safeParse(request.body);
  if (!parsed.success || !validDate(parsed.data.firstDueDate)) {
    response.status(400).json({ message: "Confira nome, valor total, parcelas e data da primeira cobrança." });
    return;
  }
  const data = parsed.data;
  const purchaseId = randomUUID();
  const installmentAmounts = splitCents(cents(data.totalAmount), data.installmentCount);
  await withTransaction(async (client) => {
    await client.query("INSERT INTO purchases (id, user_id, name, total_cents, installment_count, first_due_date, category) VALUES ($1, $2, $3, $4, $5, $6, $7)", [purchaseId, request.user!.id, data.name, cents(data.totalAmount), data.installmentCount, data.firstDueDate, data.category ?? null]);
    for (let index = 0; index < data.installmentCount; index += 1) {
      const installmentId = randomUUID();
      const dueDate = addMonthsKeepingDay(data.firstDueDate, index);
      await client.query("INSERT INTO purchase_installments (id, purchase_id, user_id, installment_number, amount_cents, due_date) VALUES ($1, $2, $3, $4, $5, $6)", [installmentId, purchaseId, request.user!.id, index + 1, installmentAmounts[index], dueDate]);
      await client.query("INSERT INTO financial_launches (id, user_id, type, name, amount_cents, due_date, installments_remaining, purchase_installment_id, category) VALUES ($1, $2, 'parcela', $3, $4, $5, $6, $7, $8)", [randomUUID(), request.user!.id, `${data.name} · parcela ${index + 1}/${data.installmentCount}`, installmentAmounts[index], dueDate, data.installmentCount - index, installmentId, data.category ?? null]);
    }
  });
  await recordAudit(request.user!.id, request.user!.id, "purchase_created", { purchaseId, installmentCount: data.installmentCount });
  response.status(201).json({ purchaseId });
}));

router.patch("/purchase-installments/:id", requireAuth, asyncRoute(async (request, response) => {
  const parsed = z.object({ status: z.enum(["pending", "paid"]) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Status de parcela inválido." });
    return;
  }
  const result = await withTransaction(async (client) => {
    const installment = await client.query("UPDATE purchase_installments SET status = $3, paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END WHERE id = $1 AND user_id = $2 RETURNING id, status", [request.params.id, request.user!.id, parsed.data.status]);
    if (!installment.rowCount) return null;
    await client.query("UPDATE financial_launches SET status = $3, paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END, updated_at = NOW() WHERE purchase_installment_id = $1 AND user_id = $2", [request.params.id, request.user!.id, parsed.data.status]);
    return installment.rows[0];
  });
  if (!result) {
    response.status(404).json({ message: "Parcela não encontrada." });
    return;
  }
  response.json({ installment: result });
}));

router.get("/debts", requireAuth, asyncRoute(async (request, response) => {
  const result = await getDb().query("SELECT id, name, creditor, balance_cents, installment_cents, due_day, interest_rate, priority, status, notes, created_at, updated_at FROM debts WHERE user_id = $1 ORDER BY CASE priority WHEN 'essential' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, balance_cents DESC", [request.user!.id]);
  response.json({ debts: result.rows.map(serializeDebt) });
}));

router.post("/debts", requireAuth, asyncRoute(async (request, response) => {
  const parsed = debtSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Confira os dados da dívida." });
    return;
  }
  const data = parsed.data;
  const result = await getDb().query("INSERT INTO debts (id, user_id, name, creditor, balance_cents, installment_cents, due_day, interest_rate, priority, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, name, creditor, balance_cents, installment_cents, due_day, interest_rate, priority, status, notes, created_at, updated_at", [randomUUID(), request.user!.id, data.name, data.creditor ?? null, cents(data.balance), cents(data.installment), data.dueDay ?? null, data.interestRate ?? null, data.priority, data.status, data.notes ?? null]);
  response.status(201).json({ debt: serializeDebt(result.rows[0]) });
}));

router.patch("/debts/:id", requireAuth, asyncRoute(async (request, response) => {
  const parsed = debtSchema.partial().safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Dados de atualização da dívida inválidos." });
    return;
  }
  const data = parsed.data;
  const result = await getDb().query("UPDATE debts SET name = COALESCE($3, name), creditor = COALESCE($4, creditor), balance_cents = COALESCE($5, balance_cents), installment_cents = COALESCE($6, installment_cents), due_day = COALESCE($7, due_day), interest_rate = COALESCE($8, interest_rate), priority = COALESCE($9, priority), status = COALESCE($10, status), notes = COALESCE($11, notes), updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, name, creditor, balance_cents, installment_cents, due_day, interest_rate, priority, status, notes, created_at, updated_at", [request.params.id, request.user!.id, data.name ?? null, data.creditor ?? null, data.balance === undefined ? null : cents(data.balance), data.installment === undefined ? null : cents(data.installment), data.dueDay ?? null, data.interestRate ?? null, data.priority ?? null, data.status ?? null, data.notes ?? null]);
  if (!result.rowCount) {
    response.status(404).json({ message: "Dívida não encontrada." });
    return;
  }
  response.json({ debt: serializeDebt(result.rows[0]) });
}));

router.get("/monthly", requireAuth, asyncRoute(async (request, response) => {
  const month = typeof request.query.month === "string" && monthSchema.safeParse(request.query.month).success ? request.query.month : todayIso().slice(0, 7);
  const range = monthRange(month);
  const result = await getDb().query("SELECT id, type, name, amount_cents, due_date, status, installments_remaining, paid_at, recurring_id, purchase_installment_id, category FROM financial_launches WHERE user_id = $1 AND due_date BETWEEN $2 AND $3 ORDER BY due_date ASC", [request.user!.id, range.start, range.end]);
  const launches = result.rows.map(serializeLaunch);
  const income = launches.filter((launch) => launch.type === "entrada");
  const expenses = launches.filter((launch) => launch.type !== "entrada");
  const plannedIncome = income.reduce((sum, launch) => sum + launch.amount, 0);
  const plannedExpenses = expenses.reduce((sum, launch) => sum + launch.amount, 0);
  const realizedIncome = income.filter((launch) => launch.status === "paid").reduce((sum, launch) => sum + launch.amount, 0);
  const realizedExpenses = expenses.filter((launch) => launch.status === "paid").reduce((sum, launch) => sum + launch.amount, 0);
  const categories = Object.entries(expenses.reduce<Record<string, number>>((totals, launch) => { const key = launch.category || "Sem categoria"; totals[key] = (totals[key] ?? 0) + launch.amount; return totals; }, {})).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  const budgets = await getDb().query("SELECT id, category, month, limit_cents FROM budget_limits WHERE user_id = $1 AND month = $2 ORDER BY category ASC", [request.user!.id, month]);
  const goals = await getDb().query("SELECT id, name, target_cents, current_cents, due_date, status FROM financial_goals WHERE user_id = $1 ORDER BY status ASC, created_at DESC", [request.user!.id]);
  response.json({ month, launches, summary: { plannedIncome, plannedExpenses, plannedBalance: plannedIncome - plannedExpenses, realizedIncome, realizedExpenses, realizedBalance: realizedIncome - realizedExpenses }, categories, budgets: budgets.rows.map((row) => ({ id: row.id, category: row.category, month: row.month, limit: money(Number(row.limit_cents)) })), goals: goals.rows.map((row) => ({ id: row.id, name: row.name, target: money(Number(row.target_cents)), current: money(Number(row.current_cents)), dueDate: row.due_date, status: row.status })) });
}));

router.post("/budgets", requireAuth, asyncRoute(async (request, response) => {
  const parsed = budgetSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ message: "Informe categoria, mês e limite válidos." }); return; }
  const data = parsed.data;
  const result = await getDb().query("INSERT INTO budget_limits (id, user_id, category, month, limit_cents) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, category, month) DO UPDATE SET limit_cents = EXCLUDED.limit_cents RETURNING id, category, month, limit_cents", [randomUUID(), request.user!.id, data.category, data.month, cents(data.limit)]);
  response.status(201).json({ budget: { id: result.rows[0].id, category: result.rows[0].category, month: result.rows[0].month, limit: money(Number(result.rows[0].limit_cents)) } });
}));

router.delete("/budgets/:id", requireAuth, asyncRoute(async (request, response) => {
  const result = await getDb().query("DELETE FROM budget_limits WHERE id = $1 AND user_id = $2", [request.params.id, request.user!.id]);
  if (!result.rowCount) { response.status(404).json({ message: "Limite não encontrado." }); return; }
  response.status(204).end();
}));

router.get("/goals", requireAuth, asyncRoute(async (request, response) => {
  const result = await getDb().query("SELECT id, name, target_cents, current_cents, due_date, status, created_at, updated_at FROM financial_goals WHERE user_id = $1 ORDER BY status ASC, created_at DESC", [request.user!.id]);
  response.json({ goals: result.rows.map((row) => ({ id: row.id, name: row.name, target: money(Number(row.target_cents)), current: money(Number(row.current_cents)), dueDate: row.due_date, status: row.status })) });
}));

router.post("/goals", requireAuth, asyncRoute(async (request, response) => {
  const parsed = goalSchema.safeParse(request.body);
  if (!parsed.success || (parsed.data.dueDate && !validDate(parsed.data.dueDate))) { response.status(400).json({ message: "Confira nome, objetivo, valor e prazo." }); return; }
  const data = parsed.data;
  const result = await getDb().query("INSERT INTO financial_goals (id, user_id, name, target_cents, current_cents, due_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, target_cents, current_cents, due_date, status", [randomUUID(), request.user!.id, data.name, cents(data.target), cents(data.current), data.dueDate ?? null, data.status]);
  response.status(201).json({ goal: { id: result.rows[0].id, name: result.rows[0].name, target: money(Number(result.rows[0].target_cents)), current: money(Number(result.rows[0].current_cents)), dueDate: result.rows[0].due_date, status: result.rows[0].status } });
}));

router.patch("/goals/:id", requireAuth, asyncRoute(async (request, response) => {
  const parsed = goalSchema.partial().safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ message: "Dados da meta inválidos." }); return; }
  const data = parsed.data;
  const result = await getDb().query("UPDATE financial_goals SET name = COALESCE($3, name), target_cents = COALESCE($4, target_cents), current_cents = COALESCE($5, current_cents), due_date = COALESCE($6, due_date), status = COALESCE($7, status), updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, name, target_cents, current_cents, due_date, status", [request.params.id, request.user!.id, data.name ?? null, data.target === undefined ? null : cents(data.target), data.current === undefined ? null : cents(data.current), data.dueDate ?? null, data.status ?? null]);
  if (!result.rowCount) { response.status(404).json({ message: "Meta não encontrada." }); return; }
  response.json({ goal: { id: result.rows[0].id, name: result.rows[0].name, target: money(Number(result.rows[0].target_cents)), current: money(Number(result.rows[0].current_cents)), dueDate: result.rows[0].due_date, status: result.rows[0].status } });
}));

router.get("/notifications", requireAuth, asyncRoute(async (request, response) => {
  await syncNotifications(request.user!.id);
  const result = await getDb().query("SELECT id, tone, title, detail, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY read_at NULLS FIRST, created_at DESC LIMIT 30", [request.user!.id]);
  response.json({ notifications: result.rows.map(serializeNotification), unread: result.rows.filter((row) => !row.read_at).length });
}));

router.patch("/notifications/:id/read", requireAuth, asyncRoute(async (request, response) => {
  const result = await getDb().query("UPDATE notifications SET read_at = COALESCE(read_at, NOW()), updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id, tone, title, detail, read_at, created_at", [request.params.id, request.user!.id]);
  if (!result.rowCount) { response.status(404).json({ message: "Notificação não encontrada." }); return; }
  response.json({ notification: serializeNotification(result.rows[0]) });
}));

router.get("/export", requireAuth, asyncRoute(async (request, response) => {
  const [profile, launches, recurring, purchases, debts, goals] = await Promise.all([
    getProfile(request.user!.id),
    getLaunches(request.user!.id),
    getDb().query("SELECT id, kind, name, amount_cents, due_day, start_date, category, active FROM recurring_commitments WHERE user_id = $1 ORDER BY due_day", [request.user!.id]),
    getDb().query("SELECT id, name, total_cents, installment_count, first_due_date, category, created_at FROM purchases WHERE user_id = $1 ORDER BY created_at", [request.user!.id]),
    getDb().query("SELECT id, name, creditor, balance_cents, installment_cents, due_day, interest_rate, priority, status, notes, created_at, updated_at FROM debts WHERE user_id = $1 ORDER BY created_at", [request.user!.id]),
    getDb().query("SELECT id, name, target_cents, current_cents, due_date, status, created_at, updated_at FROM financial_goals WHERE user_id = $1 ORDER BY created_at", [request.user!.id]),
  ]);
  response.setHeader("Content-Disposition", `attachment; filename=meu-dinheiro-no-controle-${todayIso()}.json`);
  response.json({ exportedAt: new Date().toISOString(), profile, launches: launches.rows.map(serializeLaunch), recurring: recurring.rows.map(serializeRecurring), purchases: purchases.rows.map(serializePurchase), debts: debts.rows.map(serializeDebt), goals: goals.rows.map((row) => ({ id: row.id, name: row.name, target: money(Number(row.target_cents)), current: money(Number(row.current_cents)), dueDate: row.due_date, status: row.status })) });
}));

router.get("/dashboard", requireAuth, asyncRoute(async (request, response) => {
  const result = await getLaunches(request.user!.id);
  const launches = result.rows.map(serializeLaunch);
  const profile = await getProfile(request.user!.id);
  response.json(buildDashboard(launches, todayIso(), profile ?? fallbackProfile(launches)));
}));

router.get("/launches", requireAuth, asyncRoute(async (request, response) => {
  const result = await getLaunches(request.user!.id);
  response.json({ launches: result.rows.map(serializeLaunch) });
}));

router.post("/launches", requireAuth, asyncRoute(async (request, response) => {
  const parsed = launchSchema.safeParse(request.body);
  if (!parsed.success || !validDate(parsed.data?.dueDate ?? "")) {
    response.status(400).json({ message: "Confira o tipo, nome, valor e data do lançamento." });
    return;
  }
  const data = parsed.data;
  const result = await getDb().query(
    `INSERT INTO financial_launches (id, user_id, type, name, amount_cents, due_date, installments_remaining)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, type, name, amount_cents, due_date, status, installments_remaining, paid_at, recurring_id, purchase_installment_id, category`,
    [randomUUID(), request.user!.id, data.type, data.name, cents(data.amount), data.dueDate, data.type === "parcela" ? data.installmentsRemaining ?? 1 : null, data.category ?? null],
  );
  response.status(201).json({ launch: serializeLaunch(result.rows[0]) });
}));

router.patch("/launches/:id", requireAuth, asyncRoute(async (request, response) => {
  const body = z.object({
    status: z.enum(["pending", "paid"]).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    amount: z.coerce.number().finite().nonnegative().max(100_000_000).optional(),
    dueDate: dateSchema.optional(),
    category: z.string().trim().max(60).nullable().optional(),
  }).safeParse(request.body);
  if (!body.success || (body.data.dueDate && !validDate(body.data.dueDate))) {
    response.status(400).json({ message: "Dados de atualização inválidos." });
    return;
  }
  const current = await getDb().query("SELECT * FROM financial_launches WHERE id = $1 AND user_id = $2", [request.params.id, request.user!.id]);
  if (!current.rowCount) {
    response.status(404).json({ message: "Lançamento não encontrado." });
    return;
  }
  const next = body.data;
  const result = await getDb().query(
    `UPDATE financial_launches
        SET status = COALESCE($3, status),
            name = COALESCE($4, name),
            amount_cents = COALESCE($5, amount_cents),
            due_date = COALESCE($6, due_date),
            category = COALESCE($7, category),
            paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at, NOW()) WHEN $3 = 'pending' THEN NULL ELSE paid_at END,
            updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, type, name, amount_cents, due_date, status, installments_remaining, paid_at, recurring_id, purchase_installment_id`,
      [request.params.id, request.user!.id, next.status ?? null, next.name ?? null, next.amount === undefined ? null : cents(next.amount), next.dueDate ?? null, next.category ?? null],
  );
  response.json({ launch: serializeLaunch(result.rows[0]) });
}));

router.delete("/launches/:id", requireAuth, asyncRoute(async (request, response) => {
  const result = await getDb().query("DELETE FROM financial_launches WHERE id = $1 AND user_id = $2", [request.params.id, request.user!.id]);
  if (!result.rowCount) {
    response.status(404).json({ message: "Lançamento não encontrado." });
    return;
  }
  response.status(204).end();
}));

router.post("/simulate", requireAuth, asyncRoute(async (request, response) => {
  const parsed = z.object({ amount: z.coerce.number().finite().nonnegative(), installments: z.coerce.number().int().positive().max(60), firstDueDate: dateSchema }).safeParse(request.body);
  if (!parsed.success || !validDate(parsed.data.firstDueDate)) {
    response.status(400).json({ message: "Informe valor, parcelas e uma data válida." });
    return;
  }
  const result = await getLaunches(request.user!.id);
  const profile = await getProfile(request.user!.id);
  const launches = result.rows.map(serializeLaunch);
  response.json({ ...buildSimulation(launches, parsed.data.amount, parsed.data.installments, parsed.data.firstDueDate, profile?.safetyMargin), scenarios: buildSimulationScenarios(launches, parsed.data.amount, parsed.data.firstDueDate, profile?.safetyMargin) });
}));

const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("support", "admin", "owner"));

adminRouter.get("/metrics", asyncRoute(async (_request, response) => {
  const result = await getDb().query<{
    users: string; active_users: string; attention_users: string; launches: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
      (SELECT COUNT(DISTINCT user_id) FROM financial_launches WHERE type <> 'entrada' AND status = 'pending' AND due_date < CURRENT_DATE) AS attention_users,
      (SELECT COUNT(*) FROM financial_launches) AS launches
  `);
  const row = result.rows[0];
  response.json({
    users: Number(row.users),
    activeUsers: Number(row.active_users),
    attentionUsers: Number(row.attention_users),
    launches: Number(row.launches),
  });
}));

adminRouter.get("/users", asyncRoute(async (request, response) => {
  const query = typeof request.query.query === "string" ? request.query.query.trim() : "";
  const status = typeof request.query.status === "string" && ["active", "inactive"].includes(request.query.status) ? request.query.status : null;
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
  const offset = (page - 1) * limit;
  const result = await getDb().query(
    `SELECT id, name, email, role, status, created_at, updated_at,
            (SELECT COUNT(*) FROM financial_launches f WHERE f.user_id = u.id) AS launches
       FROM users u
      WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [query, status, limit, offset],
  );
  const count = await getDb().query("SELECT COUNT(*)::int AS total FROM users WHERE ($1 = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR status = $2)", [query, status]);
  response.json({ users: result.rows.map((row) => ({ ...serializeUser(row), launches: Number(row.launches) })), total: count.rows[0].total, page, limit });
}));

adminRouter.get("/users/:id", asyncRoute(async (request, response) => {
  const user = await getDb().query("SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = $1", [request.params.id]);
  if (!user.rowCount) {
    response.status(404).json({ message: "Cliente não encontrado." });
    return;
  }
  const launches = await getLaunches(request.params.id);
  response.json({ user: serializeUser(user.rows[0]), launches: launches.rows.map(serializeLaunch) });
}));

adminRouter.patch("/users/:id/status", requireRole("admin", "owner"), asyncRoute(async (request, response) => {
  const parsed = z.object({ status: z.enum(["active", "inactive"]) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Status inválido." });
    return;
  }
  if (request.params.id === request.user!.id) {
    response.status(400).json({ message: "Você não pode desativar a própria conta." });
    return;
  }
  const result = await getDb().query(
    `UPDATE users SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, email, role, status, created_at, updated_at`,
    [request.params.id, parsed.data.status],
  );
  if (!result.rowCount) {
    response.status(404).json({ message: "Cliente não encontrado." });
    return;
  }
  if (parsed.data.status === "inactive") {
    await getDb().query("DELETE FROM sessions WHERE user_id = $1", [request.params.id]);
  }
  await recordAudit(request.user!.id, request.params.id, `user_status_${parsed.data.status}`);
  response.json({ user: serializeUser(result.rows[0]) });
}));

adminRouter.get("/audit", requireRole("admin", "owner"), asyncRoute(async (request, response) => {
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
  const result = await getDb().query(
    `SELECT a.id, a.action, a.metadata, a.created_at,
            actor.name AS actor_name, target.name AS target_name
       FROM audit_logs a
       LEFT JOIN users actor ON actor.id = a.actor_user_id
       LEFT JOIN users target ON target.id = a.target_user_id
      ORDER BY a.created_at DESC LIMIT $1`,
    [limit],
  );
  response.json({ logs: result.rows });
}));

router.use("/admin", adminRouter);

export default router;

export async function ensureOwnerAccount() {
  if (!process.env.DATABASE_URL) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL/ADMIN_PASSWORD are not set; no owner account was seeded.");
    return;
  }
  const existing = await getDb().query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rowCount) return;
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must contain at least 8 characters.");
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";
  const ownerId = randomUUID();
  await getDb().query(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'owner')",
    [ownerId, name, email, await hashPassword(password)],
  );
  await getDb().query("INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [ownerId]);
  console.log(`Seeded owner account ${email}`);
}
