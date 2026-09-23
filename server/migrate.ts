import { closeDb, getDb, initDb } from "./db";
import { ensureOwnerAccount } from "./api";
import { runMigrations } from "./migrations";

async function migrate() {
  const database = initDb();
  if (!database) throw new Error("DATABASE_URL is required to run migrations.");
  await runMigrations(database);
  await ensureOwnerAccount();
  await closeDb();
}

migrate().catch(async (error) => {
  console.error("Migration failed", error);
  await closeDb();
  process.exitCode = 1;
});
