import express from "express";
import { createServer } from "http";
import { randomUUID } from "node:crypto";
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
  const authAttempts = new Map<string, { count: number; resetAt: number }>();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "100kb" }));
  app.use((request, response, next) => {
    const requestId = randomUUID();
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    const sendJson = response.json.bind(response);
    response.json = ((body: unknown) => {
      if (response.statusCode >= 400 && body && typeof body === "object" && !Array.isArray(body)) {
        return sendJson({ ...(body as Record<string, unknown>), requestId });
      }
      return sendJson(body);
    }) as typeof response.json;
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (request.path.startsWith("/api")) response.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api", (request, response, next) => {
    if (process.env.NODE_ENV === "production" && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.get("origin");
      const host = `${request.protocol}://${request.get("host")}`;
      if (origin && origin !== host) {
        response.status(403).json({ message: "Origem da requisição não autorizada." });
        return;
      }
    }
    if (request.path === "/auth/login" && request.method === "POST") {
      const key = request.ip || "unknown";
      const now = Date.now();
      const current = authAttempts.get(key);
      if (!current || current.resetAt <= now) authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      else if (current.count >= 30) {
        response.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
        return;
      } else current.count += 1;
    }
    next();
  });

  app.use("/api", api);

  const staticPath = process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "public")
    : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath, { index: "index.html" }));
  app.get("/api/*", (request, response) => response.status(404).json({ message: "Endpoint não encontrado.", requestId: request.requestId }));
  app.get("*", (_request, response) => response.sendFile(path.join(staticPath, "index.html")));

  app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled server error", { requestId: request.requestId, method: request.method, path: request.path, error: error instanceof Error ? error.message : String(error) });
    if (response.headersSent) return;
    response.status(500).json({ message: "Não foi possível concluir a operação.", requestId: request.requestId });
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
