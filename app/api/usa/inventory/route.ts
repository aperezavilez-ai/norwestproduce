import { and, asc, desc, eq, gt, isNotNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { inventoryLots } from "../../../../db/schema";
import { requireAnyPermission, requirePermission } from "../../../../lib/api-auth";
import { clean } from "../../../../lib/auth";

export async function GET(request: Request) {
  const denied = requireAnyPermission(request, ["inventory", "sales_edit"]);
  if (denied) return denied;
  try {
    const includeAll = new URL(request.url).searchParams.get("all") === "1";
    const db = await getDb();
    const lots = await db.select().from(inventoryLots).where(includeAll
      ? eq(inventoryLots.organizationCode, "USA")
      : and(eq(inventoryLots.organizationCode, "USA"), gt(inventoryLots.availableBoxes, 0), isNotNull(inventoryLots.receivedConfirmedAt)))
      .orderBy(desc(inventoryLots.receivedDate), asc(inventoryLots.product));
    return Response.json({ lots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible consultar el inventario.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function inventoryItemsFromPayload(payload: Record<string, unknown>) {
  const rawItems = Array.isArray(payload.items) ? payload.items : [{
    product: payload.product,
    presentation: payload.presentation,
    size: payload.size,
    label: payload.label,
    totalBoxes: payload.totalBoxes,
    boxesPerPallet: payload.boxesPerPallet,
    purchasePrice: payload.purchasePrice,
  }];
  return rawItems.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      product: clean(row.product),
      presentation: clean(row.presentation),
      size: clean(row.size),
      label: clean(row.label),
      totalBoxes: Number(row.totalBoxes),
      boxesPerPallet: row.boxesPerPallet === "" || row.boxesPerPallet == null ? null : Number(row.boxesPerPallet),
      purchasePrice: row.purchasePrice === "" || row.purchasePrice == null ? NaN : Number(row.purchasePrice),
      purchaseCurrency: row.purchaseCurrency === "USD" ? "USD" : "MXN",
    };
  });
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "inventory");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const items = inventoryItemsFromPayload(payload);
    const totalBoxes = items.reduce((sum, item) => sum + (Number.isFinite(item.totalBoxes) ? item.totalBoxes : 0), 0);
    const exchangeRate = payload.exchangeRate === "" || payload.exchangeRate == null ? null : Number(payload.exchangeRate);
    const rawCurrencies = payload.costCurrencies && typeof payload.costCurrencies === "object" ? payload.costCurrencies as Record<string, unknown> : {};
    const currency = (key: string) => rawCurrencies[key] === "MXN" ? "MXN" : "USD";
    const toUsd = (value: number, selectedCurrency: string) => selectedCurrency === "MXN" ? value / (exchangeRate || 0) : value;
    const amount = (key: string) => payload[key] === "" || payload[key] == null ? 0 : Number(payload[key]);
    const freightCost = amount("freightCost");
    const mexicoCustomsCost = amount("mexicoCustomsCost");
    const usCustomsCost = amount("usCustomsCost");
    const overweightCost = amount("overweightCost");
    const redLightCost = amount("redLightCost");
    const redLightUsCost = amount("redLightUsCost");
    const coldStorageCost = amount("coldStorageCost");
    const additionalExpenses = Array.isArray(payload.additionalExpenses)
      ? payload.additionalExpenses.map((item) => {
          const expense = item as Record<string, unknown>;
          return { concept: clean(expense.concept), amount: Number(expense.amount) || 0, currency: expense.currency === "MXN" ? "MXN" : "USD" };
        }).filter((item) => item.concept || item.amount)
      : [];
    const attachments = Array.isArray(payload.attachments) ? payload.attachments.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const costAttachments = payload.costAttachments && typeof payload.costAttachments === "object" ? payload.costAttachments as Record<string, unknown> : {};
    if (!clean(payload.receivedDate) || !clean(payload.warehouse) || !items.length || items.some((item) => !item.product || !Number.isInteger(item.totalBoxes) || item.totalBoxes <= 0)) {
      return Response.json({ error: "Completa fecha de entrada, bodega, productos y cajas recibidas." }, { status: 400 });
    }
    const values = [freightCost, mexicoCustomsCost, usCustomsCost, overweightCost, redLightCost, redLightUsCost, coldStorageCost, ...items.map((item) => item.purchasePrice), ...additionalExpenses.map((item) => item.amount)];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Ingresa importes validos en los costos de importacion." }, { status: 400 });
    if (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return Response.json({ error: "Ingresa el tipo de cambio valido de esta importacion para calcular los totales en USD y MXN." }, { status: 400 });
    }
    if (items.some((item) => item.boxesPerPallet != null && (!Number.isInteger(item.boxesPerPallet) || item.boxesPerPallet <= 0))) {
      return Response.json({ error: "Cajas por pallet debe ser un numero entero mayor que cero." }, { status: 400 });
    }
    const itemPurchaseUsd = (item: (typeof items)[number]) => toUsd(item.purchasePrice, item.purchaseCurrency);
    const purchaseTotal = items.reduce((sum, item) => sum + itemPurchaseUsd(item) * item.totalBoxes, 0);
    const fixedImportCost = toUsd(freightCost, currency("freightCost"))
      + toUsd(mexicoCustomsCost, currency("mexicoCustomsCost"))
      + toUsd(usCustomsCost, currency("usCustomsCost"))
      + toUsd(overweightCost, currency("overweightCost"))
      + toUsd(redLightCost, currency("redLightCost"))
      + toUsd(redLightUsCost, currency("redLightUsCost"))
      + toUsd(coldStorageCost, currency("coldStorageCost"))
      + additionalExpenses.reduce((sum, item) => sum + toUsd(item.amount, item.currency), 0);
    const totalImportCost = purchaseTotal + fixedImportCost;
    const fixedCostPerBox = totalBoxes ? fixedImportCost / totalBoxes : 0;
    const sharedCurrencies = Object.fromEntries(["freightCost", "mexicoCustomsCost", "usCustomsCost", "overweightCost", "redLightCost", "redLightUsCost", "coldStorageCost"].map((key) => [key, currency(key)]));
    const db = await getDb();
    const insertedLots = await db.insert(inventoryLots).values(items.map((item) => {
      const purchasePrice = itemPurchaseUsd(item);
      const itemTotalImportCost = purchasePrice * item.totalBoxes + fixedCostPerBox * item.totalBoxes;
      return {
        organizationCode: "USA",
        receivedDate: clean(payload.receivedDate),
        loadDate: clean(payload.loadDate) || null,
        supplier: clean(payload.supplier) || null,
        warehouse: clean(payload.warehouse),
        pickupNumber: clean(payload.pickupNumber) || null,
        product: item.product,
        presentation: item.presentation || null,
        size: item.size || null,
        label: item.label || null,
        totalBoxes: item.totalBoxes,
        boxesPerPallet: item.boxesPerPallet,
        palletsPerLoad: null,
        availableBoxes: item.totalBoxes,
        unitCost: purchasePrice + fixedCostPerBox,
        purchasePrice,
        freightCost,
        mexicoCustomsCost,
        usCustomsCost,
        overweightCost,
        redLightCost,
        redLightUsCost,
        coldStorage: clean(payload.coldStorage) || clean(payload.warehouse) || null,
        coldStorageCost,
        additionalExpenses: JSON.stringify(additionalExpenses),
        attachments: JSON.stringify(attachments),
        costAttachments: JSON.stringify(costAttachments),
        costCurrencies: JSON.stringify({ ...sharedCurrencies, purchasePrice: item.purchaseCurrency }),
        exchangeRate,
        totalImportCost: itemTotalImportCost,
        receivedConfirmedAt: null,
      };
    })).returning();
    return Response.json({ lot: insertedLots[0], lots: insertedLots, totalImportCost }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible registrar la entrada.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = requirePermission(request, "inventory");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Partida inválida." }, { status: 400 });
    const db = await getDb();
    const [existing] = await db.select().from(inventoryLots).where(and(eq(inventoryLots.id, id), eq(inventoryLots.organizationCode, "USA"))).limit(1);
    if (!existing) return Response.json({ error: "No se encontró la partida." }, { status: 404 });
    if (payload.receive === true) {
      const [lot] = await db.update(inventoryLots).set({ receivedConfirmedAt: new Date().toISOString() })
        .where(and(eq(inventoryLots.id, id), eq(inventoryLots.organizationCode, "USA"))).returning();
      return Response.json({ lot });
    }
    if (existing.availableBoxes <= 0) return Response.json({ error: "Esta partida ya fue facturada por completo y no puede editarse." }, { status: 409 });

    if (Array.isArray(payload.items)) {
      const items = inventoryItemsFromPayload(payload);
      const totalBoxes = items.reduce((sum, item) => sum + (Number.isFinite(item.totalBoxes) ? item.totalBoxes : 0), 0);
      const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.map(Number).filter((itemId) => Number.isInteger(itemId) && itemId > 0) : [id];
      const exchangeRate = payload.exchangeRate === "" || payload.exchangeRate == null ? null : Number(payload.exchangeRate);
      const rawCurrencies = payload.costCurrencies && typeof payload.costCurrencies === "object" ? payload.costCurrencies as Record<string, unknown> : {};
      const currency = (key: string) => rawCurrencies[key] === "MXN" ? "MXN" : "USD";
      const toUsd = (value: number, selectedCurrency: string) => selectedCurrency === "MXN" ? value / (exchangeRate || 0) : value;
      const amount = (key: string) => payload[key] === "" || payload[key] == null ? 0 : Number(payload[key]);
      const freightCost = amount("freightCost");
      const mexicoCustomsCost = amount("mexicoCustomsCost");
      const usCustomsCost = amount("usCustomsCost");
      const overweightCost = amount("overweightCost");
      const redLightCost = amount("redLightCost");
      const redLightUsCost = amount("redLightUsCost");
      const coldStorageCost = amount("coldStorageCost");
      const additionalExpenses = Array.isArray(payload.additionalExpenses)
        ? payload.additionalExpenses.map((item) => {
            const expense = item as Record<string, unknown>;
            return { concept: clean(expense.concept), amount: Number(expense.amount) || 0, currency: expense.currency === "MXN" ? "MXN" : "USD" };
          }).filter((item) => item.concept || item.amount)
        : [];
      if (!clean(payload.receivedDate) || !clean(payload.warehouse) || !items.length || items.some((item) => !item.product || !Number.isInteger(item.totalBoxes) || item.totalBoxes <= 0)) {
        return Response.json({ error: "Completa fecha de entrada, bodega, productos y cajas recibidas." }, { status: 400 });
      }
      const values = [freightCost, mexicoCustomsCost, usCustomsCost, overweightCost, redLightCost, redLightUsCost, coldStorageCost, ...items.map((item) => item.purchasePrice), ...additionalExpenses.map((item) => item.amount)];
      if (values.some((value) => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Ingresa importes validos en los costos de importacion." }, { status: 400 });
      if (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        return Response.json({ error: "Ingresa el tipo de cambio valido de esta importacion para calcular los totales en USD y MXN." }, { status: 400 });
      }
      if (items.some((item) => item.boxesPerPallet != null && (!Number.isInteger(item.boxesPerPallet) || item.boxesPerPallet <= 0))) {
        return Response.json({ error: "Cajas por pallet debe ser un numero entero mayor que cero." }, { status: 400 });
      }
      const itemPurchaseUsd = (item: (typeof items)[number]) => toUsd(item.purchasePrice, item.purchaseCurrency);
      const purchaseTotal = items.reduce((sum, item) => sum + itemPurchaseUsd(item) * item.totalBoxes, 0);
      const fixedImportCost = toUsd(freightCost, currency("freightCost"))
        + toUsd(mexicoCustomsCost, currency("mexicoCustomsCost"))
        + toUsd(usCustomsCost, currency("usCustomsCost"))
        + toUsd(overweightCost, currency("overweightCost"))
        + toUsd(redLightCost, currency("redLightCost"))
        + toUsd(redLightUsCost, currency("redLightUsCost"))
        + toUsd(coldStorageCost, currency("coldStorageCost"))
        + additionalExpenses.reduce((sum, item) => sum + toUsd(item.amount, item.currency), 0);
      const fixedCostPerBox = totalBoxes ? fixedImportCost / totalBoxes : 0;
      const sharedCurrencies = Object.fromEntries(["freightCost", "mexicoCustomsCost", "usCustomsCost", "overweightCost", "redLightCost", "redLightUsCost", "coldStorageCost"].map((key) => [key, currency(key)]));
      const updatedLots = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const itemId = itemIds[index];
        const purchasePrice = itemPurchaseUsd(item);
        const itemTotalImportCost = purchasePrice * item.totalBoxes + fixedCostPerBox * item.totalBoxes;
        const valuesForLot = {
          organizationCode: "USA",
          loadDate: clean(payload.loadDate) || null,
          receivedDate: clean(payload.receivedDate),
          supplier: clean(payload.supplier) || null,
          warehouse: clean(payload.warehouse),
          pickupNumber: clean(payload.pickupNumber) || null,
          product: item.product,
          presentation: item.presentation || null,
          size: item.size || null,
          label: item.label || null,
          totalBoxes: item.totalBoxes,
          boxesPerPallet: item.boxesPerPallet,
          palletsPerLoad: null,
          unitCost: purchasePrice + fixedCostPerBox,
          purchasePrice,
          freightCost,
          mexicoCustomsCost,
          usCustomsCost,
          overweightCost,
          redLightCost,
          redLightUsCost,
          coldStorage: clean(payload.coldStorage) || clean(payload.warehouse) || null,
          coldStorageCost,
          additionalExpenses: JSON.stringify(additionalExpenses),
          attachments: JSON.stringify(Array.isArray(payload.attachments) ? payload.attachments : []),
          costAttachments: JSON.stringify(payload.costAttachments && typeof payload.costAttachments === "object" ? payload.costAttachments : {}),
          costCurrencies: JSON.stringify({ ...sharedCurrencies, purchasePrice: item.purchaseCurrency }),
          exchangeRate,
          totalImportCost: itemTotalImportCost,
        };
        if (itemId) {
          const [currentLot] = await db.select().from(inventoryLots).where(and(eq(inventoryLots.id, itemId), eq(inventoryLots.organizationCode, "USA"))).limit(1);
          if (!currentLot) return Response.json({ error: "No se encontro una partida de la carga." }, { status: 404 });
          const soldBoxes = currentLot.totalBoxes - currentLot.availableBoxes;
          if (item.totalBoxes < soldBoxes) return Response.json({ error: `El producto ${item.product} no puede quedar con menos cajas que las ya vendidas.` }, { status: 409 });
          const [lot] = await db.update(inventoryLots).set({ ...valuesForLot, availableBoxes: item.totalBoxes - soldBoxes }).where(and(eq(inventoryLots.id, itemId), eq(inventoryLots.organizationCode, "USA"))).returning();
          updatedLots.push(lot);
        } else {
          const [lot] = await db.insert(inventoryLots).values({ ...valuesForLot, availableBoxes: item.totalBoxes, receivedConfirmedAt: existing.receivedConfirmedAt }).returning();
          updatedLots.push(lot);
        }
      }
      const keptIds = new Set(updatedLots.map((lot) => lot.id));
      const removedIds = itemIds.filter((itemId) => !keptIds.has(itemId));
      for (const removedId of removedIds) {
        const [currentLot] = await db.select().from(inventoryLots).where(and(eq(inventoryLots.id, removedId), eq(inventoryLots.organizationCode, "USA"))).limit(1);
        if (!currentLot) continue;
        const soldBoxes = currentLot.totalBoxes - currentLot.availableBoxes;
        if (soldBoxes > 0) return Response.json({ error: `No se puede eliminar ${currentLot.product} porque ya tiene cajas vendidas.` }, { status: 409 });
        await db.delete(inventoryLots).where(and(eq(inventoryLots.id, removedId), eq(inventoryLots.organizationCode, "USA")));
      }
      return Response.json({ lot: updatedLots[0], lots: updatedLots, totalImportCost: purchaseTotal + fixedImportCost });
    }

    const totalBoxes = Number(payload.totalBoxes);
    const boxesPerPallet = payload.boxesPerPallet === "" || payload.boxesPerPallet == null ? null : Number(payload.boxesPerPallet);
    const palletsPerLoad = payload.palletsPerLoad === "" || payload.palletsPerLoad == null ? null : Number(payload.palletsPerLoad);
    const exchangeRate = payload.exchangeRate === "" || payload.exchangeRate == null ? null : Number(payload.exchangeRate);
    const rawCurrencies = payload.costCurrencies && typeof payload.costCurrencies === "object" ? payload.costCurrencies as Record<string, unknown> : {};
    const currency = (key: string) => rawCurrencies[key] === "MXN" ? "MXN" : "USD";
    const toUsd = (value: number, selectedCurrency: string) => selectedCurrency === "MXN" ? value / (exchangeRate || 0) : value;
    const amount = (key: string) => payload[key] === "" || payload[key] == null ? 0 : Number(payload[key]);
    const purchasePrice = amount("purchasePrice");
    const freightCost = amount("freightCost");
    const mexicoCustomsCost = amount("mexicoCustomsCost");
    const usCustomsCost = amount("usCustomsCost");
    const overweightCost = amount("overweightCost");
    const redLightCost = amount("redLightCost");
    const redLightUsCost = amount("redLightUsCost");
    const coldStorageCost = amount("coldStorageCost");
    const additionalExpenses = Array.isArray(payload.additionalExpenses)
      ? payload.additionalExpenses.map((item) => {
          const expense = item as Record<string, unknown>;
          return { concept: clean(expense.concept), amount: Number(expense.amount) || 0, currency: expense.currency === "MXN" ? "MXN" : "USD" };
        }).filter((item) => item.concept || item.amount)
      : [];
    if (!clean(payload.receivedDate) || !clean(payload.warehouse) || !clean(payload.product) || !Number.isInteger(totalBoxes) || totalBoxes <= 0) {
      return Response.json({ error: "Completa fecha de entrada, bodega, producto y cajas recibidas." }, { status: 400 });
    }
    const values = [purchasePrice, freightCost, mexicoCustomsCost, usCustomsCost, overweightCost, redLightCost, redLightUsCost, coldStorageCost, ...additionalExpenses.map((item) => item.amount)];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return Response.json({ error: "Ingresa importes válidos en los costos de importación." }, { status: 400 });
    if (!exchangeRate || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      return Response.json({ error: "Ingresa el tipo de cambio válido de esta importación para calcular los totales en USD y MXN." }, { status: 400 });
    }
    if ((boxesPerPallet != null && (!Number.isInteger(boxesPerPallet) || boxesPerPallet <= 0)) || (palletsPerLoad != null && (!Number.isInteger(palletsPerLoad) || palletsPerLoad <= 0))) {
      return Response.json({ error: "Cajas por pallet y pallets por carga deben ser números enteros mayores que cero." }, { status: 400 });
    }
    if (totalBoxes < existing.totalBoxes - existing.availableBoxes) {
      return Response.json({ error: "El total no puede ser menor a las cajas ya vendidas de esta partida." }, { status: 409 });
    }
    const totalImportCost = toUsd(purchasePrice, currency("purchasePrice")) * totalBoxes
      + toUsd(freightCost, currency("freightCost"))
      + toUsd(mexicoCustomsCost, currency("mexicoCustomsCost"))
      + toUsd(usCustomsCost, currency("usCustomsCost"))
      + toUsd(overweightCost, currency("overweightCost"))
      + toUsd(redLightCost, currency("redLightCost"))
      + toUsd(redLightUsCost, currency("redLightUsCost"))
      + toUsd(coldStorageCost, currency("coldStorageCost"))
      + additionalExpenses.reduce((sum, item) => sum + toUsd(item.amount, item.currency), 0);
    const unitCost = totalImportCost / totalBoxes;
    const soldBoxes = existing.totalBoxes - existing.availableBoxes;
    const [lot] = await db.update(inventoryLots).set({
      loadDate: clean(payload.loadDate) || null,
      receivedDate: clean(payload.receivedDate),
      supplier: clean(payload.supplier) || null,
      warehouse: clean(payload.warehouse),
      pickupNumber: clean(payload.pickupNumber) || null,
      product: clean(payload.product),
      presentation: clean(payload.presentation) || null,
      size: clean(payload.size) || null,
      label: clean(payload.label) || null,
      totalBoxes,
      boxesPerPallet,
      palletsPerLoad,
      availableBoxes: totalBoxes - soldBoxes,
      unitCost,
      purchasePrice,
      freightCost,
      mexicoCustomsCost,
      usCustomsCost,
      overweightCost,
      redLightCost,
      redLightUsCost,
      coldStorage: clean(payload.coldStorage) || clean(payload.warehouse) || null,
      coldStorageCost,
      additionalExpenses: JSON.stringify(additionalExpenses),
      attachments: JSON.stringify(Array.isArray(payload.attachments) ? payload.attachments : []),
      costAttachments: JSON.stringify(payload.costAttachments && typeof payload.costAttachments === "object" ? payload.costAttachments : {}),
      costCurrencies: JSON.stringify(Object.fromEntries(["purchasePrice", "freightCost", "mexicoCustomsCost", "usCustomsCost", "overweightCost", "redLightCost", "redLightUsCost", "coldStorageCost"].map((key) => [key, currency(key)]))),
      exchangeRate,
      totalImportCost,
    }).where(and(eq(inventoryLots.id, id), eq(inventoryLots.organizationCode, "USA"))).returning();
    return Response.json({ lot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible actualizar la entrada.";
    return Response.json({ error: message }, { status: 500 });
  }
}
