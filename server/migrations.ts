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
