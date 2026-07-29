import { and, eq } from "drizzle-orm";
import { getBucket, getDb } from "../../../../db";
import { sales } from "../../../../db/schema";
import { requireAnyPermission, requirePermission } from "../../../../lib/api-auth";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\]/g, "_");
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "sales_edit");
  if (denied) return denied;
  let uploadedKey: string | null = null;
  try {
    const formData = await request.formData();
    const saleId = Number(formData.get("saleId"));
    const inspection = formData.get("inspection");
    if (!Number.isInteger(saleId) || saleId <= 0) return Response.json({ error: "Venta inválida." }, { status: 400 });

    const db = await getDb();
    const [existing] = await db.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).limit(1);
    if (!existing) return Response.json({ error: "No se encontró la venta." }, { status: 404 });

    if (!(inspection instanceof File) || inspection.size === 0) {
      const [sale] = await db.update(sales).set({
        loadStatus: "USDA REQUESTED",
        statusUpdatedAt: new Date().toISOString(),
        pasReviewDays: null,
        pasReviewDueDate: null,
        usdaInspectionStatus: "PENDING",
      }).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).returning();
      return Response.json({ sale });
    }

    if (inspection.size > MAX_FILE_BYTES) return Response.json({ error: "La inspección no puede exceder 10 MB." }, { status: 400 });
    if (!ALLOWED_TYPES.has(inspection.type)) return Response.json({ error: "La inspección debe ser PDF, JPG, PNG o WEBP." }, { status: 400 });

    const extension = inspection.type === "application/pdf" ? "pdf" : inspection.type.split("/")[1] || "bin";
    uploadedKey = `usa/usda-inspections/${saleId}/${crypto.randomUUID()}.${extension}`;
    await getBucket().put(uploadedKey, inspection.stream(), {
      httpMetadata: { contentType: inspection.type },
      customMetadata: { saleId: String(saleId), originalName: inspection.name },
    });

    const previousKey = existing.usdaInspectionObjectKey;
    const [sale] = await db.update(sales).set({
      loadStatus: "USDA REQUESTED",
      statusUpdatedAt: new Date().toISOString(),
      pasReviewDays: null,
      pasReviewDueDate: null,
      usdaInspectionStatus: "ATTACHED",
      usdaInspectionObjectKey: uploadedKey,
      usdaInspectionFileName: inspection.name,
      usdaInspectionContentType: inspection.type,
      usdaInspectionUploadedAt: new Date().toISOString(),
    }).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).returning();
    if (previousKey && previousKey !== uploadedKey) await getBucket().delete(previousKey).catch(() => undefined);
    return Response.json({ sale }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await getBucket().delete(uploadedKey).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la inspección USDA." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const denied = requireAnyPermission(request, ["sales_view", "sales_edit"]);
  if (denied) return denied;
  try {
    const saleId = Number(new URL(request.url).searchParams.get("saleId"));
    if (!Number.isInteger(saleId) || saleId <= 0) return Response.json({ error: "Venta inválida." }, { status: 400 });
    const db = await getDb();
    const [sale] = await db.select({
      key: sales.usdaInspectionObjectKey,
      name: sales.usdaInspectionFileName,
      type: sales.usdaInspectionContentType,
    }).from(sales).where(and(eq(sales.id, saleId), eq(sales.organizationCode, "USA"))).limit(1);
    if (!sale?.key) return Response.json({ error: "La inspección USDA todavía no está adjunta." }, { status: 404 });
    const object = await getBucket().get(sale.key);
    if (!object) return Response.json({ error: "No se encontró el archivo de inspección." }, { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": sale.type || object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeDownloadName(sale.name || "USDA Inspection")}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo abrir la inspección USDA." }, { status: 500 });
  }
}
