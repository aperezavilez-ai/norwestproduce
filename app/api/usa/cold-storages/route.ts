import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { coldStorages, inventoryLots, sales } from "../../../../db/schema";
import { requirePermission } from "../../../../lib/api-auth";
import { clean } from "../../../../lib/auth";

function normalizePayload(payload: Record<string, unknown>) {
  const name = clean(payload.name);
  const street = clean(payload.street);
  const exteriorNumber = clean(payload.exteriorNumber);
  const interiorNumber = clean(payload.interiorNumber);
  const stateCode = clean(payload.stateCode).toUpperCase();
  const stateName = clean(payload.stateName);
  const city = clean(payload.city);
  const postalCode = clean(payload.postalCode);
  const phone = clean(payload.phone).replace(/\D/g, "");
  const address = clean(payload.address) || [street, exteriorNumber, interiorNumber && `STE ${interiorNumber}`, city, stateCode, postalCode].filter(Boolean).join(", ");
  return { name, address, phone, stateCode, stateName, city, street, exteriorNumber, interiorNumber: interiorNumber || null, postalCode };
}

function isComplete(values: ReturnType<typeof normalizePayload>) {
  return values.name && values.street && values.exteriorNumber && values.stateCode && values.city && values.postalCode && values.phone.length === 10;
}

export async function GET(request: Request) {
  const denied = requirePermission(request, "catalogs");
  if (denied) return denied;
  try {
    const db = await getDb();
    const rows = await db.select().from(coldStorages)
      .where(eq(coldStorages.organizationCode, "USA"))
      .orderBy(asc(coldStorages.name));
    return Response.json({ coldStorages: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible consultar los cold storages." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "catalogs");
  if (denied) return denied;
  try {
    const values = normalizePayload(await request.json() as Record<string, unknown>);
    if (!isComplete(values)) {
      return Response.json({ error: "Completa nombre, estado, ciudad, calle, número exterior, ZIP y teléfono de 10 dígitos." }, { status: 400 });
    }
    const db = await getDb();
    const [coldStorage] = await db.insert(coldStorages).values({ organizationCode: "USA", ...values }).returning();
    return Response.json({ coldStorage }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar el cold storage." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = requirePermission(request, "catalogs");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const values = normalizePayload(payload);
    if (!Number.isInteger(id) || id <= 0 || !isComplete(values)) {
      return Response.json({ error: "Completa nombre, estado, ciudad, calle, número exterior, ZIP y teléfono de 10 dígitos." }, { status: 400 });
    }
    const db = await getDb();
    const [coldStorage] = await db.update(coldStorages)
      .set(values)
      .where(and(eq(coldStorages.id, id), eq(coldStorages.organizationCode, "USA")))
      .returning();
    if (!coldStorage) {
      return Response.json({ error: "No se encontró la bodega." }, { status: 404 });
    }
    return Response.json({ coldStorage });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible actualizar la bodega." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = requirePermission(request, "catalogs");
  if (denied) return denied;
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Bodega no válida." }, { status: 400 });
    const db = await getDb();
    const [coldStorage] = await db.select().from(coldStorages)
      .where(and(eq(coldStorages.id, id), eq(coldStorages.organizationCode, "USA"))).limit(1);
    if (!coldStorage) return Response.json({ error: "Bodega no encontrada." }, { status: 404 });
    const [saleReference, inventoryReference] = await Promise.all([
      db.select({ id: sales.id }).from(sales).where(and(eq(sales.organizationCode, "USA"), eq(sales.warehouse, coldStorage.name))).limit(1),
      db.select({ id: inventoryLots.id }).from(inventoryLots).where(and(eq(inventoryLots.organizationCode, "USA"), or(eq(inventoryLots.warehouse, coldStorage.name), eq(inventoryLots.coldStorage, coldStorage.name)))).limit(1),
    ]);
    if (saleReference.length || inventoryReference.length) {
      return Response.json({ error: "No se puede eliminar porque la bodega tiene ventas o inventario relacionado." }, { status: 409 });
    }
    await db.delete(coldStorages).where(and(eq(coldStorages.id, id), eq(coldStorages.organizationCode, "USA")));
    return Response.json({ deletedId: id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible eliminar la bodega." }, { status: 500 });
  }
}
