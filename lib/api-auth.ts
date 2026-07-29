import { ALL_USER_PERMISSIONS } from "./auth";

export type Permission = (typeof ALL_USER_PERMISSIONS)[number];

function parsePermissions(value: string | null): Permission[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Permission => ALL_USER_PERMISSIONS.includes(item as Permission))
      : [];
  } catch {
    return [];
  }
}

/**
 * Returns a 403 Response if the request does not have the required permission, or null if it passes.
 * Reads permissions from the x-session-permissions header set by middleware.ts.
 */
export function requirePermission(request: Request, permission: Permission): Response | null {
  const perms = parsePermissions(request.headers.get("x-session-permissions"));
  if (!perms.includes(permission)) {
    return Response.json({ error: "No tienes permiso para realizar esta accion." }, { status: 403 });
  }
  return null;
}

/**
 * Returns a 403 Response if the request does not have at least one of the given permissions, or null if it passes.
 * Reads permissions from the x-session-permissions header set by middleware.ts.
 */
export function requireAnyPermission(request: Request, allowed: Permission[]): Response | null {
  const perms = parsePermissions(request.headers.get("x-session-permissions"));
  if (!allowed.some((p) => perms.includes(p))) {
    return Response.json({ error: "No tienes permiso para consultar esta informacion." }, { status: 403 });
  }
  return null;
}
