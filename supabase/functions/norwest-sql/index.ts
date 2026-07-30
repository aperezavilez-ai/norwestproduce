import { Pool } from "jsr:@db/postgres@0.19.4";

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const pool = databaseUrl ? new Pool(databaseUrl, 5, true) : null;

const blockedSql = /\b(create|alter|drop|truncate|grant|revoke|comment|copy|do|call|vacuum|analyze|reset|listen|notify)\b/i;
const blockedSchemas = /\b(pg_catalog|information_schema|auth|storage|vault|realtime|extensions|public)\s*\./i;
const allowedStart = /^(select|insert|update|delete|with)\b/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, (_key, value) => typeof value === "bigint" ? Number(value) : value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Metodo no permitido." }, 405);
  const authorization = request.headers.get("authorization");
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) return json({ error: "No autorizado." }, 401);
  if (!pool) return json({ error: "Base de datos no configurada." }, 503);

  try {
    const body = await request.json() as { sql?: unknown; params?: unknown };
    const sql = typeof body.sql === "string" ? body.sql.trim() : "";
    const params = Array.isArray(body.params) ? body.params : [];
    if (!sql || sql.length > 100_000 || params.length > 500) return json({ error: "Consulta invalida." }, 400);
    if (!allowedStart.test(sql) || blockedSql.test(sql) || blockedSchemas.test(sql) || sql.includes(";")) {
      return json({ error: "Consulta no permitida." }, 403);
    }

    const connection = await pool.connect();
    try {
      await connection.queryArray("BEGIN");
      await connection.queryArray("SET LOCAL search_path = norwestproduce, pg_temp");
      const result = await connection.queryArray(sql, params);
      await connection.queryArray("COMMIT");
      return json({ rows: result.rows });
    } catch (error) {
      await connection.queryArray("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("norwest_sql_proxy_error", error);
    return json({ error: error instanceof Error ? error.message : "No fue posible ejecutar la consulta." }, 500);
  }
});
