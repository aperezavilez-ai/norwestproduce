import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { applyInventoryAdjustments, getDb } from "../../../../db";
import { inventoryLots, sales } from "../../../../db/schema";
import { requireAnyPermission, requirePermission } from "../../../../lib/api-auth";
import { groupInventoryAllocations, inventoryAllocationDelta, type InventoryAllocation } from "../../../../lib/inventory-allocations";
import type { InvoiceItem, NewSale } from "../../../../lib/types";

const LOAD_STATUSES = new Set(["OK", "PAS", "POSIBLE AJUSTE", "USDA REQUESTED"]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No fue posible completar la operación.";
}

function currentDateInMcAllen() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function inventoryAllocationsFor(row: { operationType: string; inventoryLotId?: number | null; boxes: number; invoiceItems?: string | null }) {
  if (row.operationType !== "IMPORTED_INVENTORY") return [];
  try {
    const items = JSON.parse(row.invoiceItems || "[]") as InvoiceItem[];
    const allocations = items
      .map((item) => ({ inventoryLotId: Number(item.inventoryLotId), quantity: Number(item.quantity) }))
      .filter((item) => Number.isInteger(item.inventoryLotId) && item.inventoryLotId > 0 && Number.isFinite(item.quantity) && item.quantity > 0);
    if (allocations.length) return allocations;
  } catch { /* Fall back to the legacy single-lot sale fields. */ }
  return row.inventoryLotId ? [{ inventoryLotId: row.inventoryLotId, quantity: row.boxes }] : [];
}

type Database = Awaited<ReturnType<typeof getDb>>;

async function restoreInventory(db: Database, allocations: InventoryAllocation[]) {
  void db;
  await applyInventoryAdjustments(groupInventoryAllocations(allocations).map((allocation) => ({
    inventoryLotId: allocation.inventoryLotId,
    quantityDelta: allocation.quantity,
  })));
}

async function reserveInventory(db: Database, allocations: InventoryAllocation[]) {
  void db;
  try {
    await applyInventoryAdjustments(groupInventoryAllocations(allocations).map((allocation) => ({
      inventoryLotId: allocation.inventoryLotId,
      quantityDelta: -allocation.quantity,
    })));
    return true;
  } catch {
    return false;
  }
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function GET(request: Request) {
  const denied = requireAnyPermission(request, ["sales_view", "sales_edit", "invoicing", "collections", "reports"]);
  if (denied) return denied;
  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(sales)
      .where(eq(sales.organizationCode, "USA"))
      .orderBy(desc(sales.saleDate), desc(sales.id));
    return Response.json({ sales: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const permissions = JSON.parse(request.headers.get("x-session-permissions") ?? "[]") as string[];
  if (!permissions.includes("administration")) {
    return Response.json({ error: "No tienes permiso para esta acción." }, { status: 403 });
  }
  try {
    const db = await getDb();
    const existingSales = await db
      .select({ id: sales.id, inventoryLotId: sales.inventoryLotId, operationType: sales.operationType, boxes: sales.boxes, invoiceItems: sales.invoiceItems })
      .from(sales)
      .where(eq(sales.organizationCode, "USA"));

    for (const row of existingSales) {
      for (const allocation of inventoryAllocationsFor(row)) {
        await db
          .update(inventoryLots)
          .set({ availableBoxes: sql`${inventoryLots.availableBoxes} + ${allocation.quantity}` })
          .where(and(eq(inventoryLots.id, allocation.inventoryLotId), eq(inventoryLots.organizationCode, "USA")));
      }
    }

    await db.delete(sales).where(eq(sales.organizationCode, "USA"));
    return Response.json({ deletedCount: existingSales.length });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "sales_edit");
  if (denied) return denied;
  try {
    const db = await getDb();
    const payload = (await request.json()) as Partial<NewSale> & { items?: InvoiceItem[] };
    const requestedOperationType = payload.operationType === "IMPORTED_INVENTORY" ? "IMPORTED_INVENTORY" : "DIRECT_RESALE";
    if (!payload.saleDate || !payload.customer?.trim() || !payload.warehouse?.trim() || !payload.pickupNumber?.trim() || (requestedOperationType === "DIRECT_RESALE" && !payload.product?.trim())) {
      return Response.json({ error: "Completa fecha, cliente, bodega, PU# y producto." }, { status: 400 });
    }
    const pickupDate = typeof payload.pickupDate === "string" && payload.pickupDate ? payload.pickupDate : null;
    if (pickupDate && pickupDate < currentDateInMcAllen()) {
      return Response.json({ error: "La fecha de pickup no puede ser anterior al día actual." }, { status: 400 });
    }
    const dueDate = pickupDate ? new Date(new Date(`${pickupDate}T00:00:00Z`).getTime() + 21 * 86400000).toISOString().slice(0, 10) : null;
    const operationType = requestedOperationType;
    const directItems = operationType === "DIRECT_RESALE" && Array.isArray(payload.items) ? payload.items.map((item) => ({ product: String(item.product || "").trim(), presentation: item.presentation?.trim() || "", size: item.size?.trim() || "", label: item.label?.trim() || "", quantity: Number(item.quantity), purchasePrice: Number(item.purchasePrice), unitPrice: Number(item.unitPrice) })) : [];
    if (operationType === "DIRECT_RESALE" && (!directItems.length || directItems.length > 25 || directItems.some((item) => !item.product || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.purchasePrice) || item.purchasePrice < 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0))) {
      return Response.json({ error: "Revisa productos, bultos/cajas, precio de compra y precio de venta." }, { status: 400 });
    }
    let lineItems: InvoiceItem[] = directItems;
    let inventoryLotId: number | null = null;
    if (operationType === "IMPORTED_INVENTORY" && Array.isArray(payload.items) && payload.items.length) {
      const requestedItems = payload.items.map((item) => ({
        inventoryLotId: Number(item.inventoryLotId),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }));
      if (requestedItems.length > 25 || requestedItems.some((item) => !Number.isInteger(item.inventoryLotId) || item.inventoryLotId <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
        return Response.json({ error: "Revisa productos, bultos/cajas y precio de venta del inventario." }, { status: 400 });
      }
      const lotIds = requestedItems.map((item) => item.inventoryLotId);
      const fetchedLots = await db.select().from(inventoryLots)
        .where(and(eq(inventoryLots.organizationCode, "USA"), inArray(inventoryLots.id, lotIds)));
      const lotById = new Map(fetchedLots.map((lot) => [lot.id, lot]));
      const importedItems: InvoiceItem[] = [];
      for (const item of requestedItems) {
        const lot = lotById.get(item.inventoryLotId);
        if (!lot || lot.availableBoxes < item.quantity) return Response.json({ error: "Una partida seleccionada ya no tiene suficientes cajas disponibles." }, { status: 409 });
        importedItems.push({
          inventoryLotId: lot.id,
          product: lot.product,
          presentation: lot.presentation || "",
          size: lot.size || "",
          label: lot.label || "",
          quantity: item.quantity,
          purchasePrice: lot.unitCost ?? 0,
          unitPrice: item.unitPrice,
        });
      }
      lineItems = importedItems;
      inventoryLotId = importedItems[0]?.inventoryLotId ?? null;
      const firstLot = inventoryLotId ? await db.select().from(inventoryLots).where(and(eq(inventoryLots.id, inventoryLotId), eq(inventoryLots.organizationCode, "USA"))).limit(1) : [];
      const lot = firstLot[0];
      if (lot) {
        payload.product = payload.product?.trim() || lot.product;
        payload.presentation = payload.presentation?.trim() || lot.presentation || "";
        payload.size = payload.size?.trim() || lot.size || "";
        payload.label = payload.label?.trim() || lot.label || "";
      }
    }
    const boxes = lineItems.length ? lineItems.reduce((sum, item) => sum + Number(item.quantity), 0) : Number(payload.boxes ?? 0);
    const salePrice = lineItems.length === 1 ? lineItems[0].unitPrice : payload.salePrice == null ? null : Number(payload.salePrice);
    if (!Number.isFinite(boxes) || boxes <= 0) {
      return Response.json({ error: "La cantidad de cajas debe ser mayor que cero." }, { status: 400 });
    }
    const total = lineItems.length ? lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) : salePrice == null || !Number.isFinite(salePrice) ? null : boxes * salePrice;
    let purchasePrice = payload.purchasePrice == null ? null : Number(payload.purchasePrice);
    if (operationType === "IMPORTED_INVENTORY" && !lineItems.length) {
      inventoryLotId = Number(payload.inventoryLotId);
      if (!Number.isInteger(inventoryLotId) || inventoryLotId <= 0) {
        return Response.json({ error: "Selecciona una partida disponible del inventario." }, { status: 400 });
      }
      const [lot] = await db.select().from(inventoryLots).where(and(
        eq(inventoryLots.id, inventoryLotId),
        eq(inventoryLots.organizationCode, "USA"),
        gte(inventoryLots.availableBoxes, boxes),
      )).limit(1);
      if (!lot) return Response.json({ error: "La partida seleccionada ya no tiene suficientes cajas disponibles." }, { status: 409 });
      purchasePrice = lot.unitCost;
      payload.product = payload.product?.trim() || lot.product;
      payload.presentation = payload.presentation?.trim() || lot.presentation || "";
      payload.size = payload.size?.trim() || lot.size || "";
      payload.label = payload.label?.trim() || lot.label || "";
    }
    const profit = lineItems.length ? lineItems.reduce((sum, item) => sum + (item.unitPrice - Number(item.purchasePrice ?? 0)) * item.quantity, 0) : total == null || purchasePrice == null ? null : (salePrice! - purchasePrice) * boxes;
    const primary = lineItems[0];
    const allocations = operationType === "IMPORTED_INVENTORY"
      ? lineItems.some((item) => item.inventoryLotId)
        ? lineItems.filter((item) => item.inventoryLotId).map((item) => ({ inventoryLotId: item.inventoryLotId!, quantity: item.quantity }))
        : inventoryLotId ? [{ inventoryLotId, quantity: boxes }] : []
      : [];
    if (allocations.length && !(await reserveInventory(db, allocations))) {
      return Response.json({ error: "El inventario cambio mientras se guardaba. Revisa las cajas disponibles e intenta nuevamente." }, { status: 409 });
    }

    let created: typeof sales.$inferSelect | undefined;
    try {
      [created] = await db.insert(sales).values({
      organizationCode: "USA",
      operationType,
      supplier: payload.supplier?.trim() || null,
      inventoryLotId,
      saleDate: payload.saleDate,
      customer: payload.customer.trim(),
      sellerName: payload.sellerName?.trim() || null,
      purchaseOrder: payload.purchaseOrder?.trim() || null,
      warehouse: payload.warehouse.trim(),
      pickupNumber: payload.pickupNumber.trim(),
      boxes,
      product: lineItems.length > 1 ? `${primary.product} + ${lineItems.length - 1} partida(s)` : primary?.product || (payload.product ?? "").trim(),
      presentation: lineItems.length > 1 ? null : primary?.presentation || payload.presentation?.trim() || null,
      size: lineItems.length > 1 ? null : primary?.size || payload.size?.trim() || null,
      label: lineItems.length > 1 ? null : primary?.label || payload.label?.trim() || null,
      purchasePrice: lineItems.length > 1 ? null : primary?.purchasePrice ?? (Number.isFinite(purchasePrice) ? purchasePrice : null),
      salePrice: lineItems.length > 1 ? null : primary?.unitPrice ?? (Number.isFinite(salePrice) ? salePrice : null),
      profit,
      shipDate: payload.shipDate || null,
      shipTo: typeof payload.shipTo === "string" ? payload.shipTo.trim() || null : null,
      pickupDate,
      total,
      dueDate,
      loadStatus: payload.loadStatus?.trim() || "OK",
      paymentStatus: "PENDIENTE",
      invoiceNumber: payload.invoiceNumber?.trim() || null,
      invoiceItems: lineItems.length ? JSON.stringify(lineItems) : null,
      }).returning();
    } catch (error) {
      if (allocations.length) await restoreInventory(db, allocations).catch(() => undefined);
      throw error;
    }
    return Response.json({ sale: created }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = requirePermission(request, "sales_edit");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Venta inválida." }, { status: 400 });
    if (payload.cancelSale === true) {
      const db = await getDb();
      const canceledBy = typeof payload.canceledBy === "string" ? payload.canceledBy.trim().toUpperCase() : "";
      const cancellationReason = typeof payload.cancellationReason === "string" ? payload.cancellationReason.trim() : "";
      const allowedCustomerReasons = new Set(["Sin Razón", "Compró en otro lado", "Consiguió mejor precio", "No consiguió camión", "Canceló su cliente", "No le gustó la calidad"]);
      const allowedNwReasons = new Set(["Producto no disponible", "Producto sin calidad", "Producto llegará tarde"]);
      if (canceledBy !== "CLIENTE CANCELÓ" && canceledBy !== "NW CANCELÓ") return Response.json({ error: "Indica quién canceló la venta." }, { status: 400 });
      if (!(canceledBy === "CLIENTE CANCELÓ" ? allowedCustomerReasons : allowedNwReasons).has(cancellationReason)) return Response.json({ error: "Selecciona una razón válida de cancelación." }, { status: 400 });
      const [existing] = await db.select().from(sales).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).limit(1);
      if (!existing) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
      if (existing.canceledAt) return Response.json({ error: "Esta venta ya está cancelada." }, { status: 409 });
      if (existing.invoiceNumber) return Response.json({ error: "Una venta facturada no puede eliminarse. Utiliza Crear ajuste desde la factura." }, { status: 409 });
      const canceledAt = new Date().toISOString();
      const [sale] = await db.update(sales).set({ canceledAt, canceledBy, cancellationReason, cancellationDetail: cancellationReason })
        .where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"), isNull(sales.canceledAt), isNull(sales.invoiceNumber))).returning();
      if (!sale) return Response.json({ error: "La venta ya fue cancelada." }, { status: 409 });
      try {
        await restoreInventory(db, inventoryAllocationsFor(existing));
      } catch (error) {
        await db.update(sales).set({ canceledAt: null, canceledBy: null, cancellationReason: null, cancellationDetail: null })
          .where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"), eq(sales.canceledAt, canceledAt)))
          .catch(() => undefined);
        throw error;
      }
      return Response.json({ sale });
    }
    if (payload.editSale === true) {
      const db = await getDb();
      const [existing] = await db.select().from(sales).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).limit(1);
      if (!existing) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
      if (existing.canceledAt) return Response.json({ error: "Una venta cancelada no puede editarse." }, { status: 409 });
      if (existing.invoiceNumber) return Response.json({ error: "Una venta facturada ya no puede editarse." }, { status: 409 });

      const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
      const saleDate = text(payload.saleDate);
      const customer = text(payload.customer);
      const warehouse = text(payload.warehouse);
      const pickupNumber = text(payload.pickupNumber);
      const product = text(payload.product);
      const operationType = payload.operationType === "IMPORTED_INVENTORY" ? "IMPORTED_INVENTORY" : "DIRECT_RESALE";
      if (!saleDate || !customer || !warehouse || !pickupNumber || (operationType === "DIRECT_RESALE" && !product)) {
        return Response.json({ error: "Completa fecha, cliente, bodega, PU# y producto." }, { status: 400 });
      }
      const pickupDate = text(payload.pickupDate) || null;
      if (pickupDate && pickupDate < currentDateInMcAllen()) {
        return Response.json({ error: "La fecha de pickup no puede ser anterior al día actual." }, { status: 400 });
      }
      const directItems = operationType === "DIRECT_RESALE" && Array.isArray(payload.items) ? (payload.items as InvoiceItem[]).map((item) => ({ product: String(item.product || "").trim(), presentation: item.presentation?.trim() || "", size: item.size?.trim() || "", label: item.label?.trim() || "", quantity: Number(item.quantity), purchasePrice: Number(item.purchasePrice), unitPrice: Number(item.unitPrice) })) : [];
      if (operationType === "DIRECT_RESALE" && (!directItems.length || directItems.length > 25 || directItems.some((item) => !item.product || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.purchasePrice) || item.purchasePrice < 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0))) {
        return Response.json({ error: "Revisa productos, bultos/cajas, precio de compra y precio de venta." }, { status: 400 });
      }
      let lineItems: InvoiceItem[] = directItems;
      let inventoryLotId: number | null = null;
      const oldAllocations = inventoryAllocationsFor(existing);
      if (operationType === "IMPORTED_INVENTORY" && Array.isArray(payload.items) && payload.items.length) {
        const requestedItems = (payload.items as InvoiceItem[]).map((item) => ({
          inventoryLotId: Number(item.inventoryLotId),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        }));
        if (requestedItems.length > 25 || requestedItems.some((item) => !Number.isInteger(item.inventoryLotId) || item.inventoryLotId <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
          return Response.json({ error: "Revisa productos, bultos/cajas y precio de venta del inventario." }, { status: 400 });
        }
        const oldByLot = new Map(groupInventoryAllocations(oldAllocations).map((item) => [item.inventoryLotId, item.quantity]));
        const requestedByLot = new Map(groupInventoryAllocations(requestedItems).map((item) => [item.inventoryLotId, item.quantity]));
        const editLotIds = requestedItems.map((item) => item.inventoryLotId);
        const editFetchedLots = await db.select().from(inventoryLots)
          .where(and(eq(inventoryLots.organizationCode, "USA"), inArray(inventoryLots.id, editLotIds)));
        const editLotById = new Map(editFetchedLots.map((lot) => [lot.id, lot]));
        const importedItems: InvoiceItem[] = [];
        for (const item of requestedItems) {
          const lot = editLotById.get(item.inventoryLotId);
          if (!lot) return Response.json({ error: "No se encontró una partida de inventario seleccionada." }, { status: 404 });
          const usableBoxes = lot.availableBoxes + (oldByLot.get(lot.id) || 0);
          const requestedBoxes = requestedByLot.get(lot.id) || 0;
          if (usableBoxes < requestedBoxes) return Response.json({ error: `La partida ${lot.pickupNumber || lot.product} sólo tiene ${usableBoxes} cajas disponibles para esta venta.` }, { status: 409 });
          importedItems.push({
            inventoryLotId: lot.id,
            product: lot.product,
            presentation: lot.presentation || "",
            size: lot.size || "",
            label: lot.label || "",
            quantity: item.quantity,
            purchasePrice: lot.unitCost ?? 0,
            unitPrice: item.unitPrice,
          });
        }
        lineItems = importedItems;
        inventoryLotId = importedItems[0]?.inventoryLotId ?? null;
        const firstItem = importedItems[0];
        if (firstItem) {
          payload.product = product || firstItem.product;
          payload.presentation = text(payload.presentation) || firstItem.presentation || "";
          payload.size = text(payload.size) || firstItem.size || "";
          payload.label = text(payload.label) || firstItem.label || "";
        }
      }
      const boxes = lineItems.length ? lineItems.reduce((sum, item) => sum + item.quantity, 0) : Number(payload.boxes);
      const salePrice = lineItems.length === 1 ? lineItems[0].unitPrice : Number(payload.salePrice);
      if (!Number.isInteger(boxes) || boxes <= 0) return Response.json({ error: "La cantidad de cajas debe ser un entero mayor que cero." }, { status: 400 });
      if (!lineItems.length && (!Number.isFinite(salePrice) || salePrice < 0)) return Response.json({ error: "Ingresa un precio de venta valido." }, { status: 400 });

      if (operationType !== existing.operationType) return Response.json({ error: "El tipo de operación de una venta existente no puede cambiarse." }, { status: 400 });

      let purchasePrice = payload.purchasePrice == null || payload.purchasePrice === "" ? null : Number(payload.purchasePrice);
      if (operationType === "DIRECT_RESALE" && !directItems.length && (purchasePrice == null || !Number.isFinite(purchasePrice) || purchasePrice < 0)) {
        return Response.json({ error: "Ingresa un precio de compra válido." }, { status: 400 });
      }
      if (operationType === "IMPORTED_INVENTORY" && !lineItems.length) {
        inventoryLotId = Number(payload.inventoryLotId);
        if (!Number.isInteger(inventoryLotId) || inventoryLotId <= 0) return Response.json({ error: "Selecciona una partida disponible del inventario." }, { status: 400 });
        const [lot] = await db.select().from(inventoryLots).where(and(eq(inventoryLots.id, inventoryLotId), eq(inventoryLots.organizationCode, "USA"))).limit(1);
        if (!lot) return Response.json({ error: "No se encontró la partida de inventario seleccionada." }, { status: 404 });
        const usableBoxes = lot.availableBoxes + (existing.inventoryLotId === inventoryLotId ? existing.boxes : 0);
        if (usableBoxes < boxes) return Response.json({ error: `La partida sólo tiene ${usableBoxes} cajas disponibles para esta venta.` }, { status: 409 });
        purchasePrice = lot.unitCost;
        payload.product = product || lot.product;
        payload.presentation = text(payload.presentation) || lot.presentation || "";
        payload.size = text(payload.size) || lot.size || "";
        payload.label = text(payload.label) || lot.label || "";

      }

      const total = lineItems.length ? lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) : boxes * salePrice;
      const profit = lineItems.length ? lineItems.reduce((sum, item) => sum + (item.unitPrice - Number(item.purchasePrice ?? 0)) * item.quantity, 0) : purchasePrice == null ? null : (salePrice - purchasePrice) * boxes;
      const primary = lineItems[0];
      const dueDate = pickupDate ? new Date(new Date(`${pickupDate}T00:00:00Z`).getTime() + 21 * 86400000).toISOString().slice(0, 10) : null;
      const newAllocations = operationType === "IMPORTED_INVENTORY"
        ? lineItems.some((item) => item.inventoryLotId)
          ? lineItems.filter((item) => item.inventoryLotId).map((item) => ({ inventoryLotId: item.inventoryLotId!, quantity: item.quantity }))
          : inventoryLotId ? [{ inventoryLotId, quantity: boxes }] : []
        : [];
      const allocationDelta = inventoryAllocationDelta(oldAllocations, newAllocations);
      const inventoryChanges = [
        ...allocationDelta.reserve.map((allocation) => ({ inventoryLotId: allocation.inventoryLotId, quantityDelta: -allocation.quantity })),
        ...allocationDelta.release.map((allocation) => ({ inventoryLotId: allocation.inventoryLotId, quantityDelta: allocation.quantity })),
      ];
      try {
        await applyInventoryAdjustments(inventoryChanges);
      } catch {
        return Response.json({ error: "El inventario cambió mientras se actualizaba. Revisa las cajas disponibles e intenta nuevamente." }, { status: 409 });
      }

      let sale: typeof sales.$inferSelect | undefined;
      try {
        [sale] = await db.update(sales).set({
        supplier: text(payload.supplier) || null,
        inventoryLotId,
        saleDate,
        customer,
        sellerName: text(payload.sellerName) || null,
        purchaseOrder: text(payload.purchaseOrder) || null,
        warehouse,
        pickupNumber,
        boxes,
        product: lineItems.length > 1 ? `${primary.product} + ${lineItems.length - 1} partida(s)` : primary?.product || product,
        presentation: lineItems.length > 1 ? null : primary?.presentation || text(payload.presentation) || null,
        size: lineItems.length > 1 ? null : primary?.size || text(payload.size) || null,
        label: lineItems.length > 1 ? null : primary?.label || text(payload.label) || null,
        purchasePrice: lineItems.length > 1 ? null : primary?.purchasePrice ?? purchasePrice,
        salePrice: lineItems.length > 1 ? null : primary?.unitPrice ?? salePrice,
        profit,
        shipDate: null,
        shipTo: text(payload.shipTo) || null,
        pickupDate,
        total,
        dueDate,
        invoiceItems: lineItems.length ? JSON.stringify(lineItems) : null,
        }).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"), isNull(sales.invoiceNumber))).returning();
      } catch (error) {
        await applyInventoryAdjustments(inventoryChanges.map((change) => ({
          inventoryLotId: change.inventoryLotId,
          quantityDelta: -change.quantityDelta,
        }))).catch(() => undefined);
        throw error;
      }
      if (!sale) {
        await applyInventoryAdjustments(inventoryChanges.map((change) => ({
          inventoryLotId: change.inventoryLotId,
          quantityDelta: -change.quantityDelta,
        }))).catch(() => undefined);
        return Response.json({ error: "La venta fue facturada mientras se editaba y ya no puede modificarse." }, { status: 409 });
      }
      return Response.json({ sale });
    }
    if (Array.isArray(payload.items)) {
      const items = payload.items as InvoiceItem[];
      const validItems = items.length > 1 && items.length <= 25 && items.every((item) => typeof item.product === "string" && item.product.trim() && Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 && Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0);
      if (!validItems) return Response.json({ error: "Revisa los productos, bultos/cajas y precios de la carga." }, { status: 400 });
      const db = await getDb();
      const [existing] = await db.select().from(sales).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).limit(1);
      if (!existing) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
      if (existing.canceledAt) return Response.json({ error: "Una venta cancelada no puede modificarse." }, { status: 409 });
      if (existing.invoiceNumber) return Response.json({ error: "La factura ya fue emitida. Usa Crear ajuste para conservar el historial." }, { status: 409 });
      const normalized = items.map((item) => ({ product: item.product.trim(), presentation: item.presentation?.trim() || "", size: item.size?.trim() || "", label: item.label?.trim() || "", quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), purchasePrice: Number.isFinite(Number(item.purchasePrice)) ? Number(item.purchasePrice) : undefined }));
      const boxes = normalized.reduce((sum, item) => sum + item.quantity, 0);
      const total = normalized.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const itemCostsKnown = normalized.every((item) => item.purchasePrice != null);
      const profit = itemCostsKnown ? total - normalized.reduce((sum, item) => sum + Number(item.purchasePrice) * item.quantity, 0) : existing.purchasePrice == null ? null : total - existing.purchasePrice * boxes;
      const [sale] = await db.update(sales).set({ invoiceItems: JSON.stringify(normalized), boxes, salePrice: null, total, profit, product: `${normalized[0].product} + ${normalized.length - 1} partida(s)`, presentation: null, size: null, label: null })
        .where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).returning();
      return Response.json({ sale });
    }
    if (typeof payload.loadStatus === "string") {
      const db = await getDb();
      const [existing] = await db.select({ canceledAt: sales.canceledAt, invoiceNumber: sales.invoiceNumber }).from(sales).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).limit(1);
      if (!existing) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
      if (existing.canceledAt) return Response.json({ error: "Una venta cancelada no puede modificarse." }, { status: 409 });
      if (existing.invoiceNumber) return Response.json({ error: "El estatus de una venta facturada ya no puede modificarse." }, { status: 409 });
      const loadStatus = payload.loadStatus.trim().toUpperCase();
      if (!LOAD_STATUSES.has(loadStatus)) return Response.json({ error: "Estatus inválido." }, { status: 400 });
      const now = new Date().toISOString();
      if (loadStatus === "PAS") {
        const pasReviewDays = Number(payload.pasReviewDays);
        if (!Number.isInteger(pasReviewDays) || pasReviewDays <= 0 || pasReviewDays > 365) {
          return Response.json({ error: "Indica de 1 a 365 días para revisar el PAS." }, { status: 400 });
        }
        const requestedStart = typeof payload.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) ? payload.startDate : localDateKey();
        const start = new Date(`${requestedStart}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() + pasReviewDays);
        const [sale] = await db.update(sales).set({
          loadStatus,
          statusUpdatedAt: now,
          pasReviewDays,
          pasReviewDueDate: start.toISOString().slice(0, 10),
        }).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).returning();
        if (!sale) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
        return Response.json({ sale });
      }
      const [sale] = await db.update(sales).set({
        loadStatus,
        statusUpdatedAt: now,
        pasReviewDays: null,
        pasReviewDueDate: null,
        usdaInspectionStatus: loadStatus === "USDA REQUESTED" ? "PENDING" : null,
        usdaInspectionObjectKey: loadStatus === "USDA REQUESTED" ? undefined : null,
        usdaInspectionFileName: loadStatus === "USDA REQUESTED" ? undefined : null,
        usdaInspectionContentType: loadStatus === "USDA REQUESTED" ? undefined : null,
        usdaInspectionUploadedAt: loadStatus === "USDA REQUESTED" ? undefined : null,
      }).where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"))).returning();
      if (!sale) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
      return Response.json({ sale });
    }
    const pickupDate = typeof payload.pickupDate === "string" && payload.pickupDate ? payload.pickupDate : null;
    if (pickupDate && pickupDate < currentDateInMcAllen()) {
      return Response.json({ error: "La fecha de pickup no puede ser anterior al día actual." }, { status: 400 });
    }
    const dueDate = pickupDate ? new Date(new Date(`${pickupDate}T00:00:00Z`).getTime() + 21 * 86400000).toISOString().slice(0, 10) : null;
    const db = await getDb();
    const [sale] = await db.update(sales).set({ pickupDate, dueDate })
      .where(and(eq(sales.id, id), eq(sales.organizationCode, "USA"), isNull(sales.canceledAt))).returning();
    if (!sale) return Response.json({ error: "No se encontró la venta." }, { status: 404 });
    return Response.json({ sale });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
