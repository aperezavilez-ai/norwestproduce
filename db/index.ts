import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { del as deleteBlob, get as getBlob, put as putBlob } from "@vercel/blob";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type CloudflareBucket = {
  put(key: string, value: BodyInit, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
};

type RuntimeBindings = { BUCKET?: CloudflareBucket };

declare global {
  var __NORWEST_RUNTIME_BINDINGS__: RuntimeBindings | undefined;
}

type DbClient = NeonHttpDatabase<typeof schema>;

let queryClient: NeonQueryFunction<false, false> | undefined;
let database: DbClient | undefined;
let initialization: Promise<void> | undefined;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
}

async function initializeDatabase(sql: NeonQueryFunction<false, false>) {
  // All tables created with their final column set — no ALTER TABLE migrations needed.
  // To add a new column in the future: add it here and deploy; Neon handles idempotency via IF NOT EXISTS.
  await sql`
    CREATE TABLE IF NOT EXISTS inventory_lots (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      received_date TEXT NOT NULL,
      load_date TEXT,
      supplier TEXT,
      warehouse TEXT NOT NULL,
      pickup_number TEXT,
      product TEXT NOT NULL,
      presentation TEXT,
      size TEXT,
      label TEXT,
      total_boxes INTEGER NOT NULL,
      boxes_per_pallet INTEGER,
      pallets_per_load INTEGER,
      available_boxes INTEGER NOT NULL,
      unit_cost DOUBLE PRECISION,
      purchase_price DOUBLE PRECISION,
      freight_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      mexico_customs_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      us_customs_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      overweight_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      red_light_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      red_light_us_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      cold_storage TEXT,
      cold_storage_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      additional_expenses TEXT NOT NULL DEFAULT '[]',
      attachments TEXT NOT NULL DEFAULT '[]',
      cost_attachments TEXT NOT NULL DEFAULT '{}',
      cost_currencies TEXT NOT NULL DEFAULT '{}',
      exchange_rate DOUBLE PRECISION,
      total_import_cost DOUBLE PRECISION,
      received_confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cold_storages (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      state_code TEXT NOT NULL DEFAULT '',
      state_name TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      street TEXT NOT NULL DEFAULT '',
      exterior_number TEXT NOT NULL DEFAULT '',
      interior_number TEXT,
      postal_code TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      name TEXT NOT NULL,
      alias TEXT NOT NULL DEFAULT '',
      presentation TEXT,
      size TEXT,
      label TEXT,
      boxes_per_pallet INTEGER,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      operation_type TEXT NOT NULL DEFAULT 'DIRECT_RESALE',
      supplier TEXT,
      inventory_lot_id INTEGER REFERENCES inventory_lots(id),
      sale_date TEXT NOT NULL,
      customer TEXT NOT NULL,
      seller_name TEXT,
      purchase_order TEXT,
      warehouse TEXT NOT NULL,
      pickup_number TEXT NOT NULL,
      boxes INTEGER NOT NULL,
      product TEXT NOT NULL,
      presentation TEXT,
      size TEXT,
      label TEXT,
      purchase_price DOUBLE PRECISION,
      sale_price DOUBLE PRECISION,
      profit DOUBLE PRECISION,
      ship_date TEXT,
      ship_to TEXT,
      pickup_date TEXT,
      total DOUBLE PRECISION,
      due_date TEXT,
      load_status TEXT NOT NULL DEFAULT 'OK',
      status_updated_at TEXT,
      pas_review_days INTEGER,
      pas_review_due_date TEXT,
      usda_inspection_status TEXT,
      usda_inspection_object_key TEXT,
      usda_inspection_file_name TEXT,
      usda_inspection_content_type TEXT,
      usda_inspection_uploaded_at TEXT,
      payment_status TEXT NOT NULL DEFAULT 'PENDIENTE',
      invoice_number TEXT,
      invoice_items TEXT,
      original_invoice_items TEXT,
      invoice_adjustments TEXT NOT NULL DEFAULT '[]',
      bol_object_key TEXT,
      bol_file_name TEXT,
      bol_content_type TEXT,
      bol_uploaded_at TEXT,
      canceled_at TEXT,
      canceled_by TEXT,
      cancellation_reason TEXT,
      cancellation_detail TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS business_partners (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      partner_type TEXT NOT NULL,
      name TEXT NOT NULL,
      paca_number TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL,
      blue_book_number TEXT NOT NULL,
      duns_number TEXT NOT NULL,
      street TEXT NOT NULL,
      exterior_number TEXT NOT NULL,
      interior_number TEXT,
      state_code TEXT NOT NULL,
      state_name TEXT NOT NULL,
      city TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_email TEXT NOT NULL DEFAULT '',
      buyer_office_phone TEXT NOT NULL DEFAULT '',
      buyer_office_extension TEXT NOT NULL DEFAULT '',
      buyer_mobile_phone TEXT NOT NULL DEFAULT '',
      assigned_seller TEXT,
      profit_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      legal_name TEXT NOT NULL DEFAULT 'NORWEST PRODUCE LLC',
      street TEXT NOT NULL DEFAULT '710 LAUREL AVENUE',
      city TEXT NOT NULL DEFAULT 'MCALLEN',
      state TEXT NOT NULL DEFAULT 'TX',
      postal_code TEXT NOT NULL DEFAULT '78501',
      blue_book_number TEXT NOT NULL DEFAULT '',
      paca_number TEXT NOT NULL DEFAULT '',
      duns_number TEXT NOT NULL DEFAULT '',
      tax_id TEXT NOT NULL DEFAULT '',
      norwest_profit_percentage DOUBLE PRECISION NOT NULL DEFAULT 16,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_accounts (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      full_name TEXT NOT NULL,
      alias TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      profit_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS seller_liquidations (
      id SERIAL PRIMARY KEY,
      organization_code TEXT NOT NULL DEFAULT 'USA',
      seller_name TEXT NOT NULL,
      liquidation_date TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS document_counters (
      organization_code TEXT NOT NULL,
      document_type TEXT NOT NULL,
      last_value INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
      PRIMARY KEY (organization_code, document_type)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      rate_key TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      reset_at BIGINT NOT NULL
    )
  `;

  // CREATE TABLE IF NOT EXISTS does not add columns to an existing production table.
  // Keep these upgrades idempotent until cold-start DDL is replaced by a migration job.
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS load_date TEXT`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS attachments TEXT NOT NULL DEFAULT '[]'`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS cost_attachments TEXT NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS cost_currencies TEXT NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS exchange_rate DOUBLE PRECISION`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS total_import_cost DOUBLE PRECISION`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS received_confirmed_at TEXT`;
  await sql`ALTER TABLE inventory_lots ADD COLUMN IF NOT EXISTS red_light_us_cost DOUBLE PRECISION NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS state_code TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS state_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS exterior_number TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS interior_number TEXT`;
  await sql`ALTER TABLE cold_storages ADD COLUMN IF NOT EXISTS postal_code TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS boxes_per_pallet INTEGER`;
  await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS ship_to TEXT`;
  await sql`ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS buyer_name TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS buyer_email TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS buyer_office_phone TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS buyer_office_extension TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE business_partners ADD COLUMN IF NOT EXISTS buyer_mobile_phone TEXT NOT NULL DEFAULT ''`;

  // Create all indexes in a single round-trip using a DO block
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'inventory_org_product_idx') THEN
        CREATE INDEX inventory_org_product_idx ON inventory_lots (organization_code, product); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'inventory_org_available_idx') THEN
        CREATE INDEX inventory_org_available_idx ON inventory_lots (organization_code, available_boxes); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'cold_storage_org_name_idx') THEN
        CREATE INDEX cold_storage_org_name_idx ON cold_storages (organization_code, name); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'products_org_name_idx') THEN
        CREATE INDEX products_org_name_idx ON products (organization_code, name); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'sales_org_date_idx') THEN
        CREATE INDEX sales_org_date_idx ON sales (organization_code, sale_date); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'sales_org_pickup_idx') THEN
        CREATE INDEX sales_org_pickup_idx ON sales (organization_code, pickup_number); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'partners_org_type_name_idx') THEN
        CREATE INDEX partners_org_type_name_idx ON business_partners (organization_code, partner_type, name); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'partners_org_tax_id_idx') THEN
        CREATE INDEX partners_org_tax_id_idx ON business_partners (organization_code, tax_id); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_org_alias_idx') THEN
        CREATE INDEX users_org_alias_idx ON user_accounts (organization_code, alias); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_org_email_idx') THEN
        CREATE INDEX users_org_email_idx ON user_accounts (organization_code, email); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'seller_liquidations_org_seller_idx') THEN
        CREATE INDEX seller_liquidations_org_seller_idx ON seller_liquidations (organization_code, seller_name); END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'seller_liquidations_org_date_idx') THEN
        CREATE INDEX seller_liquidations_org_date_idx ON seller_liquidations (organization_code, liquidation_date); END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'sales_org_invoice_unique_idx'
      ) AND NOT EXISTS (
        SELECT 1 FROM sales
        WHERE invoice_number IS NOT NULL
        GROUP BY organization_code, invoice_number
        HAVING COUNT(*) > 1
      ) THEN
        CREATE UNIQUE INDEX sales_org_invoice_unique_idx
          ON sales (organization_code, invoice_number)
          WHERE invoice_number IS NOT NULL;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'users_org_email_unique_idx'
      ) AND NOT EXISTS (
        SELECT 1 FROM user_accounts
        GROUP BY organization_code, lower(email)
        HAVING COUNT(*) > 1
      ) THEN
        CREATE UNIQUE INDEX users_org_email_unique_idx
          ON user_accounts (organization_code, lower(email));
      END IF;
    END $$
  `;
}

export async function getDb() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("Vercel Postgres/Neon no está conectado. Agrega DATABASE_URL al proyecto para guardar información real.");
  }

  if (!queryClient || !database) {
    queryClient = neon(connectionString);
    database = drizzle(queryClient, { schema });
  }

  initialization ??= initializeDatabase(queryClient);
  await initialization;
  return database;
}

export async function nextInvoiceNumber(organizationCode: string) {
  await getDb();
  if (!queryClient) throw new Error("La base de datos no esta disponible.");

  const rows = await queryClient`
    INSERT INTO document_counters (organization_code, document_type, last_value, updated_at)
    VALUES (
      ${organizationCode},
      'INVOICE',
      GREATEST((
        SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1
        FROM sales
        WHERE organization_code = ${organizationCode}
          AND invoice_number ~ '^[0-9]+$'
      ), 1),
      CURRENT_TIMESTAMP::text
    )
    ON CONFLICT (organization_code, document_type)
    DO UPDATE SET
      last_value = GREATEST(
        document_counters.last_value + 1,
        (
          SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1
          FROM sales
          WHERE organization_code = ${organizationCode}
            AND invoice_number ~ '^[0-9]+$'
        )
      ),
      updated_at = CURRENT_TIMESTAMP::text
    RETURNING last_value
  `;

  const value = Number(rows[0]?.last_value);
  if (!Number.isInteger(value) || value <= 0) throw new Error("No fue posible reservar el folio de factura.");
  return String(value).padStart(4, "0");
}

export async function recordLoginAttempt(rateKey: string, windowMs: number, maxAttempts: number) {
  await getDb();
  if (!queryClient) throw new Error("La base de datos no esta disponible.");
  const now = Date.now();
  const resetAt = now + windowMs;
  const rows = await queryClient`
    INSERT INTO auth_rate_limits (rate_key, attempt_count, reset_at)
    VALUES (${rateKey}, 1, ${resetAt})
    ON CONFLICT (rate_key) DO UPDATE SET
      attempt_count = CASE
        WHEN auth_rate_limits.reset_at <= ${now} THEN 1
        ELSE auth_rate_limits.attempt_count + 1
      END,
      reset_at = CASE
        WHEN auth_rate_limits.reset_at <= ${now} THEN ${resetAt}
        ELSE auth_rate_limits.reset_at
      END
    RETURNING attempt_count, reset_at
  `;
  const count = Number(rows[0]?.attempt_count);
  return { allowed: Number.isInteger(count) && count <= maxAttempts, resetAt: Number(rows[0]?.reset_at) || resetAt };
}

export async function clearLoginAttempts(rateKey: string) {
  await getDb();
  if (!queryClient) return;
  await queryClient`DELETE FROM auth_rate_limits WHERE rate_key = ${rateKey}`;
}

export async function applyInventoryAdjustments(
  adjustments: Array<{ inventoryLotId: number; quantityDelta: number }>,
) {
  if (!adjustments.length) return;
  await getDb();
  if (!queryClient) throw new Error("La base de datos no esta disponible.");

  await queryClient.transaction((transaction) => adjustments.map(({ inventoryLotId, quantityDelta }) => {
    const requiredBoxes = Math.max(0, -quantityDelta);
    return transaction`
      WITH adjusted AS (
        UPDATE inventory_lots
        SET available_boxes = available_boxes + ${quantityDelta}
        WHERE id = ${inventoryLotId}
          AND organization_code = 'USA'
          AND available_boxes >= ${requiredBoxes}
        RETURNING id
      )
      SELECT id FROM adjusted
      UNION ALL
      SELECT 1 / COUNT(*)::integer FROM adjusted HAVING COUNT(*) = 0
    `;
  }));
}

export function getBucket() {
  const cloudflareBucket = globalThis.__NORWEST_RUNTIME_BINDINGS__?.BUCKET;
  if (cloudflareBucket) return cloudflareBucket;

  const hasBlobCredentials = process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  if (!hasBlobCredentials) {
    throw new Error("Vercel Blob no está conectado. Agrega BLOB_READ_WRITE_TOKEN o BLOB_STORE_ID para guardar archivos adjuntos.");
  }

  return {
    async put(key: string, value: BodyInit, options?: { httpMetadata?: { contentType?: string } }) {
      await putBlob(key, value as Parameters<typeof putBlob>[1], {
        access: "private",
        allowOverwrite: true,
        contentType: options?.httpMetadata?.contentType,
      });
    },
    async get(key: string) {
      const blob = await getBlob(key, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200) return null;
      return {
        body: blob.stream,
        httpMetadata: { contentType: blob.blob.contentType },
      };
    },
    async delete(key: string) {
      await deleteBlob(key).catch(() => undefined);
    },
  };
}
