import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("sales allow below-cost continuation and preserve pickup during edit", async () => {
  const dashboard = await source("app/usa/usa-dashboard.tsx");
  const salesRoute = await source("app/api/usa/sales/route.ts");
  assert.match(dashboard, /El precio de \$\{belowCost\.product\} está por debajo del costo/);
  assert.match(dashboard, /!editingSale && form\.pickupDate && form\.pickupDate < localDateKey\(\)/);
  assert.match(salesRoute, /hasOwnProperty\.call\(payload, "pickupDate"\).*existing\.pickupDate/);
  assert.match(salesRoute, /items\.length >= 1 && items\.length <= 25/);
});

test("prices and accounting payments are wired through the UI and API", async () => {
  const dashboard = await source("app/usa/usa-dashboard.tsx");
  const paymentsRoute = await source("app/api/usa/customer-payments/route.ts");
  const schema = await source("db/schema.ts");
  const migration = await source("supabase/migrations/002_customer_payments.sql");
  assert.match(dashboard, /step="0\.00001"/);
  assert.match(dashboard, /section === "accounting"/);
  assert.match(dashboard, /\/api\/usa\/customer-payments/);
  assert.match(paymentsRoute, /requirePermission\(request, "collections"\)/);
  assert.match(paymentsRoute, /paymentStatus: nextStatus/);
  assert.match(schema, /export const customerPayments = pgTable/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_payments/);
});
