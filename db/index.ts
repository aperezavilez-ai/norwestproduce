import { del as deleteBlob, get as getBlob, put as putBlob } from "@vercel/blob";
import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
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

type DbClient = PgRemoteDatabase<typeof schema>;
type ProxyResponse = { rows?: unknown[][]; error?: string };

let database: DbClient | undefined;

function proxyConfiguration() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceRoleKey) {
    throw new Error("Supabase no configurado. Agrega SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url: `${baseUrl}/functions/v1/norwest-sql`, serviceRoleKey };
}

async function remoteQuery(sql: string, params: unknown[] = []) {
  const { url, serviceRoleKey } = proxyConfiguration();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({})) as ProxyResponse;
  if (!response.ok) throw new Error(result.error || `Supabase respondio ${response.status}.`);
  return result.rows ?? [];
}

export async function getDb() {
  database ??= drizzle(async (sql, params) => ({ rows: await remoteQuery(sql, params) }), { schema });
  return database;
}

export async function nextInvoiceNumber(organizationCode: string) {
  const rows = await remoteQuery(`
    INSERT INTO document_counters (organization_code, document_type, last_value, updated_at)
    VALUES (
      $1,
      'INVOICE',
      GREATEST((
        SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1
        FROM sales
        WHERE organization_code = $1 AND invoice_number ~ '^[0-9]+$'
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
          WHERE organization_code = $1 AND invoice_number ~ '^[0-9]+$'
        )
      ),
      updated_at = CURRENT_TIMESTAMP::text
    RETURNING last_value
  `, [organizationCode]);

  const value = Number(rows[0]?.[0]);
  if (!Number.isInteger(value) || value <= 0) throw new Error("No fue posible reservar el folio de factura.");
  return String(value).padStart(4, "0");
}

export async function recordLoginAttempt(rateKey: string, windowMs: number, maxAttempts: number) {
  const now = Date.now();
  const resetAt = now + windowMs;
  const rows = await remoteQuery(`
    INSERT INTO auth_rate_limits (rate_key, attempt_count, reset_at)
    VALUES ($1, 1, $2)
    ON CONFLICT (rate_key) DO UPDATE SET
      attempt_count = CASE WHEN auth_rate_limits.reset_at <= $3 THEN 1 ELSE auth_rate_limits.attempt_count + 1 END,
      reset_at = CASE WHEN auth_rate_limits.reset_at <= $3 THEN $2 ELSE auth_rate_limits.reset_at END
    RETURNING attempt_count, reset_at
  `, [rateKey, resetAt, now]);
  const count = Number(rows[0]?.[0]);
  return { allowed: Number.isInteger(count) && count <= maxAttempts, resetAt: Number(rows[0]?.[1]) || resetAt };
}

export async function clearLoginAttempts(rateKey: string) {
  await remoteQuery("DELETE FROM auth_rate_limits WHERE rate_key = $1", [rateKey]);
}

export async function applyInventoryAdjustments(
  adjustments: Array<{ inventoryLotId: number; quantityDelta: number }>,
) {
  if (!adjustments.length) return;
  await remoteQuery("SELECT apply_inventory_adjustments($1::jsonb)", [JSON.stringify(
    adjustments.map(({ inventoryLotId, quantityDelta }) => ({
      inventory_lot_id: inventoryLotId,
      quantity_delta: quantityDelta,
    })),
  )]);
}

export function getBucket() {
  const cloudflareBucket = globalThis.__NORWEST_RUNTIME_BINDINGS__?.BUCKET;
  if (cloudflareBucket) return cloudflareBucket;

  const hasBlobCredentials = process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
  if (!hasBlobCredentials) {
    throw new Error("Vercel Blob no esta conectado. Agrega BLOB_READ_WRITE_TOKEN o BLOB_STORE_ID para guardar archivos adjuntos.");
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
      return { body: blob.stream, httpMetadata: { contentType: blob.blob.contentType } };
    },
    async delete(key: string) {
      await deleteBlob(key).catch(() => undefined);
    },
  };
}
