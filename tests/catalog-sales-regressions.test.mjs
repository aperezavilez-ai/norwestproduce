import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("catalogs allow custom cities and safe deletion", async () => {
  const [dashboard, partners, warehouses, products] = await Promise.all([
    source("app/usa/usa-dashboard.tsx"),
    source("app/api/usa/partners/route.ts"),
    source("app/api/usa/cold-storages/route.ts"),
    source("app/api/usa/products/route.ts"),
  ]);

  assert.match(dashboard, /list="partner-city-options"/);
  assert.match(dashboard, /list="warehouse-city-options"/);
  assert.match(dashboard, /deleteCatalogRecord\("\/api\/usa\/partners"/);
  assert.match(dashboard, /deleteCatalogRecord\("\/api\/usa\/cold-storages"/);
  assert.match(dashboard, /deleteCatalogRecord\("\/api\/usa\/products"/);
  for (const route of [partners, warehouses, products]) assert.match(route, /export async function DELETE/);
  assert.match(partners, /duplicatePartnerId/);
  assert.match(partners, /payload\.action === "deduplicate"/);
});

test("sales accept any pickup date, audit edits, and derive SHIP TO", async () => {
  const [dashboard, sales] = await Promise.all([
    source("app/usa/usa-dashboard.tsx"),
    source("app/api/usa/sales/route.ts"),
  ]);

  assert.doesNotMatch(dashboard, /min=\{localDateKey\(\)\} type="date" value=\{form\.pickupDate\}/);
  assert.doesNotMatch(sales, /pickupDate && pickupDate < currentDateInMcAllen/);
  assert.match(dashboard, /SHIP TO<input readOnly/);
  assert.match(sales, /shipToForWarehouse/);
  assert.match(sales, /kind: "SALE_EDIT"/);
  assert.match(dashboard, /Historial de modificaciones/);
});

test("imported inventory is available and damaged question-mark labels are gone", async () => {
  const [dashboard, inventory] = await Promise.all([
    source("app/usa/usa-dashboard.tsx"),
    source("app/api/usa/inventory/route.ts"),
  ]);

  assert.doesNotMatch(inventory, /isNotNull\(inventoryLots\.receivedConfirmedAt\)/);
  assert.ok(!dashboard.includes("Direcci??n"));
  assert.ok(!dashboard.includes("partner.contactEmail} ?? {formatPhone"));
  assert.ok(!dashboard.includes("` ?? ${formatPhone"));
  assert.match(dashboard, /partner\.contactEmail\} · \{formatPhone/);
});
