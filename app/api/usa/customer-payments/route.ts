import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { customerPayments, sales } from "../../../../db/schema";
import { requireAnyPermission, requirePermission } from "../../../../lib/api-auth";
import { clean } from "../../../../lib/auth";

const PAYMENT_METHODS = new Set(["ACH", "WIRE", "CHECK", "CASH", "CARD", "OTRO"]);

export async function GET(request: Request) {
  const denied = requireAnyPermission(request, ["collections", "reports", "sales_view"]);
  if (denied) return denied;
  try {
    const db = await getDb();
    const payments = await db.select().from(customerPayments)
      .where(eq(customerPayments.organizationCode, "USA"))
      .orderBy(desc(customerPayments.paymentDate), desc(customerPayments.id));
    return Response.json({ payments });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible consultar los pagos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "collections");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const saleId = Number(payload.saleId);
    const paymentDate = clean(payload.paymentDate);
    const amount = Number(payload.amount);
    const method = clean(payload.method).toUpperCase() || "OTRO";
    const reference = clean(payload.reference);
    const notes = clean(payload.notes);
    if (!Number.isInteger(saleId) || saleId <= 0) return Response.json({ error: "Selecciona una factura válida." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return Response.json({ error: "Selecciona una fecha de pago válida." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "El pago debe ser mayor que cero." }, { status: 400 });
    if (amount > 100000000) return Response.json({ error: "El monto del pago no es válido." }, { status: 400 });
    if (!PAYMENT_METHODS.has(method)) return Response.json({ error: "Selecciona un método de pago válido." }, { status: 400 });

    const db = await getDb();
    const [sale] = await db.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).limit(1);
    if (!sale || !sale.invoiceNumber || sale.canceledAt) return Response.json({ error: "Solo se pueden registrar pagos de facturas activas." }, { status: 409 });
    const previousPayments = await db.select({ amount: customerPayments.amount }).from(customerPayments)
      .where(and(eq(customerPayments.organizationCode, "USA"), eq(customerPayments.saleId, saleId)));
    const paid = previousPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const total = Number(sale.total || 0);
    const balance = total - paid;
    if (total <= 0) return Response.json({ error: "La factura no tiene un total válido para cobrar." }, { status: 409 });
    if (amount > balance + 0.005) return Response.json({ error: `El saldo disponible es ${balance.toFixed(2)}.` }, { status: 409 });

    const [payment] = await db.insert(customerPayments).values({
      organizationCode: "USA",
      saleId,
      customer: sale.customer,
      paymentDate,
      amount,
      method,
      reference: reference || null,
      notes: notes || null,
    }).returning();
    const nextPaid = paid + amount;
    const nextStatus = total - nextPaid <= 0.005 ? "PAGADA" : "ABONO";
    const [updatedSale] = await db.update(sales).set({ paymentStatus: nextStatus })
      .where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).returning();
    return Response.json({ payment, sale: updatedSale, paid: nextPaid, balance: Math.max(0, total - nextPaid) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible registrar el pago." }, { status: 500 });
  }
}
