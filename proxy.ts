import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "./db";
import { userAccounts } from "./db/schema";
import { DEFAULT_ADMIN_USER } from "./lib/auth";
import { verifySessionToken } from "./lib/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("norwest_session")?.value;

  if (!token) {
    return unauthenticated(request);
  }

  const session = await verifySessionToken(token);
  if (!session) {
    const response = unauthenticated(request);
    response.cookies.set("norwest_session", "", { maxAge: 0, path: "/" });
    return response;
  }

  try {
    const permissions = await activePermissions(session.email);
    if (!permissions) {
      const response = unauthenticated(request);
      response.cookies.set("norwest_session", "", { maxAge: 0, path: "/" });
      return response;
    }

    const headers = new Headers(request.headers);
    headers.set("x-session-email", session.email.toLowerCase());
    headers.set("x-session-permissions", JSON.stringify(permissions));
    return NextResponse.next({ request: { headers } });
  } catch {
    return NextResponse.json(
      { error: "No fue posible validar la sesion. Intenta nuevamente." },
      { status: 503 },
    );
  }
}

async function activePermissions(email: string): Promise<string[] | null> {
  try {
    const db = await getDb();
    const [user] = await db
      .select({ permissions: userAccounts.permissions })
      .from(userAccounts)
      .where(and(
        eq(userAccounts.organizationCode, "USA"),
        eq(userAccounts.email, email.toLowerCase()),
        eq(userAccounts.active, true),
      ))
      .limit(1);
    if (!user) return null;
    const parsed = JSON.parse(user.permissions) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch (error) {
    const fallbackEnabled = Boolean(DEFAULT_ADMIN_USER.passwordHash);
    if (fallbackEnabled && email.toLowerCase() === DEFAULT_ADMIN_USER.email) {
      return JSON.parse(DEFAULT_ADMIN_USER.permissions) as string[];
    }
    throw error;
  }
}

function unauthenticated(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/empresas/:path*", "/usa/:path*", "/mexico/:path*", "/api/usa/:path*"],
};
