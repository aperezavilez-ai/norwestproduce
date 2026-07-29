const SESSION_COOKIE = "norwest_session";
const COOKIE_MAX_AGE = 28800; // 8 hours

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET ?? "norwest-erp-default-secret-key-2026-change-me";
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(email: string, permissions: readonly string[] = []): Promise<string> {
  const payload = btoa(JSON.stringify({ email, permissions, exp: Date.now() + COOKIE_MAX_AGE * 1000 }));
  const key = await getSigningKey();
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sig = btoa(String.fromCharCode(...new Uint8Array(raw)));
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<{ email: string; permissions: string[] } | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await getSigningKey();
    const sigBytes = Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
    if (!valid) return null;
    const data = JSON.parse(atob(payload)) as { email: string; permissions?: string[]; exp: number };
    if (Date.now() > data.exp) return null;
    return { email: data.email, permissions: Array.isArray(data.permissions) ? data.permissions : [] };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV !== "development" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV !== "development" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
