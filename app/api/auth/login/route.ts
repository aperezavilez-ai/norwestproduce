import { and, eq } from "drizzle-orm";
import { clearLoginAttempts, getDb, recordLoginAttempt } from "../../../../db";
import { userAccounts } from "../../../../db/schema";
import { DEFAULT_ADMIN_USER, clean, safeUser, verifyPassword } from "../../../../lib/auth";
import { createSessionToken, sessionCookieHeader } from "../../../../lib/session";

// In-memory rate limiter: max 10 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function checkLocalRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

function clearLocalRateLimit(ip: string) {
  attempts.delete(ip);
}

function loginResponse(user: ReturnType<typeof safeUser>, token: string) {
  return Response.json(
    { user },
    { headers: { "Set-Cookie": sessionCookieHeader(token) } },
  );
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = request.headers.get("cf-connecting-ip") ?? forwarded ?? "unknown";
    const rateKey = `login:${ip}`;
    let allowed: boolean;
    try {
      allowed = (await recordLoginAttempt(rateKey, WINDOW_MS, MAX_ATTEMPTS)).allowed;
    } catch {
      allowed = checkLocalRateLimit(rateKey);
    }
    if (!allowed) {
      return Response.json({ error: "Demasiados intentos. Espera 15 minutos antes de intentarlo de nuevo." }, { status: 429 });
    }

    const payload = await request.json() as Record<string, unknown>;
    const email = clean(payload.email).toLowerCase();
    const password = clean(payload.password);
    if (!email || !password) return Response.json({ error: "Ingresa correo y contrasena." }, { status: 400 });

    let user: ReturnType<typeof safeUser> | null = null;
    let databaseUnavailable = false;
    let databaseUserExists = false;

    try {
      const db = await getDb();
      const [row] = await db
        .select()
        .from(userAccounts)
        .where(and(eq(userAccounts.organizationCode, "USA"), eq(userAccounts.email, email)))
        .limit(1);
      databaseUserExists = Boolean(row);
      if (row?.active && (await verifyPassword(password, row.passwordHash))) user = safeUser(row);
    } catch {
      databaseUnavailable = true;
    }

    const fallbackAllowed = databaseUnavailable || !databaseUserExists;
    if (fallbackAllowed && !user && email === DEFAULT_ADMIN_USER.email && (await verifyPassword(password, DEFAULT_ADMIN_USER.passwordHash))) {
      user = safeUser(DEFAULT_ADMIN_USER);
    }

    if (!user) return Response.json({ error: "Correo o contrasena incorrectos." }, { status: 401 });

    await clearLoginAttempts(rateKey).catch(() => undefined);
    clearLocalRateLimit(rateKey);
    const permissions = user.permissions ? (JSON.parse(user.permissions) as string[]) : [];
    const token = await createSessionToken(email, permissions);
    return loginResponse(user, token);
  } catch {
    return Response.json({ error: "No fue posible iniciar sesion." }, { status: 500 });
  }
}
