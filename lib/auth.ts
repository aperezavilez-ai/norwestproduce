import type { userAccounts } from "../db/schema";

export const ALL_USER_PERMISSIONS = ["sales_view", "sales_edit", "inventory", "invoicing", "collections", "catalogs", "reports", "administration", "settings", "users"] as const;

// Credentials can come from environment variables; the values below preserve the initial owner account.
export const DEFAULT_ADMIN_USER = {
  id: 1,
  organizationCode: "USA",
  fullName: process.env.ADMIN_FULL_NAME ?? "Admin",
  alias: "admin",
  email: (process.env.ADMIN_EMAIL ?? "admin@norwestproduce.com").toLowerCase(),
  passwordHash: process.env.ADMIN_PASSWORD_HASH ?? "",
  permissions: JSON.stringify(ALL_USER_PERMISSIONS),
  profitPercentage: 0,
  active: true,
  createdAt: "2026-07-23 00:00:00",
} satisfies typeof userAccounts.$inferSelect;

export function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function hashPassword(password: string) {
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  return `pbkdf2-sha256$${iterations}$${encode(salt)}$${encode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsText, saltText, expectedText] = storedHash.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations <= 0 || !saltText || !expectedText) return false;

  try {
    const decode = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    const salt = decode(saltText);
    const expected = decode(expectedText);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export function safeUser(user: typeof userAccounts.$inferSelect) {
  return { id: user.id, organizationCode: user.organizationCode, fullName: user.fullName, alias: user.alias, email: user.email, permissions: user.permissions, active: user.active, createdAt: user.createdAt };
}
