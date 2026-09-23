import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  if (!pool) {
    throw new Error("Database is not configured. Set DATABASE_URL before using the API.");
  }
  return pool;
}

export function initDb() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.NODE_ENV === "production" || process.env.PGSSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error.message);
  });

  return pool;
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { Pool };
