import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, isDatabaseConfigured } from "./db";
import api, { ensureOwnerAccount } from "./api";
import { runMigrations } from "./migrations";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const database = initDb();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (request.path.startsWith("/api")) response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api", api);

  const staticPath = process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath, { index: "index.html" }));
  app.get("/api/*", (_request, response) => response.status(404).json({ message: "Endpoint não encontrado." }));
  app.get("*", (_request, response) => response.sendFile(path.join(staticPath, "index.html")));

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled server error", error instanceof Error ? error.message : error);
    if (response.headersSent) return;
    response.status(500).json({ message: "Não foi possível concluir a operação." });
  });

  if (database) {
    await runMigrations(database);
    await ensureOwnerAccount();
  } else {
    console.warn("DATABASE_URL is not configured. The UI can load, but authenticated API operations are disabled.");
  }

  const port = Number(process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3001));
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port} (${isDatabaseConfigured() ? "database configured" : "database missing"})`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server", error);
  process.exitCode = 1;
});
