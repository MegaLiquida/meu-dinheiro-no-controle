import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAuth } from "./auth";
import { getDb, withTransaction } from "./db";
import {
  actionStateDates,
  assertDebtStatus,
  assertPlanCanActivate,
  calculateEssentialFloorCents,
  calculatePaymentBalances,
  calculateSafeCapacityCents,
  deriveDaysOverdue,
  moneyToCents,
  normalizeMonthlyIncomeCents,
  prioritizeDebts,
  todayIso,
  type IncomeFrequency,
} from "./domain";

const router = Router();
router.use(requireAuth);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");
const moneySchema = z.coerce.number().finite().min(0).max(90_000_000_000).refine((value) => {
  try { moneyToCents(value); return true; } catch { return false; }
}, "Use um valor válido, com no máximo duas casas decimais.");
const signedMoneySchema = z.coerce.number().finite().min(-90_000_000_000).max(90_000_000_000).refine((value) => {
  try { moneyToCents(value); return true; } catch { return false; }
}, "Use um valor válido, com no máximo duas casas decimais.");
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const essentialCategorySchema = z.enum(["housing", "utilities", "food", "health", "transport", "education", "child_support", "insurance", "taxes", "other"]);
const debtStatusSchema = z.enum(["open", "negotiating", "paid"]);
const itemStatusSchema = z.enum(["open", "snoozed", "resolved"]);
const negotiationStatusSchema = z.enum(["draft", "offered", "accepted", "rejected", "expired", "cancelled"]);
const planStatusSchema = z.enum(["draft", "active", "paused", "completed", "cancelled"]);
const channelSchema = z.enum(["phone", "email", "chat", "whatsapp", "in_person", "letter", "other"]);
const sourceSchema = z.enum(["manual", "bank_transfer", "cash", "card", "payroll", "other"]);

const diagnosisSchema = z.object({
  incomeAmount: moneySchema.optional(),
  monthlyIncome: moneySchema.optional(),
  incomeFrequency: z.enum(["monthly", "biweekly", "weekly", "irregular"]),
  conservativeMonthlyIncome: moneySchema.optional().nullable(),
  variableIncome: moneySchema.optional().default(0),
  dependents: z.coerce.number().int().min(0).max(100).default(0),
  currentBalance: signedMoneySchema.optional(),
  balanceAsOfDate: dateSchema.optional(),
  nextIncomeDate: dateSchema.optional().nullable(),
  existingMonthlyCommitments: moneySchema.default(0),
  safetyMargin: moneySchema.default(0),
  notes: optionalText(4000),
});

const essentialExpenseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: essentialCategorySchema,
  monthlyAmount: moneySchema,
  required: z.boolean().default(true),
  active: z.boolean().default(true),
});

const debtSchema = z.object({
  name: z.string().trim().min(2).max(120),
  creditor: optionalText(120),
  balance: moneySchema,
  installment: moneySchema.default(0),
  dueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  interestRate: z.coerce.number().finite().min(0).max(100_000).optional().nullable(),
  priority: z.enum(["essential", "high", "normal", "low"]).default("normal"),
  status: debtStatusSchema.default("open"),
  notes: optionalText(4000),
  originalAmount: moneySchema.optional().nullable(),
  debtType: optionalText(60),
  dueDate: dateSchema.optional().nullable(),
  daysOverdue: z.coerce.number().int().min(0).max(100_000).optional().nullable(),
  totalCostRate: z.coerce.number().finite().min(0).max(1_000_000).optional().nullable(),
  remainingInstallments: z.coerce.number().int().min(0).max(600).optional().nullable(),
  secured: z.boolean().optional().nullable(),
  contractReference: optionalText(200),
  collectionChannel: optionalText(80),
  negativeListing: z.boolean().optional().nullable(),
});

const negotiationSchema = z.object({
  contact: optionalText(120),
  channel: channelSchema.optional().nullable(),
  offerAmount: moneySchema.optional().nullable(),
  downPayment: moneySchema.optional().nullable(),
  installmentCount: z.coerce.number().int().min(1).max(600).optional().nullable(),
  installmentAmount: moneySchema.optional().nullable(),
  totalAmount: moneySchema.optional().nullable(),
  charges: moneySchema.optional().nullable(),
  validUntil: dateSchema.optional().nullable(),
  status: negotiationStatusSchema.default("draft"),
  notes: optionalText(4000),
});

const planItemSchema = z.object({
  debtId: z.string().uuid(),
  acceptedNegotiationId: z.string().uuid().optional().nullable(),
  monthlyAmount: moneySchema,
  dueDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  sequence: z.coerce.number().int().min(0).max(10_000).default(0),
  notes: optionalText(1000),
});
const planSchema = z.object({
  name: z.string().trim().min(2).max(120),
  status: planStatusSchema.default("draft"),
  startDate: dateSchema.optional().nullable(),
  targetEndDate: dateSchema.optional().nullable(),
  assumptions: z.record(z.string(), z.unknown()).default({}),
  items: z.array(planItemSchema).max(500).default([]),
});
const paymentSchema = z.object({
  amount: moneySchema.refine((amount) => amount > 0, "O pagamento deve ser maior que zero."),
  paidOn: dateSchema.default(todayIso()),
  source: sourceSchema.default("manual"),
  proofReference: optionalText(500),
  confirmOverpayment: z.boolean().default(false),
});
const reviewSchema = z.object({
  weekStart: dateSchema,
  status: itemStatusSchema.default("open"),
  summary: optionalText(4000),
  balanceSnapshot: signedMoneySchema.optional().nullable(),
  snoozedUntil: dateSchema.optional().nullable(),
  actions: z.array(z.object({ title: z.string().trim().min(2).max(160), detail: optionalText(2000), debtId: z.string().uuid().optional().nullable(), dueDate: dateSchema.optional().nullable() })).max(100).default([]),
});
const essentialExpensePatchSchema = z.object({ name: z.string().trim().min(2).max(120), category: essentialCategorySchema, monthlyAmount: moneySchema, required: z.boolean(), active: z.boolean() }).partial();
const debtPatchSchema = z.object({
  name: z.string().trim().min(2).max(120), creditor: optionalText(120), balance: moneySchema, installment: moneySchema,
  dueDay: z.coerce.number().int().min(1).max(31).nullable(), interestRate: z.coerce.number().finite().min(0).max(100_000).nullable(), priority: z.enum(["essential", "high", "normal", "low"]), status: debtStatusSchema,
  notes: optionalText(4000), originalAmount: moneySchema.nullable(), debtType: optionalText(60), dueDate: dateSchema.nullable(), daysOverdue: z.coerce.number().int().min(0).max(100_000).nullable(), totalCostRate: z.coerce.number().finite().min(0).max(1_000_000).nullable(),
  remainingInstallments: z.coerce.number().int().min(0).max(600).nullable(), secured: z.boolean().nullable(), contractReference: optionalText(200), collectionChannel: optionalText(80), negativeListing: z.boolean().nullable(),
}).partial();
const negotiationPatchSchema = z.object({ contact: optionalText(120), channel: channelSchema.nullable(), offerAmount: moneySchema.nullable(), downPayment: moneySchema.nullable(), installmentCount: z.coerce.number().int().min(1).max(600).nullable(), installmentAmount: moneySchema.nullable(), totalAmount: moneySchema.nullable(), charges: moneySchema.nullable(), validUntil: dateSchema.nullable(), status: negotiationStatusSchema, notes: optionalText(4000) }).partial();
const planPatchSchema = z.object({ name: z.string().trim().min(2).max(120), status: planStatusSchema, startDate: dateSchema.nullable(), targetEndDate: dateSchema.nullable(), assumptions: z.record(z.string(), z.unknown()), items: z.array(planItemSchema).max(500) }).partial();
const reviewPatchSchema = z.object({ status: itemStatusSchema, summary: optionalText(4000), balanceSnapshot: signedMoneySchema.nullable(), snoozedUntil: dateSchema.nullable() }).partial();

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}
function money(cents: unknown) { return Number(cents) / 100; }
function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
function validDate(value: string | null | undefined) {
  if (!value || !dateSchema.safeParse(value).success) return value == null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function validationError(response: Parameters<RequestHandler>[1], message: string, issues?: unknown) {
  response.status(400).json({ message, ...(issues ? { issues } : {}) });
}
async function audit(client: PoolClient, userId: string, action: string, metadata: Record<string, unknown> = {}) {
  await client.query("INSERT INTO audit_logs (id, actor_user_id, target_user_id, action, metadata) VALUES ($1, $2, $2, $3, $4::jsonb)", [randomUUID(), userId, action, JSON.stringify(metadata)]);
}
async function syncEssentialFloor(client: PoolClient, userId: string) {
  await client.query(`UPDATE user_profiles
    SET essential_floor_cents = COALESCE((SELECT SUM(monthly_amount_cents) FROM essential_expenses WHERE user_id=$1 AND active=TRUE), 0), updated_at=NOW()
    WHERE user_id=$1`, [userId]);
}

function serializeExpense(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, category: row.category, monthlyAmount: money(row.monthly_amount_cents), required: row.required, active: row.active, createdAt: row.created_at, updatedAt: row.updated_at };
}
function serializeDebt(row: Record<string, unknown>) {
  return {
    id: row.id, name: row.name, creditor: row.creditor ?? null, balance: money(row.balance_cents), installment: money(row.installment_cents),
    dueDay: row.due_day == null ? null : Number(row.due_day), interestRate: row.interest_rate == null ? null : Number(row.interest_rate), priority: row.priority,
    status: row.status, notes: row.notes ?? null, originalAmount: row.original_amount_cents == null ? null : money(row.original_amount_cents), debtType: row.debt_type ?? null,
    dueDate: iso(row.due_date as string | Date | null), daysOverdue: row.days_overdue == null ? deriveDaysOverdue(iso(row.due_date as string | Date | null)) : Number(row.days_overdue),
    totalCostRate: row.total_cost_rate == null ? null : Number(row.total_cost_rate), remainingInstallments: row.remaining_installments == null ? null : Number(row.remaining_installments),
    secured: row.secured ?? null, contractReference: row.contract_reference ?? null, collectionChannel: row.collection_channel ?? null, negativeListing: row.negative_listing ?? null,
    balanceUpdatedAt: row.balance_updated_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function serializeNegotiation(row: Record<string, unknown>) {
  return { id: row.id, debtId: row.debt_id, contact: row.contact_name ?? null, channel: row.channel ?? null, offerAmount: row.offer_amount_cents == null ? null : money(row.offer_amount_cents), downPayment: row.down_payment_cents == null ? null : money(row.down_payment_cents), installmentCount: row.installment_count == null ? null : Number(row.installment_count), installmentAmount: row.installment_amount_cents == null ? null : money(row.installment_amount_cents), totalAmount: row.total_amount_cents == null ? null : money(row.total_amount_cents), charges: row.charges_cents == null ? null : money(row.charges_cents), validUntil: iso(row.valid_until as string | Date | null), status: row.status, decidedAt: row.decided_at, notes: row.notes ?? null, createdAt: row.created_at, updatedAt: row.updated_at };
}
function serializePlan(row: Record<string, unknown>, items: Record<string, unknown>[] = []) {
  return { id: row.id, name: row.name, status: row.status, normalizedIncome: money(row.normalized_income_cents), essentialFloor: money(row.essential_floor_cents), existingMonthlyCommitments: money(row.existing_commitments_cents), safetyMargin: money(row.safety_margin_cents), safeCapacity: money(row.safe_capacity_cents), monthlyTotal: money(row.monthly_total_cents), startDate: iso(row.start_date as string | Date | null), targetEndDate: iso(row.target_end_date as string | Date | null), assumptions: row.assumptions ?? {}, activatedAt: row.activated_at, createdAt: row.created_at, updatedAt: row.updated_at, items: items.map((item) => ({ id: item.id, debtId: item.debt_id, acceptedNegotiationId: item.accepted_negotiation_id ?? null, monthlyAmount: money(item.monthly_amount_cents), dueDay: item.due_day == null ? null : Number(item.due_day), sequence: Number(item.sequence), notes: item.notes ?? null })) };
}
function serializeReview(row: Record<string, unknown>) {
  return { id: row.id, weekStart: iso(row.week_start as string | Date), status: row.status, summary: row.summary ?? null, balanceSnapshot: row.balance_snapshot_cents == null ? null : money(row.balance_snapshot_cents), reviewedAt: row.reviewed_at, snoozedUntil: iso(row.snoozed_until as string | Date | null), createdAt: row.created_at, updatedAt: row.updated_at };
}
function serializeAction(row: Record<string, unknown>) {
  return { id: row.id, weeklyReviewId: row.weekly_review_id ?? null, debtId: row.debt_id ?? null, title: row.title, detail: row.detail ?? null, status: row.status, dueDate: iso(row.due_date as string | Date | null), snoozedUntil: iso(row.snoozed_until as string | Date | null), resolvedAt: row.resolved_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function financialSnapshot(client: PoolClient, userId: string) {
  const [profileResult, expenseResult] = await Promise.all([
    client.query("SELECT * FROM user_profiles WHERE user_id = $1", [userId]),
    client.query("SELECT monthly_amount_cents, active FROM essential_expenses WHERE user_id = $1", [userId]),
  ]);
  const profile = profileResult.rows[0];
  if (!profile) throw new Error("Diagnóstico financeiro não encontrado.");
  const essentialFloorCents = calculateEssentialFloorCents(expenseResult.rows.map((row) => ({ monthlyAmountCents: Number(row.monthly_amount_cents), active: Boolean(row.active) })));
  const conservativeMonthlyIncomeCents = Number(profile.conservative_monthly_income_cents ?? profile.normalized_monthly_income_cents ?? 0);
  const safeCapacityCents = calculateSafeCapacityCents({ conservativeMonthlyIncomeCents, essentialFloorCents, existingMonthlyCommitmentsCents: Number(profile.existing_commitments_cents), safetyMarginCents: Number(profile.safety_margin_cents) });
  return { profile, essentialFloorCents, conservativeMonthlyIncomeCents, safeCapacityCents };
}

router.get("/diagnosis", asyncRoute(async (request, response) => {
  const userId = request.user!.id;
  const [profileResult, expensesResult] = await Promise.all([
    getDb().query("SELECT * FROM user_profiles WHERE user_id = $1", [userId]),
    getDb().query("SELECT * FROM essential_expenses WHERE user_id = $1 ORDER BY active DESC, category, name", [userId]),
  ]);
  const row = profileResult.rows[0];
  const essentialFloorCents = calculateEssentialFloorCents(expensesResult.rows.map((item) => ({ monthlyAmountCents: Number(item.monthly_amount_cents), active: Boolean(item.active) })));
  const conservativeIncome = Number(row?.conservative_monthly_income_cents ?? row?.normalized_monthly_income_cents ?? 0);
  const safeCapacity = calculateSafeCapacityCents({ conservativeMonthlyIncomeCents: conservativeIncome, essentialFloorCents, existingMonthlyCommitmentsCents: Number(row?.existing_commitments_cents ?? 0), safetyMarginCents: Number(row?.safety_margin_cents ?? 0) });
  response.json({ diagnosis: { monthlyIncome: money(row?.monthly_income_cents ?? 0), incomeFrequency: row?.income_frequency ?? "monthly", variableIncome: money(row?.variable_income_cents ?? 0), normalizedMonthlyIncome: money(row?.normalized_monthly_income_cents ?? 0), conservativeMonthlyIncome: money(conservativeIncome), dependents: Number(row?.dependents ?? 0), currentBalance: money(row?.current_balance_cents ?? 0), balanceAsOfDate: iso(row?.balance_as_of_date) ?? todayIso(), nextIncomeDate: iso(row?.next_income_date), existingMonthlyCommitments: money(row?.existing_commitments_cents ?? 0), safetyMargin: money(row?.safety_margin_cents ?? 0), essentialFloor: money(essentialFloorCents), safeCapacity: money(safeCapacity), capacityDisclaimer: "Capacidade operacional conservadora; não representa mínimo existencial legal nem aconselhamento jurídico.", notes: row?.diagnosis_notes ?? null, completedAt: row?.diagnosis_completed_at ?? null }, essentialExpenses: expensesResult.rows.map(serializeExpense) });
}));

router.put("/diagnosis", asyncRoute(async (request, response) => {
  const parsed = diagnosisSchema.safeParse(request.body);
  if (!parsed.success || !validDate(parsed.data?.balanceAsOfDate) || !validDate(parsed.data?.nextIncomeDate)) return validationError(response, "Confira os dados e as datas do diagnóstico.", parsed.success ? undefined : parsed.error.flatten());
  const data = parsed.data;
  const incomeAmount = data.incomeAmount ?? data.monthlyIncome ?? 0;
  const incomeCents = moneyToCents(incomeAmount);
  const conservativeInputCents = data.conservativeMonthlyIncome == null ? null : moneyToCents(data.conservativeMonthlyIncome);
  const normalized = normalizeMonthlyIncomeCents(incomeCents, data.incomeFrequency, conservativeInputCents);
  const userId = request.user!.id;
  await withTransaction(async (client) => {
    const essential = await client.query("SELECT monthly_amount_cents, active FROM essential_expenses WHERE user_id = $1", [userId]);
    const essentialFloorCents = calculateEssentialFloorCents(essential.rows.map((row) => ({ monthlyAmountCents: Number(row.monthly_amount_cents), active: Boolean(row.active) })));
    await client.query(`INSERT INTO user_profiles (user_id, monthly_income_cents, income_frequency, next_income_date, current_balance_cents, balance_as_of_date, safety_margin_cents, onboarding_completed, dependents, variable_income_cents, normalized_monthly_income_cents, conservative_monthly_income_cents, essential_floor_cents, existing_commitments_cents, diagnosis_notes, diagnosis_completed_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
      ON CONFLICT (user_id) DO UPDATE SET monthly_income_cents=EXCLUDED.monthly_income_cents,income_frequency=EXCLUDED.income_frequency,next_income_date=EXCLUDED.next_income_date,current_balance_cents=EXCLUDED.current_balance_cents,balance_as_of_date=EXCLUDED.balance_as_of_date,safety_margin_cents=EXCLUDED.safety_margin_cents,onboarding_completed=TRUE,dependents=EXCLUDED.dependents,variable_income_cents=EXCLUDED.variable_income_cents,normalized_monthly_income_cents=EXCLUDED.normalized_monthly_income_cents,conservative_monthly_income_cents=EXCLUDED.conservative_monthly_income_cents,essential_floor_cents=EXCLUDED.essential_floor_cents,existing_commitments_cents=EXCLUDED.existing_commitments_cents,diagnosis_notes=EXCLUDED.diagnosis_notes,diagnosis_completed_at=NOW(),updated_at=NOW()`, [userId, incomeCents, data.incomeFrequency, data.nextIncomeDate ?? null, moneyToCents(data.currentBalance ?? 0), data.balanceAsOfDate ?? todayIso(), moneyToCents(data.safetyMargin), data.dependents, moneyToCents(data.variableIncome), normalized.monthlyIncomeCents, data.incomeFrequency === "irregular" ? conservativeInputCents : normalized.monthlyIncomeCents, essentialFloorCents, moneyToCents(data.existingMonthlyCommitments), data.notes ?? null]);
    await audit(client, userId, "diagnosis_updated", { incomeFrequency: data.incomeFrequency, normalizationSource: normalized.source, hasWarning: Boolean(normalized.warning) });
  });
  response.json({ updated: true, normalization: { monthlyIncome: money(normalized.monthlyIncomeCents), source: normalized.source, warning: normalized.warning } });
}));

router.get("/essential-expenses", asyncRoute(async (request, response) => {
  const result = await getDb().query("SELECT * FROM essential_expenses WHERE user_id=$1 ORDER BY active DESC, category, name", [request.user!.id]);
  response.json({ essentialExpenses: result.rows.map(serializeExpense), essentialFloor: money(calculateEssentialFloorCents(result.rows.map((row) => ({ monthlyAmountCents: Number(row.monthly_amount_cents), active: Boolean(row.active) })))) });
}));
router.post("/essential-expenses", asyncRoute(async (request, response) => {
  const parsed = essentialExpenseSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response, "Confira os dados da despesa essencial.", parsed.error.flatten());
  const data = parsed.data; const id = randomUUID(); const userId = request.user!.id;
  const row = await withTransaction(async (client) => {
    const result = await client.query("INSERT INTO essential_expenses (id,user_id,name,category,monthly_amount_cents,required,active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *", [id,userId,data.name,data.category,moneyToCents(data.monthlyAmount),data.required,data.active]);
    await syncEssentialFloor(client, userId);
    await audit(client,userId,"essential_expense_created",{expenseId:id}); return result.rows[0];
  });
  response.status(201).json({ essentialExpense: serializeExpense(row) });
}));
router.patch("/essential-expenses/:id", asyncRoute(async (request, response) => {
  const parsed = essentialExpensePatchSchema.safeParse(request.body);
  if (!parsed.success) return validationError(response,"Dados da despesa essencial inválidos.",parsed.error.flatten());
  const d=parsed.data; const userId=request.user!.id;
  const row=await withTransaction(async(client)=>{ const result=await client.query(`UPDATE essential_expenses SET name=COALESCE($3,name),category=COALESCE($4,category),monthly_amount_cents=COALESCE($5,monthly_amount_cents),required=COALESCE($6,required),active=COALESCE($7,active),updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *`,[request.params.id,userId,d.name??null,d.category??null,d.monthlyAmount===undefined?null:moneyToCents(d.monthlyAmount),d.required??null,d.active??null]); if(!result.rowCount)return null; await syncEssentialFloor(client,userId); await audit(client,userId,"essential_expense_updated",{expenseId:request.params.id}); return result.rows[0]; });
  if(!row){response.status(404).json({message:"Despesa essencial não encontrada."});return;} response.json({essentialExpense:serializeExpense(row)});
}));
router.delete("/essential-expenses/:id", asyncRoute(async(request,response)=>{ const userId=request.user!.id; const deleted=await withTransaction(async(client)=>{const result=await client.query("DELETE FROM essential_expenses WHERE id=$1 AND user_id=$2 RETURNING id",[request.params.id,userId]);if(!result.rowCount)return false;await syncEssentialFloor(client,userId);await audit(client,userId,"essential_expense_deleted",{expenseId:request.params.id});return true;});if(!deleted){response.status(404).json({message:"Despesa essencial não encontrada."});return;}response.status(204).end();}));

const debtColumns = "id,name,creditor,balance_cents,installment_cents,due_day,interest_rate,priority,status,notes,original_amount_cents,debt_type,due_date,days_overdue,total_cost_rate,remaining_installments,secured,contract_reference,collection_channel,negative_listing,balance_updated_at,created_at,updated_at";
router.get("/debts", asyncRoute(async(request,response)=>{const result=await getDb().query(`SELECT ${debtColumns} FROM debts WHERE user_id=$1`,[request.user!.id]);const debts=result.rows.map(serializeDebt);const ranked=prioritizeDebts(debts.map((d)=>({id:String(d.id),balanceCents:moneyToCents(Number(d.balance)),priority:d.priority as "essential"|"high"|"normal"|"low",secured:d.secured as boolean|null,daysOverdue:d.daysOverdue as number,totalCostRate:d.totalCostRate as number|null,interestRate:d.interestRate as number|null,negativeListing:d.negativeListing as boolean|null})));const rankMap=new Map(ranked.map((r,index)=>[r.id,{rank:index+1,score:r.score,reasons:r.reasons}]));response.json({debts:debts.map((debt)=>({...debt,prioritization:rankMap.get(String(debt.id))}))});}));
router.post("/debts", asyncRoute(async(request,response)=>{const parsed=debtSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.dueDate))return validationError(response,"Confira os dados da dívida.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data;const balance=moneyToCents(d.balance);try{assertDebtStatus(balance,d.status);}catch(error){response.status(409).json({message:(error as Error).message});return;}const id=randomUUID(),userId=request.user!.id;const row=await withTransaction(async(client)=>{const result=await client.query(`INSERT INTO debts (id,user_id,name,creditor,balance_cents,installment_cents,due_day,interest_rate,priority,status,notes,original_amount_cents,debt_type,due_date,days_overdue,total_cost_rate,remaining_installments,secured,contract_reference,collection_channel,negative_listing,balance_updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW()) RETURNING ${debtColumns}`,[id,userId,d.name,d.creditor??null,balance,moneyToCents(d.installment),d.dueDay??null,d.interestRate??null,d.priority,d.status,d.notes??null,d.originalAmount==null?null:moneyToCents(d.originalAmount),d.debtType??null,d.dueDate??null,d.daysOverdue??null,d.totalCostRate??null,d.remainingInstallments??null,d.secured??null,d.contractReference??null,d.collectionChannel??null,d.negativeListing??null]);await audit(client,userId,"debt_created",{debtId:id});return result.rows[0];});response.status(201).json({debt:serializeDebt(row)});}));
router.patch("/debts/:id", asyncRoute(async(request,response)=>{const parsed=debtPatchSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.dueDate))return validationError(response,"Dados de atualização da dívida inválidos.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const current=await client.query("SELECT balance_cents,status FROM debts WHERE id=$1 AND user_id=$2 FOR UPDATE",[request.params.id,userId]);if(!current.rowCount)return null;const balance=d.balance===undefined?Number(current.rows[0].balance_cents):moneyToCents(d.balance);const status=d.status??current.rows[0].status;try{assertDebtStatus(balance,status);}catch(error){return{conflict:(error as Error).message};}const result=await client.query(`UPDATE debts SET name=COALESCE($3,name),creditor=CASE WHEN $4::boolean THEN $5 ELSE creditor END,balance_cents=$6,installment_cents=COALESCE($7,installment_cents),due_day=CASE WHEN $8::boolean THEN $9 ELSE due_day END,interest_rate=CASE WHEN $10::boolean THEN $11 ELSE interest_rate END,priority=COALESCE($12,priority),status=$13,notes=CASE WHEN $14::boolean THEN $15 ELSE notes END,original_amount_cents=CASE WHEN $16::boolean THEN $17 ELSE original_amount_cents END,debt_type=CASE WHEN $18::boolean THEN $19 ELSE debt_type END,due_date=CASE WHEN $20::boolean THEN $21 ELSE due_date END,days_overdue=CASE WHEN $22::boolean THEN $23 ELSE days_overdue END,total_cost_rate=CASE WHEN $24::boolean THEN $25 ELSE total_cost_rate END,remaining_installments=CASE WHEN $26::boolean THEN $27 ELSE remaining_installments END,secured=CASE WHEN $28::boolean THEN $29 ELSE secured END,contract_reference=CASE WHEN $30::boolean THEN $31 ELSE contract_reference END,collection_channel=CASE WHEN $32::boolean THEN $33 ELSE collection_channel END,negative_listing=CASE WHEN $34::boolean THEN $35 ELSE negative_listing END,balance_updated_at=CASE WHEN $36::boolean THEN NOW() ELSE balance_updated_at END,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING ${debtColumns}`,[request.params.id,userId,d.name??null,"creditor" in d,d.creditor??null,balance,d.installment===undefined?null:moneyToCents(d.installment),"dueDay" in d,d.dueDay??null,"interestRate" in d,d.interestRate??null,d.priority??null,status,"notes" in d,d.notes??null,"originalAmount" in d,d.originalAmount==null?null:moneyToCents(d.originalAmount),"debtType" in d,d.debtType??null,"dueDate" in d,d.dueDate??null,"daysOverdue" in d,d.daysOverdue??null,"totalCostRate" in d,d.totalCostRate??null,"remainingInstallments" in d,d.remainingInstallments??null,"secured" in d,d.secured??null,"contractReference" in d,d.contractReference??null,"collectionChannel" in d,d.collectionChannel??null,"negativeListing" in d,d.negativeListing??null,d.balance!==undefined]);await audit(client,userId,"debt_updated",{debtId:request.params.id,status});return{row:result.rows[0]};});if(!outcome){response.status(404).json({message:"Dívida não encontrada."});return;}if("conflict" in outcome){response.status(409).json({message:outcome.conflict});return;}response.json({debt:serializeDebt(outcome.row)});}));

router.get("/debts/:id/negotiations",asyncRoute(async(request,response)=>{const result=await getDb().query("SELECT n.* FROM debt_negotiations n JOIN debts d ON d.id=n.debt_id AND d.user_id=n.user_id WHERE n.debt_id=$1 AND n.user_id=$2 ORDER BY n.created_at DESC",[request.params.id,request.user!.id]);response.json({negotiations:result.rows.map(serializeNegotiation)});}));
router.post("/debts/:id/negotiations",asyncRoute(async(request,response)=>{const parsed=negotiationSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.validUntil))return validationError(response,"Confira os dados da negociação.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,id=randomUUID(),userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const debt=await client.query("SELECT id FROM debts WHERE id=$1 AND user_id=$2",[request.params.id,userId]);if(!debt.rowCount)return null;const result=await client.query("INSERT INTO debt_negotiations (id,user_id,debt_id,contact_name,channel,offer_amount_cents,down_payment_cents,installment_count,installment_amount_cents,total_amount_cents,charges_cents,valid_until,status,decided_at,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CASE WHEN $13 IN ('accepted','rejected') THEN NOW() END,$14) RETURNING *",[id,userId,request.params.id,d.contact??null,d.channel??null,d.offerAmount==null?null:moneyToCents(d.offerAmount),d.downPayment==null?null:moneyToCents(d.downPayment),d.installmentCount??null,d.installmentAmount==null?null:moneyToCents(d.installmentAmount),d.totalAmount==null?null:moneyToCents(d.totalAmount),d.charges==null?null:moneyToCents(d.charges),d.validUntil??null,d.status,d.notes??null]);await audit(client,userId,"debt_negotiation_created",{debtId:request.params.id,negotiationId:id,status:d.status});return result.rows[0];});if(!outcome){response.status(404).json({message:"Dívida não encontrada."});return;}response.status(201).json({negotiation:serializeNegotiation(outcome)});}));
router.patch("/debts/:id/negotiations/:negotiationId",asyncRoute(async(request,response)=>{const parsed=negotiationPatchSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.validUntil))return validationError(response,"Dados da negociação inválidos.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id;const row=await withTransaction(async(client)=>{const result=await client.query(`UPDATE debt_negotiations SET contact_name=CASE WHEN $4::boolean THEN $5 ELSE contact_name END,channel=CASE WHEN $6::boolean THEN $7 ELSE channel END,offer_amount_cents=CASE WHEN $8::boolean THEN $9 ELSE offer_amount_cents END,down_payment_cents=CASE WHEN $10::boolean THEN $11 ELSE down_payment_cents END,installment_count=CASE WHEN $12::boolean THEN $13 ELSE installment_count END,installment_amount_cents=CASE WHEN $14::boolean THEN $15 ELSE installment_amount_cents END,total_amount_cents=CASE WHEN $16::boolean THEN $17 ELSE total_amount_cents END,charges_cents=CASE WHEN $18::boolean THEN $19 ELSE charges_cents END,valid_until=CASE WHEN $20::boolean THEN $21 ELSE valid_until END,status=COALESCE($22,status),decided_at=CASE WHEN $22 IN ('accepted','rejected') THEN NOW() WHEN $22 IS NOT NULL THEN NULL ELSE decided_at END,notes=CASE WHEN $23::boolean THEN $24 ELSE notes END,updated_at=NOW() WHERE id=$1 AND debt_id=$2 AND user_id=$3 RETURNING *`,[request.params.negotiationId,request.params.id,userId,"contact" in d,d.contact??null,"channel" in d,d.channel??null,"offerAmount" in d,d.offerAmount==null?null:moneyToCents(d.offerAmount),"downPayment" in d,d.downPayment==null?null:moneyToCents(d.downPayment),"installmentCount" in d,d.installmentCount??null,"installmentAmount" in d,d.installmentAmount==null?null:moneyToCents(d.installmentAmount),"totalAmount" in d,d.totalAmount==null?null:moneyToCents(d.totalAmount),"charges" in d,d.charges==null?null:moneyToCents(d.charges),"validUntil" in d,d.validUntil??null,d.status??null,"notes" in d,d.notes??null]);if(!result.rowCount)return null;await audit(client,userId,"debt_negotiation_updated",{debtId:request.params.id,negotiationId:request.params.negotiationId,status:d.status});return result.rows[0];});if(!row){response.status(404).json({message:"Negociação não encontrada."});return;}response.json({negotiation:serializeNegotiation(row)});}));

async function replacePlanItems(client:PoolClient,userId:string,planId:string,items:z.infer<typeof planItemSchema>[]){await client.query("DELETE FROM recovery_plan_items WHERE plan_id=$1 AND user_id=$2",[planId,userId]);for(const item of items){const debt=await client.query("SELECT id FROM debts WHERE id=$1 AND user_id=$2",[item.debtId,userId]);if(!debt.rowCount)throw new Error(`Dívida ${item.debtId} não encontrada para este usuário.`);if(item.acceptedNegotiationId){const negotiation=await client.query("SELECT id FROM debt_negotiations WHERE id=$1 AND debt_id=$2 AND user_id=$3 AND status='accepted'",[item.acceptedNegotiationId,item.debtId,userId]);if(!negotiation.rowCount)throw new Error("A negociação vinculada precisa pertencer à dívida e estar aceita.");}await client.query("INSERT INTO recovery_plan_items (id,user_id,plan_id,debt_id,accepted_negotiation_id,monthly_amount_cents,due_day,sequence,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[randomUUID(),userId,planId,item.debtId,item.acceptedNegotiationId??null,moneyToCents(item.monthlyAmount),item.dueDay??null,item.sequence,item.notes??null]);}}
async function loadPlans(userId:string){const [plans,items]=await Promise.all([getDb().query("SELECT * FROM recovery_plans WHERE user_id=$1 ORDER BY created_at DESC",[userId]),getDb().query("SELECT * FROM recovery_plan_items WHERE user_id=$1 ORDER BY sequence,id",[userId])]);return plans.rows.map((plan)=>serializePlan(plan,items.rows.filter((item)=>item.plan_id===plan.id)));}
router.get("/recovery-plans",asyncRoute(async(request,response)=>response.json({recoveryPlans:await loadPlans(request.user!.id)})));
router.post("/recovery-plans",asyncRoute(async(request,response)=>{const parsed=planSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.startDate)||!validDate(parsed.data?.targetEndDate))return validationError(response,"Confira os dados do plano de recuperação.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,id=randomUUID(),userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const snapshot=await financialSnapshot(client,userId);const total=d.items.reduce((sum,item)=>sum+moneyToCents(item.monthlyAmount),0);if(d.status==="active"){try{assertPlanCanActivate(total,snapshot.safeCapacityCents);}catch(error){return{conflict:(error as Error).message};}}await client.query("INSERT INTO recovery_plans (id,user_id,name,status,normalized_income_cents,essential_floor_cents,existing_commitments_cents,safety_margin_cents,safe_capacity_cents,monthly_total_cents,start_date,target_end_date,assumptions,activated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,CASE WHEN $4='active' THEN NOW() END)",[id,userId,d.name,d.status,snapshot.conservativeMonthlyIncomeCents,snapshot.essentialFloorCents,Number(snapshot.profile.existing_commitments_cents),Number(snapshot.profile.safety_margin_cents),snapshot.safeCapacityCents,total,d.startDate??null,d.targetEndDate??null,JSON.stringify(d.assumptions)]);await replacePlanItems(client,userId,id,d.items);await audit(client,userId,"recovery_plan_created",{planId:id,status:d.status,monthlyTotalCents:total,safeCapacityCents:snapshot.safeCapacityCents});return{ok:true};});if("conflict" in outcome){response.status(409).json({message:outcome.conflict,capacityDisclaimer:"Capacidade operacional conservadora; não representa mínimo existencial legal."});return;}const plans=await loadPlans(userId);response.status(201).json({recoveryPlan:plans.find((plan)=>plan.id===id)});}));
router.patch("/recovery-plans/:id",asyncRoute(async(request,response)=>{const parsed=planPatchSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.startDate)||!validDate(parsed.data?.targetEndDate))return validationError(response,"Dados do plano inválidos.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const current=await client.query("SELECT * FROM recovery_plans WHERE id=$1 AND user_id=$2 FOR UPDATE",[request.params.id,userId]);if(!current.rowCount)return{missing:true};if(d.items)await replacePlanItems(client,userId,request.params.id,d.items);const sum=await client.query("SELECT COALESCE(SUM(monthly_amount_cents),0)::bigint AS total FROM recovery_plan_items WHERE plan_id=$1 AND user_id=$2",[request.params.id,userId]);const total=Number(sum.rows[0].total),snapshot=await financialSnapshot(client,userId),status=d.status??current.rows[0].status;if(status==="active"){try{assertPlanCanActivate(total,snapshot.safeCapacityCents);}catch(error){return{conflict:(error as Error).message};}}await client.query("UPDATE recovery_plans SET name=COALESCE($3,name),status=$4,normalized_income_cents=$5,essential_floor_cents=$6,existing_commitments_cents=$7,safety_margin_cents=$8,safe_capacity_cents=$9,monthly_total_cents=$10,start_date=CASE WHEN $11::boolean THEN $12 ELSE start_date END,target_end_date=CASE WHEN $13::boolean THEN $14 ELSE target_end_date END,assumptions=COALESCE($15::jsonb,assumptions),activated_at=CASE WHEN $4='active' THEN COALESCE(activated_at,NOW()) ELSE activated_at END,updated_at=NOW() WHERE id=$1 AND user_id=$2",[request.params.id,userId,d.name??null,status,snapshot.conservativeMonthlyIncomeCents,snapshot.essentialFloorCents,Number(snapshot.profile.existing_commitments_cents),Number(snapshot.profile.safety_margin_cents),snapshot.safeCapacityCents,total,"startDate" in d,d.startDate??null,"targetEndDate" in d,d.targetEndDate??null,d.assumptions?JSON.stringify(d.assumptions):null]);await audit(client,userId,"recovery_plan_updated",{planId:request.params.id,status,monthlyTotalCents:total,safeCapacityCents:snapshot.safeCapacityCents});return{ok:true};});if("missing" in outcome){response.status(404).json({message:"Plano de recuperação não encontrado."});return;}if("conflict" in outcome){response.status(409).json({message:outcome.conflict,capacityDisclaimer:"Capacidade operacional conservadora; não representa mínimo existencial legal."});return;}const plans=await loadPlans(userId);response.json({recoveryPlan:plans.find((plan)=>plan.id===request.params.id)});}));
router.post("/recovery-plans/:id/activate",asyncRoute(async(request,response)=>{const userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const current=await client.query("SELECT id FROM recovery_plans WHERE id=$1 AND user_id=$2 FOR UPDATE",[request.params.id,userId]);if(!current.rowCount)return{missing:true};const sum=await client.query("SELECT COALESCE(SUM(monthly_amount_cents),0)::bigint AS total FROM recovery_plan_items WHERE plan_id=$1 AND user_id=$2",[request.params.id,userId]);const total=Number(sum.rows[0].total),snapshot=await financialSnapshot(client,userId);try{assertPlanCanActivate(total,snapshot.safeCapacityCents);}catch(error){return{conflict:(error as Error).message};}await client.query("UPDATE recovery_plans SET status='active',normalized_income_cents=$3,essential_floor_cents=$4,existing_commitments_cents=$5,safety_margin_cents=$6,safe_capacity_cents=$7,monthly_total_cents=$8,activated_at=COALESCE(activated_at,NOW()),updated_at=NOW() WHERE id=$1 AND user_id=$2",[request.params.id,userId,snapshot.conservativeMonthlyIncomeCents,snapshot.essentialFloorCents,Number(snapshot.profile.existing_commitments_cents),Number(snapshot.profile.safety_margin_cents),snapshot.safeCapacityCents,total]);await audit(client,userId,"recovery_plan_activated",{planId:request.params.id,monthlyTotalCents:total,safeCapacityCents:snapshot.safeCapacityCents});return{ok:true};});if("missing" in outcome){response.status(404).json({message:"Plano de recuperação não encontrado."});return;}if("conflict" in outcome){response.status(409).json({message:outcome.conflict,capacityDisclaimer:"Capacidade operacional conservadora; não representa mínimo existencial legal."});return;}const plans=await loadPlans(userId);response.json({recoveryPlan:plans.find((plan)=>plan.id===request.params.id)});}));
router.post("/recovery-plans/:id/recalculate",asyncRoute(async(request,response)=>{request.body={};const userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const current=await client.query("SELECT status FROM recovery_plans WHERE id=$1 AND user_id=$2 FOR UPDATE",[request.params.id,userId]);if(!current.rowCount)return{missing:true};const sum=await client.query("SELECT COALESCE(SUM(monthly_amount_cents),0)::bigint AS total FROM recovery_plan_items WHERE plan_id=$1 AND user_id=$2",[request.params.id,userId]);const total=Number(sum.rows[0].total),snapshot=await financialSnapshot(client,userId);if(current.rows[0].status==="active"){try{assertPlanCanActivate(total,snapshot.safeCapacityCents);}catch(error){return{conflict:(error as Error).message};}}await client.query("UPDATE recovery_plans SET normalized_income_cents=$3,essential_floor_cents=$4,existing_commitments_cents=$5,safety_margin_cents=$6,safe_capacity_cents=$7,monthly_total_cents=$8,updated_at=NOW() WHERE id=$1 AND user_id=$2",[request.params.id,userId,snapshot.conservativeMonthlyIncomeCents,snapshot.essentialFloorCents,Number(snapshot.profile.existing_commitments_cents),Number(snapshot.profile.safety_margin_cents),snapshot.safeCapacityCents,total]);await audit(client,userId,"recovery_plan_recalculated",{planId:request.params.id});return{ok:true};});if("missing" in outcome){response.status(404).json({message:"Plano de recuperação não encontrado."});return;}if("conflict" in outcome){response.status(409).json({message:outcome.conflict});return;}const plans=await loadPlans(userId);response.json({recoveryPlan:plans.find((plan)=>plan.id===request.params.id)});}));

router.get("/debts/:id/payments",asyncRoute(async(request,response)=>{const result=await getDb().query("SELECT p.* FROM debt_payments p JOIN debts d ON d.id=p.debt_id AND d.user_id=p.user_id WHERE p.debt_id=$1 AND p.user_id=$2 ORDER BY p.paid_on DESC,p.created_at DESC",[request.params.id,request.user!.id]);response.json({payments:result.rows.map((row)=>({id:row.id,debtId:row.debt_id,balanceBefore:money(row.balance_before_cents),amount:money(row.amount_cents),balanceAfter:money(row.balance_after_cents),paidOn:iso(row.paid_on),source:row.source,proofReference:row.proof_reference??null,overpaymentConfirmed:row.overpayment_confirmed,reversedAt:row.reversed_at,reversalReason:row.reversal_reason??null,createdAt:row.created_at}))});}));
router.post("/debts/:id/payments",asyncRoute(async(request,response)=>{const parsed=paymentSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.paidOn))return validationError(response,"Confira os dados do pagamento.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id,paymentId=randomUUID();const outcome=await withTransaction(async(client)=>{const debt=await client.query("SELECT balance_cents FROM debts WHERE id=$1 AND user_id=$2 FOR UPDATE",[request.params.id,userId]);if(!debt.rowCount)return{missing:true};let balances;try{balances=calculatePaymentBalances(Number(debt.rows[0].balance_cents),moneyToCents(d.amount),d.confirmOverpayment);}catch(error){return{conflict:(error as Error).message};}await client.query("INSERT INTO debt_payments (id,user_id,debt_id,balance_before_cents,amount_cents,balance_after_cents,paid_on,source,proof_reference,overpayment_confirmed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[paymentId,userId,request.params.id,balances.balanceBeforeCents,moneyToCents(d.amount),balances.balanceAfterCents,d.paidOn,d.source,d.proofReference??null,d.confirmOverpayment]);await client.query("UPDATE debts SET balance_cents=$3::bigint,status=CASE WHEN $3::bigint=0 THEN 'paid' ELSE CASE WHEN status='paid' THEN 'open' ELSE status END END,balance_updated_at=NOW(),updated_at=NOW() WHERE id=$1 AND user_id=$2",[request.params.id,userId,balances.balanceAfterCents]);await audit(client,userId,"debt_payment_recorded",{debtId:request.params.id,paymentId,amountCents:moneyToCents(d.amount),balanceBeforeCents:balances.balanceBeforeCents,balanceAfterCents:balances.balanceAfterCents,overpaymentCents:balances.overpaymentCents});return{balances};});if("missing" in outcome){response.status(404).json({message:"Dívida não encontrada."});return;}if("conflict" in outcome){response.status(409).json({message:outcome.conflict});return;}response.status(201).json({paymentId,balanceAfter:money(outcome.balances.balanceAfterCents)});}));
router.post("/debts/:id/payments/:paymentId/reverse",asyncRoute(async(request,response)=>{const parsed=z.object({reason:z.string().trim().min(3).max(1000)}).safeParse(request.body);if(!parsed.success)return validationError(response,"Informe o motivo do estorno.",parsed.error.flatten());const userId=request.user!.id;const outcome=await withTransaction(async(client)=>{const payment=await client.query("SELECT * FROM debt_payments WHERE id=$1 AND debt_id=$2 AND user_id=$3 FOR UPDATE",[request.params.paymentId,request.params.id,userId]);if(!payment.rowCount)return{missing:true};const p=payment.rows[0];if(p.reversed_at)return{conflict:"Este pagamento já foi estornado."};const debt=await client.query("SELECT balance_cents FROM debts WHERE id=$1 AND user_id=$2 FOR UPDATE",[request.params.id,userId]);if(!debt.rowCount)return{missing:true};if(Number(debt.rows[0].balance_cents)!==Number(p.balance_after_cents))return{conflict:"Há movimentações posteriores. Estorne primeiro os pagamentos mais recentes."};await client.query("UPDATE debt_payments SET reversed_at=NOW(),reversed_by_user_id=$3,reversal_reason=$4,updated_at=NOW() WHERE id=$1 AND user_id=$2",[request.params.paymentId,userId,userId,parsed.data.reason]);await client.query("UPDATE debts SET balance_cents=$3::bigint,status=CASE WHEN $3::bigint=0 THEN 'paid' ELSE 'open' END,balance_updated_at=NOW(),updated_at=NOW() WHERE id=$1 AND user_id=$2",[request.params.id,userId,Number(p.balance_before_cents)]);await audit(client,userId,"debt_payment_reversed",{debtId:request.params.id,paymentId:request.params.paymentId,restoredBalanceCents:Number(p.balance_before_cents)});return{restored:Number(p.balance_before_cents)};});if("missing" in outcome){response.status(404).json({message:"Pagamento ou dívida não encontrado."});return;}if("conflict" in outcome){response.status(409).json({message:outcome.conflict});return;}response.json({reversed:true,balance:money(outcome.restored)});}));

router.get("/weekly-reviews",asyncRoute(async(request,response)=>{const [reviews,actions]=await Promise.all([getDb().query("SELECT * FROM weekly_reviews WHERE user_id=$1 ORDER BY week_start DESC",[request.user!.id]),getDb().query("SELECT * FROM action_items WHERE user_id=$1 ORDER BY status, due_date NULLS LAST, created_at DESC",[request.user!.id])]);response.json({weeklyReviews:reviews.rows.map((review)=>({...serializeReview(review),actions:actions.rows.filter((action)=>action.weekly_review_id===review.id).map(serializeAction)}))});}));
router.post("/weekly-reviews",asyncRoute(async(request,response)=>{const parsed=reviewSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.weekStart)||!validDate(parsed.data?.snoozedUntil))return validationError(response,"Confira os dados da revisão semanal.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id,id=randomUUID();let dates;try{dates=actionStateDates(d.status,d.snoozedUntil);}catch(error){return validationError(response,(error as Error).message);}const outcome=await withTransaction(async(client)=>{try{const result=await client.query("INSERT INTO weekly_reviews (id,user_id,week_start,status,summary,balance_snapshot_cents,reviewed_at,snoozed_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[id,userId,d.weekStart,d.status,d.summary??null,d.balanceSnapshot==null?null:moneyToCents(d.balanceSnapshot),dates.resolvedAt,dates.snoozedUntil]);for(const action of d.actions){if(action.debtId){const debt=await client.query("SELECT id FROM debts WHERE id=$1 AND user_id=$2",[action.debtId,userId]);if(!debt.rowCount)throw new Error("Uma ação referencia uma dívida inexistente.");}await client.query("INSERT INTO action_items (id,user_id,weekly_review_id,debt_id,title,detail,due_date) VALUES ($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),userId,id,action.debtId??null,action.title,action.detail??null,action.dueDate??null]);}await audit(client,userId,"weekly_review_created",{reviewId:id,actionCount:d.actions.length});return{row:result.rows[0]};}catch(error){if(error&&typeof error==="object"&&"code" in error&&error.code==="23505")return{conflict:"Já existe uma revisão para esta semana."};throw error;}});if("conflict" in outcome){response.status(409).json({message:outcome.conflict});return;}response.status(201).json({weeklyReview:serializeReview(outcome.row)});}));
router.patch("/weekly-reviews/:id",asyncRoute(async(request,response)=>{const parsed=reviewPatchSchema.safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.snoozedUntil))return validationError(response,"Dados da revisão semanal inválidos.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id;let dates:{snoozedUntil:string|null;resolvedAt:string|null}|null=null;if(d.status){try{dates=actionStateDates(d.status,d.snoozedUntil);}catch(error){return validationError(response,(error as Error).message);}}const row=await withTransaction(async(client)=>{const result=await client.query("UPDATE weekly_reviews SET status=COALESCE($3,status),summary=CASE WHEN $4::boolean THEN $5 ELSE summary END,balance_snapshot_cents=CASE WHEN $6::boolean THEN $7 ELSE balance_snapshot_cents END,snoozed_until=CASE WHEN $3 IS NOT NULL THEN $8 ELSE snoozed_until END,reviewed_at=CASE WHEN $3='resolved' THEN NOW() WHEN $3 IS NOT NULL THEN NULL ELSE reviewed_at END,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",[request.params.id,userId,d.status??null,"summary" in d,d.summary??null,"balanceSnapshot" in d,d.balanceSnapshot==null?null:moneyToCents(d.balanceSnapshot),dates?.snoozedUntil??null]);if(!result.rowCount)return null;await audit(client,userId,"weekly_review_updated",{reviewId:request.params.id,status:d.status});return result.rows[0];});if(!row){response.status(404).json({message:"Revisão semanal não encontrada."});return;}response.json({weeklyReview:serializeReview(row)});}));
router.get("/actions",asyncRoute(async(request,response)=>{const statuses=typeof request.query.status==="string"?request.query.status.split(",").filter((value)=>itemStatusSchema.safeParse(value).success):[];const result=await getDb().query("SELECT * FROM action_items WHERE user_id=$1 AND ($2::text[] IS NULL OR status=ANY($2::text[])) ORDER BY status,due_date NULLS LAST,created_at DESC",[request.user!.id,statuses.length?statuses:null]);response.json({actions:result.rows.map(serializeAction)});}));
router.patch("/actions/:id",asyncRoute(async(request,response)=>{const parsed=z.object({status:itemStatusSchema.optional(),snoozedUntil:dateSchema.optional().nullable(),title:z.string().trim().min(2).max(160).optional(),detail:optionalText(2000),dueDate:dateSchema.optional().nullable()}).safeParse(request.body);if(!parsed.success||!validDate(parsed.data?.snoozedUntil)||!validDate(parsed.data?.dueDate))return validationError(response,"Dados da ação inválidos.",parsed.success?undefined:parsed.error.flatten());const d=parsed.data,userId=request.user!.id;let dates:{snoozedUntil:string|null;resolvedAt:string|null}|null=null;if(d.status){try{dates=actionStateDates(d.status,d.snoozedUntil);}catch(error){return validationError(response,(error as Error).message);}}const row=await withTransaction(async(client)=>{const result=await client.query("UPDATE action_items SET status=COALESCE($3,status),snoozed_until=CASE WHEN $3 IS NOT NULL THEN $4 ELSE snoozed_until END,resolved_at=CASE WHEN $3 IS NOT NULL THEN $5::timestamptz ELSE resolved_at END,title=COALESCE($6,title),detail=CASE WHEN $7::boolean THEN $8 ELSE detail END,due_date=CASE WHEN $9::boolean THEN $10 ELSE due_date END,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",[request.params.id,userId,d.status??null,dates?.snoozedUntil??null,dates?.resolvedAt??null,d.title??null,"detail" in d,d.detail??null,"dueDate" in d,d.dueDate??null]);if(!result.rowCount)return null;await audit(client,userId,"action_item_updated",{actionId:request.params.id,status:d.status});return result.rows[0];});if(!row){response.status(404).json({message:"Ação não encontrada."});return;}response.json({action:serializeAction(row)});}));

export default router;
export { moneySchema };
