import { and, eq } from "drizzle-orm";
import { applyInventoryAdjustments, getDb } from "../../../../db";
import { sales } from "../../../../db/schema";
import type { InvoiceAdjustment, InvoiceItem } from "../../../../lib/types";
import { requirePermission } from "../../../../lib/api-auth";

const REASONS = new Set(["CAMBIO DE PRECIO", "CALIDAD", "RECHAZO PARCIAL", "PRODUCTO ELIMINADO", "CARGA POR ERROR", "OTRO"]);

function parseItems(value: string | null): InvoiceItem[] {
  try {
    const parsed = JSON.parse(value || "[]") as InvoiceItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validItems(value: unknown): value is InvoiceItem[] {
  return Array.isArray(value) && value.length <= 25 && value.every((item) => item && typeof item === "object"
    && typeof item.product === "string" && item.product.trim().length > 0
    && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
    && Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0);
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "invoicing");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const saleId = Number(payload.saleId);
    const reason = String(payload.reason || "").trim().toUpperCase() as InvoiceAdjustment["reason"];
    const notes = String(payload.notes || "").trim();
    const internalNotes = String(payload.internalNotes || "").trim();
    if (!Number.isInteger(saleId) || saleId <= 0) return Response.json({ error: "Factura inválida." }, { status: 400 });
    if (!REASONS.has(reason)) return Response.json({ error: "Selecciona el motivo del ajuste." }, { status: 400 });
    if (!notes) return Response.json({ error: "Describe brevemente la razón del ajuste." }, { status: 400 });
    if (!validItems(payload.items)) return Response.json({ error: "Revisa los productos, cantidades y precios del ajuste." }, { status: 400 });

    const db = await getDb();
    const [existing] = await db.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).limit(1);
    if (!existing?.invoiceNumber) return Response.json({ error: "La venta todavía no tiene una factura emitida." }, { status: 409 });

    const previousItems = parseItems(existing.invoiceItems);
    // Bug 8 fix: preserve purchasePrice from previous items so profit stays correct
    // on multi-item sales after an adjustment.
    const adjustedItems = (payload.items as InvoiceItem[]).map((item) => {
      const row = item as InvoiceItem;
      const previousMatch = previousItems.find(
        (p) => p.product === row.product.trim()
          && (p.presentation || "") === (row.presentation?.trim() || "")
          && (p.size || "") === (row.size?.trim() || "")
          && (p.label || "") === (row.label?.trim() || ""),
      );
      return {
        product: row.product.trim(),
        presentation: row.presentation?.trim() || "",
        size: row.size?.trim() || "",
        label: row.label?.trim() || "",
        quantity: Number(row.quantity),
        unitPrice: Number(row.unitPrice),
        purchasePrice: previousMatch?.purchasePrice ?? existing.purchasePrice ?? undefined,
      };
    });
    const previousTotal = previousItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const adjustedTotal = adjustedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const difference = adjustedTotal - previousTotal;
    const history = (() => { try { const parsed = JSON.parse(existing.invoiceAdjustments || "[]") as InvoiceAdjustment[]; return Array.isArray(parsed) ? parsed : []; } catch { return []; } })();
    const adjustment: InvoiceAdjustment = {
      number: `ADJ-${existing.invoiceNumber}-${String(history.length + 1).padStart(2, "0")}`,
      createdAt: new Date().toISOString(),
      reason,
      notes,
      internalNotes,
      previousItems,
      adjustedItems,
      previousTotal,
      adjustedTotal,
      difference,
      documentType: difference < 0 ? "NOTA DE CREDITO" : difference > 0 ? "NOTA DE DEBITO" : "SIN CAMBIO",
    };
    const boxes = adjustedItems.reduce((sum, item) => sum + item.quantity, 0);
    // Bug 8 fix: use per-item purchasePrice when available; fall back to sale-level cost.
    const itemCostsKnown = adjustedItems.every((item) => Number.isFinite(Number(item.purchasePrice)));
    const totalCost = itemCostsKnown
      ? adjustedItems.reduce((sum, item) => sum + Number(item.purchasePrice) * item.quantity, 0)
      : existing.purchasePrice == null ? null : existing.purchasePrice * boxes;
    const profit = totalCost == null ? null : adjustedTotal - totalCost;

    // Bug 9 fix: return freed boxes to the inventory lot when box count decreases,
    // or reserve extra boxes if the adjustment increases the count.
    if (existing.operationType === "IMPORTED_INVENTORY" && boxes !== existing.boxes) {
      const delta = boxes - existing.boxes;
      await applyInventoryAdjustments([{
        inventoryLotId: existing.inventoryLotId!,
        quantityDelta: -delta,
      }]);
    }
    const [sale] = await db.update(sales).set({
      originalInvoiceItems: existing.originalInvoiceItems || existing.invoiceItems,
      invoiceItems: JSON.stringify(adjustedItems),
      invoiceAdjustments: JSON.stringify([...history, adjustment]),
      boxes,
      product: adjustedItems.length === 0 ? existing.product : adjustedItems.length === 1 ? adjustedItems[0].product : `${adjustedItems[0].product} + ${adjustedItems.length - 1} partida(s)`,
      presentation: adjustedItems.length === 1 ? adjustedItems[0].presentation || null : null,
      size: adjustedItems.length === 1 ? adjustedItems[0].size || null : null,
      label: adjustedItems.length === 1 ? adjustedItems[0].label || null : null,
      salePrice: adjustedItems.length === 1 ? adjustedItems[0].unitPrice : null,
      total: adjustedTotal,
      profit,
    }).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).returning();
    return Response.json({ sale, adjustment }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo registrar el ajuste." }, { status: 500 });
  }
}
