import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sellerLiquidations } from "../../../../db/schema";
import { requireAnyPermission, requirePermission } from "../../../../lib/api-auth";
import { clean } from "../../../../lib/auth";

export async function GET(request: Request) {
  try {
    const guard = requireAnyPermission(request, ["administration", "reports"]);
    if (guard) return guard;

    const db = await getDb();
    const liquidations = await db
      .select()
      .from(sellerLiquidations)
      .where(eq(sellerLiquidations.organizationCode, "USA"))
      .orderBy(desc(sellerLiquidations.liquidationDate), desc(sellerLiquidations.id));
    return Response.json({ liquidations });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible consultar las liquidaciones." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = requirePermission(request, "administration");
    if (denied) return denied;

    const payload = await request.json() as Record<string, unknown>;
    const sellerName = clean(payload.sellerName);
    const liquidationDate = clean(payload.liquidationDate);
    const notes = clean(payload.notes);
    const amount = Number(payload.amount);
    if (!sellerName || !liquidationDate || !/^\d{4}-\d{2}-\d{2}$/.test(liquidationDate)) {
      return Response.json({ error: "Selecciona vendedor y fecha de liquidacion." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "El monto liquidado debe ser mayor que cero." }, { status: 400 });
    }
    const db = await getDb();
    const [liquidation] = await db.insert(sellerLiquidations).values({
      organizationCode: "USA",
      sellerName,
      liquidationDate,
      amount,
      notes: notes || null,
    }).returning();
    return Response.json({ liquidation }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible registrar la liquidacion." }, { status: 500 });
  }
}
