import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getDb } from "./db";

export type UserRole = "client" | "support" | "admin" | "owner";
export type UserStatus = "active" | "inactive";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function parseCookies(header: string | undefined) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(response: Response, token: string) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearSessionCookie(response: Response) {
  const attributes = [`${COOKIE_NAME}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

export async function createSession(userId: string, response: Response) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getDb().query(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
    [randomUUID(), userId, hashToken(token), expiresAt],
  );
  setSessionCookie(response, token);
}

export async function destroySession(request: Request, response: Response) {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (token) {
    await getDb().query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  clearSessionCookie(response);
}

export async function getUserFromRequest(request: Request): Promise<AuthUser | null> {
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (!token) return null;

  const result = await getDb().query<AuthUser>(
    `SELECT u.id, u.name, u.email, u.role, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)],
  );
  const user = result.rows[0] ?? null;
  if (!user || user.status !== "active") return null;
  return user;
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      clearSessionCookie(response);
      response.status(401).json({ message: "Sua sessão não está autenticada." });
      return;
    }
    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ message: "Você não tem permissão para esta ação." });
      return;
    }
    next();
  };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
