import type { Pool } from "pg";

const migrations = [
  {
    name: "001_initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'support', 'admin', 'owner')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS financial_launches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('entrada', 'conta', 'parcela')),
        name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        due_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
        installments_remaining INTEGER CHECK (installments_remaining IS NULL OR installments_remaining > 0),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS financial_launches_user_due_idx ON financial_launches(user_id, due_date);
      CREATE INDEX IF NOT EXISTS financial_launches_user_status_idx ON financial_launches(user_id, status);
      CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON audit_logs(target_user_id, created_at DESC);
    `,
  },
  {
    name: "002_financial_profiles",
    sql: `
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        monthly_income_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_income_cents >= 0),
        income_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (income_frequency IN ('monthly', 'biweekly', 'weekly', 'irregular')),
        next_income_date DATE,
        current_balance_cents INTEGER NOT NULL DEFAULT 0,
        balance_as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
        safety_margin_cents INTEGER NOT NULL DEFAULT 0 CHECK (safety_margin_cents >= 0),
        onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    name: "003_financial_planning_entities",
    sql: `
      CREATE TABLE IF NOT EXISTS recurring_commitments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('entrada', 'conta')),
        name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
        start_date DATE NOT NULL,
        category TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE financial_launches ADD COLUMN IF NOT EXISTS recurring_id TEXT REFERENCES recurring_commitments(id) ON DELETE SET NULL;
      ALTER TABLE financial_launches ADD COLUMN IF NOT EXISTS category TEXT;

      CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 1 AND 600),
        first_due_date DATE NOT NULL,
        category TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purchase_installments (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        installment_number INTEGER NOT NULL CHECK (installment_number > 0),
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        due_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
        paid_at TIMESTAMPTZ,
        UNIQUE (purchase_id, installment_number)
      );

      ALTER TABLE financial_launches ADD COLUMN IF NOT EXISTS purchase_installment_id TEXT REFERENCES purchase_installments(id) ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS debts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        creditor TEXT,
        balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
        installment_cents INTEGER NOT NULL DEFAULT 0 CHECK (installment_cents >= 0),
        due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
        interest_rate NUMERIC(8, 4),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('essential', 'high', 'normal', 'low')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'negotiating', 'paid')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS budget_limits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
        limit_cents INTEGER NOT NULL CHECK (limit_cents >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, category, month)
      );

      CREATE TABLE IF NOT EXISTS financial_goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_cents INTEGER NOT NULL CHECK (target_cents > 0),
        current_cents INTEGER NOT NULL DEFAULT 0 CHECK (current_cents >= 0),
        due_date DATE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS recurring_user_active_idx ON recurring_commitments(user_id, active);
      CREATE INDEX IF NOT EXISTS purchases_user_idx ON purchases(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS installments_user_due_idx ON purchase_installments(user_id, due_date);
      CREATE INDEX IF NOT EXISTS debts_user_status_idx ON debts(user_id, status);
      CREATE INDEX IF NOT EXISTS budgets_user_month_idx ON budget_limits(user_id, month);
      CREATE INDEX IF NOT EXISTS goals_user_status_idx ON financial_goals(user_id, status);
    `,
  },
  {
    name: "004_notifications",
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dedupe_key TEXT NOT NULL,
        tone TEXT NOT NULL CHECK (tone IN ('danger', 'attention', 'good')),
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, dedupe_key)
      );
      CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, read_at, created_at DESC);
    `,
  },
  {
    name: "005_launch_categories",
    sql: `
      ALTER TABLE financial_launches ADD COLUMN IF NOT EXISTS category TEXT;
    `,
  },
  {
    name: "006_debt_recovery_foundation",
    sql: `
      -- BIGINT keeps all persisted monetary amounts inside the API's documented safe range.
      ALTER TABLE financial_launches ALTER COLUMN amount_cents TYPE BIGINT;
      ALTER TABLE user_profiles ALTER COLUMN monthly_income_cents TYPE BIGINT;
      ALTER TABLE user_profiles ALTER COLUMN current_balance_cents TYPE BIGINT;
      ALTER TABLE user_profiles ALTER COLUMN safety_margin_cents TYPE BIGINT;
      ALTER TABLE recurring_commitments ALTER COLUMN amount_cents TYPE BIGINT;
      ALTER TABLE purchases ALTER COLUMN total_cents TYPE BIGINT;
      ALTER TABLE purchase_installments ALTER COLUMN amount_cents TYPE BIGINT;
      ALTER TABLE debts ALTER COLUMN balance_cents TYPE BIGINT;
      ALTER TABLE debts ALTER COLUMN installment_cents TYPE BIGINT;
      ALTER TABLE budget_limits ALTER COLUMN limit_cents TYPE BIGINT;
      ALTER TABLE financial_goals ALTER COLUMN target_cents TYPE BIGINT;
      ALTER TABLE financial_goals ALTER COLUMN current_cents TYPE BIGINT;

      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS dependents INTEGER NOT NULL DEFAULT 0 CHECK (dependents >= 0 AND dependents <= 100);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS variable_income_cents BIGINT NOT NULL DEFAULT 0 CHECK (variable_income_cents >= 0);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS normalized_monthly_income_cents BIGINT NOT NULL DEFAULT 0 CHECK (normalized_monthly_income_cents >= 0);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS conservative_monthly_income_cents BIGINT CHECK (conservative_monthly_income_cents IS NULL OR conservative_monthly_income_cents >= 0);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS essential_floor_cents BIGINT NOT NULL DEFAULT 0 CHECK (essential_floor_cents >= 0);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS existing_commitments_cents BIGINT NOT NULL DEFAULT 0 CHECK (existing_commitments_cents >= 0);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS diagnosis_notes TEXT;
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS diagnosis_completed_at TIMESTAMPTZ;
      UPDATE user_profiles
         SET normalized_monthly_income_cents = CASE income_frequency
               WHEN 'biweekly' THEN ROUND(monthly_income_cents * 26.0 / 12.0)::BIGINT
               WHEN 'weekly' THEN ROUND(monthly_income_cents * 52.0 / 12.0)::BIGINT
               WHEN 'irregular' THEN COALESCE(conservative_monthly_income_cents, 0)
               ELSE monthly_income_cents
             END,
             conservative_monthly_income_cents = CASE
               WHEN income_frequency = 'irregular' THEN conservative_monthly_income_cents
               ELSE CASE income_frequency
                 WHEN 'biweekly' THEN ROUND(monthly_income_cents * 26.0 / 12.0)::BIGINT
                 WHEN 'weekly' THEN ROUND(monthly_income_cents * 52.0 / 12.0)::BIGINT
                 ELSE monthly_income_cents
               END
             END;

      CREATE TABLE IF NOT EXISTS essential_expenses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
        category TEXT NOT NULL CHECK (category IN ('housing', 'utilities', 'food', 'health', 'transport', 'education', 'child_support', 'insurance', 'taxes', 'other')),
        monthly_amount_cents BIGINT NOT NULL CHECK (monthly_amount_cents >= 0),
        required BOOLEAN NOT NULL DEFAULT TRUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE debts ADD COLUMN IF NOT EXISTS original_amount_cents BIGINT CHECK (original_amount_cents IS NULL OR original_amount_cents >= 0);
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS debt_type TEXT;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS due_date DATE;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS days_overdue INTEGER CHECK (days_overdue IS NULL OR days_overdue >= 0);
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS total_cost_rate NUMERIC(12, 6) CHECK (total_cost_rate IS NULL OR total_cost_rate >= 0);
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS remaining_installments INTEGER CHECK (remaining_installments IS NULL OR remaining_installments >= 0);
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS secured BOOLEAN;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS contract_reference TEXT;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS collection_channel TEXT;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS negative_listing BOOLEAN;
      ALTER TABLE debts ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE TABLE IF NOT EXISTS debt_negotiations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
        contact_name TEXT,
        channel TEXT CHECK (channel IS NULL OR channel IN ('phone', 'email', 'chat', 'whatsapp', 'in_person', 'letter', 'other')),
        offer_amount_cents BIGINT CHECK (offer_amount_cents IS NULL OR offer_amount_cents >= 0),
        down_payment_cents BIGINT CHECK (down_payment_cents IS NULL OR down_payment_cents >= 0),
        installment_count INTEGER CHECK (installment_count IS NULL OR installment_count BETWEEN 1 AND 600),
        installment_amount_cents BIGINT CHECK (installment_amount_cents IS NULL OR installment_amount_cents >= 0),
        total_amount_cents BIGINT CHECK (total_amount_cents IS NULL OR total_amount_cents >= 0),
        charges_cents BIGINT CHECK (charges_cents IS NULL OR charges_cents >= 0),
        valid_until DATE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'offered', 'accepted', 'rejected', 'expired', 'cancelled')),
        decided_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recovery_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
        normalized_income_cents BIGINT NOT NULL CHECK (normalized_income_cents >= 0),
        essential_floor_cents BIGINT NOT NULL CHECK (essential_floor_cents >= 0),
        existing_commitments_cents BIGINT NOT NULL DEFAULT 0 CHECK (existing_commitments_cents >= 0),
        safety_margin_cents BIGINT NOT NULL DEFAULT 0 CHECK (safety_margin_cents >= 0),
        safe_capacity_cents BIGINT NOT NULL CHECK (safe_capacity_cents >= 0),
        monthly_total_cents BIGINT NOT NULL DEFAULT 0 CHECK (monthly_total_cents >= 0),
        start_date DATE,
        target_end_date DATE,
        assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
        activated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS recovery_plan_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES recovery_plans(id) ON DELETE CASCADE,
        debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
        accepted_negotiation_id TEXT REFERENCES debt_negotiations(id) ON DELETE SET NULL,
        monthly_amount_cents BIGINT NOT NULL CHECK (monthly_amount_cents >= 0),
        due_day INTEGER CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
        sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (plan_id, debt_id)
      );

      CREATE TABLE IF NOT EXISTS debt_payments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
        balance_before_cents BIGINT NOT NULL CHECK (balance_before_cents >= 0),
        amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
        balance_after_cents BIGINT NOT NULL CHECK (balance_after_cents >= 0),
        paid_on DATE NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual', 'bank_transfer', 'cash', 'card', 'payroll', 'other')),
        proof_reference TEXT,
        overpayment_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        reversed_at TIMESTAMPTZ,
        reversed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        reversal_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS weekly_reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'resolved')),
        summary TEXT,
        balance_snapshot_cents BIGINT CHECK (balance_snapshot_cents IS NULL OR balance_snapshot_cents BETWEEN -9000000000000 AND 9000000000000),
        reviewed_at TIMESTAMPTZ,
        snoozed_until DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, week_start)
      );
      CREATE TABLE IF NOT EXISTS action_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        weekly_review_id TEXT REFERENCES weekly_reviews(id) ON DELETE SET NULL,
        debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
        title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
        detail TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'resolved')),
        due_date DATE,
        snoozed_until DATE,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS import_batches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
        import_type TEXT NOT NULL DEFAULT 'launch_csv',
        row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        UNIQUE (user_id, import_type, content_hash)
      );
      ALTER TABLE financial_launches ADD COLUMN IF NOT EXISTS import_batch_id TEXT REFERENCES import_batches(id) ON DELETE SET NULL;

      -- Preserve duplicate historical launches but detach extra rows before enforcing generation idempotency.
      WITH duplicated AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY recurring_id, due_date ORDER BY created_at, id) AS position
          FROM financial_launches
         WHERE recurring_id IS NOT NULL
      )
      UPDATE financial_launches SET recurring_id = NULL
       WHERE id IN (SELECT id FROM duplicated WHERE position > 1);

      CREATE UNIQUE INDEX IF NOT EXISTS financial_launches_recurring_due_unique_idx ON financial_launches(recurring_id, due_date) WHERE recurring_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS essential_expenses_user_active_idx ON essential_expenses(user_id, active);
      CREATE INDEX IF NOT EXISTS debts_user_due_idx ON debts(user_id, due_date);
      CREATE INDEX IF NOT EXISTS debt_negotiations_debt_idx ON debt_negotiations(user_id, debt_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS recovery_plans_user_status_idx ON recovery_plans(user_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS recovery_plan_items_plan_idx ON recovery_plan_items(user_id, plan_id, sequence);
      CREATE INDEX IF NOT EXISTS debt_payments_debt_idx ON debt_payments(user_id, debt_id, paid_on DESC);
      CREATE INDEX IF NOT EXISTS weekly_reviews_user_week_idx ON weekly_reviews(user_id, week_start DESC);
      CREATE INDEX IF NOT EXISTS action_items_user_status_idx ON action_items(user_id, status, due_date);
      CREATE INDEX IF NOT EXISTS import_batches_user_created_idx ON import_batches(user_id, created_at DESC);
    `,
  },
];

export async function runMigrations(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of migrations) {
    const result = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [migration.name],
    );
    if (result.rowCount) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
      await client.query("COMMIT");
      console.log(`Applied migration ${migration.name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
