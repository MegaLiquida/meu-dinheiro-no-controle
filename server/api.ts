import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { createSession, destroySession, getUserFromRequest, hashPassword, requireAuth, requireRole, verifyPassword } from "./auth";
import { getDb, withTransaction } from "./db";
import { buildDashboard, buildSimulation, type Launch } from "./domain";

const router = Router();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");
const launchSchema = z.object({
  type: z.enum(["entrada", "conta", "parcela"]),
  name: z.string().trim().min(2).max(120),
  amount: z.coerce.number().finite().nonnegative().max(100_000_000),
  dueDate: dateSchema,
  installmentsRemaining: z.coerce.number().int().positive().max(600).optional(),
});
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(200) });
const registerSchema = loginSchema.extend({ name: z.string().trim().min(2).max(120) });

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

function serializeLaunch(row: { id: string; type: Launch["type"]; name: string; amount_cents: number; due_date: string | Date; status: Launch["status"]; installments_remaining?: number | null; paid_at?: Date | string | null }): Launch {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    amount: money(row.amount_cents),
    dueDate: typeof row.due_date === "string" ? row.due_date.slice(0, 10) : row.due_date.toISOString().slice(0, 10),
    status: row.status,
    installmentsRemaining: row.installments_remaining ?? undefined,
    paidAt: row.paid_at ? typeof row.paid_at === "string" ? row.paid_at : row.paid_at.toISOString() : null,
  };
}

function getLaunches(userId: string) {
  return getDb().query(
    `SELECT id, type, name, amount_cents, due_date, status, installments_remaining, paid_at
       FROM financial_launches
      WHERE user_id = $1
      ORDER BY due_date ASC, created_at ASC`,
    [userId],
  );
}

async function recordAudit(actorUserId: string | null, targetUserId: string | null, action: string, metadata: Record<string, unknown> = {}) {
  await getDb().query(
    `INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), actorUserId, targetUserId, action, JSON.stringify(metadata)],
  );
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

router.get("/dashboard", requireAuth, asyncRoute(async (request, response) => {
  const result = await getLaunches(request.user!.id);
  const launches = result.rows.map(serializeLaunch);
  response.json(buildDashboard(launches));
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
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, type, name, amount_cents, due_date, status, installments_remaining, paid_at`,
    [randomUUID(), request.user!.id, data.type, data.name, cents(data.amount), data.dueDate, data.type === "parcela" ? data.installmentsRemaining ?? 1 : null],
  );
  response.status(201).json({ launch: serializeLaunch(result.rows[0]) });
}));

router.patch("/launches/:id", requireAuth, asyncRoute(async (request, response) => {
  const body = z.object({
    status: z.enum(["pending", "paid"]).optional(),
    name: z.string().trim().min(2).max(120).optional(),
    amount: z.coerce.number().finite().nonnegative().max(100_000_000).optional(),
    dueDate: dateSchema.optional(),
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
            paid_at = CASE WHEN $3 = 'paid' THEN COALESCE(paid_at, NOW()) WHEN $3 = 'pending' THEN NULL ELSE paid_at END,
            updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, type, name, amount_cents, due_date, status, installments_remaining, paid_at`,
    [request.params.id, request.user!.id, next.status ?? null, next.name ?? null, next.amount === undefined ? null : cents(next.amount), next.dueDate ?? null],
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
  response.json(buildSimulation(result.rows.map(serializeLaunch), parsed.data.amount, parsed.data.installments, parsed.data.firstDueDate));
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
  await getDb().query(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'owner')",
    [randomUUID(), name, email, await hashPassword(password)],
  );
  console.log(`Seeded owner account ${email}`);
}
