import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { businessPartners } from "../../../../db/schema";
import type { NewBusinessPartner } from "../../../../lib/types";
import { requireAnyPermission, requirePermission } from "../../../../lib/api-auth";
import { clean } from "../../../../lib/auth";

const requiredFields: Array<keyof NewBusinessPartner> = [
  "name", "stateCode", "stateName", "city", "postalCode", "contactName", "contactEmail", "contactPhone",
];

const MEXICAN_STATE_CODES = new Set([
  "AGS","BC","BCS","CAMP","CHIS","CHIH","CDMX","COAH","COL","DGO","GTO","GRO",
  "HGO","JAL","MEX","MICH","MOR","NAY","NL","OAX","PUE","QRO","QROO","SLP",
  "SIN","SON","TAB","TAMS","TLAX","VER","YUC","ZAC",
]);


export async function GET(request: Request) {
  const guard = requireAnyPermission(request, ["catalogs", "sales_view", "sales_edit", "invoicing"]);
  if (guard) return guard;
  try {
    const db = await getDb();
    const partners = await db.select().from(businessPartners)
      .where(eq(businessPartners.organizationCode, "USA"))
      .orderBy(asc(businessPartners.partnerType), asc(businessPartners.name));
    return Response.json({ partners });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible consultar los catálogos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = requirePermission(request, "catalogs");
  if (guard) return guard;
  try {
    const payload = (await request.json()) as Partial<NewBusinessPartner> & { alsoOppositeType?: boolean; isMexican?: boolean };
    const partnerType = payload.partnerType === "CUSTOMER" ? "CUSTOMER" : payload.partnerType === "SUPPLIER" ? "SUPPLIER" : null;
    if (!partnerType) return Response.json({ error: "Selecciona si el registro es proveedor o cliente." }, { status: 400 });
    const isMexican = Boolean(payload.isMexican) || MEXICAN_STATE_CODES.has(clean(payload.stateCode ?? "").toUpperCase());
    const missing = requiredFields.some((field) => !clean(payload[field]));
    if (missing) return Response.json({ error: "Completa todos los campos obligatorios para continuar." }, { status: 400 });
    const email = clean(payload.contactEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Response.json({ error: "Ingresa un correo válido." }, { status: 400 });
    const phone = clean(payload.contactPhone).replace(/\D/g, "");
    if (!isMexican && phone.length !== 10) return Response.json({ error: "El teléfono debe contener exactamente 10 dígitos." }, { status: 400 });
    if (isMexican && phone.length < 7) return Response.json({ error: "Ingresa un teléfono válido." }, { status: 400 });
    if ((partnerType === "CUSTOMER" || payload.alsoOppositeType) && !clean(payload.assignedSeller)) return Response.json({ error: "Selecciona el vendedor de Norwest para el cliente." }, { status: 400 });
    const profitPercentage = Number(payload.profitPercentage ?? 0);
    if (!Number.isFinite(profitPercentage) || profitPercentage < 0 || profitPercentage > 100) return Response.json({ error: "El porcentaje de utilidad debe estar entre 0 y 100." }, { status: 400 });

    const partnerValues = {
      organizationCode: "USA",
      partnerType,
      name: clean(payload.name),
      pacaNumber: clean(payload.pacaNumber),
      taxId: clean(payload.taxId),
      blueBookNumber: clean(payload.blueBookNumber),
      dunsNumber: clean(payload.dunsNumber),
      street: clean(payload.street),
      exteriorNumber: clean(payload.exteriorNumber),
      interiorNumber: clean(payload.interiorNumber) || null,
      stateCode: clean(payload.stateCode),
      stateName: clean(payload.stateName),
      city: clean(payload.city),
      postalCode: clean(payload.postalCode),
      contactName: clean(payload.contactName),
      contactEmail: email,
      contactPhone: phone,
      buyerName: clean(payload.buyerName),
      buyerEmail: clean(payload.buyerEmail),
      buyerOfficePhone: clean(payload.buyerOfficePhone).replace(/\D/g, ""),
      buyerOfficeExtension: clean(payload.buyerOfficeExtension),
      buyerMobilePhone: clean(payload.buyerMobilePhone).replace(/\D/g, ""),
      assignedSeller: clean(payload.assignedSeller) || null,
      profitPercentage,
    };
    const db = await getDb();
    if (payload.alsoOppositeType) {
      const oppositeType = partnerType === "SUPPLIER" ? "CUSTOMER" : "SUPPLIER";
      const [created] = await db.insert(businessPartners).values(partnerValues).returning();
      const [opposite] = await db.insert(businessPartners).values({ ...partnerValues, partnerType: oppositeType }).returning();
      return Response.json({ partner: created, partners: [created, opposite] }, { status: 201 });
    }
    const [created] = await db.insert(businessPartners).values(partnerValues).returning();
    return Response.json({ partner: created, partners: [created] }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar el registro." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = requirePermission(request, "catalogs");
  if (guard) return guard;
  try {
    const payload = (await request.json()) as Partial<NewBusinessPartner> & { id?: number; alsoOppositeType?: boolean; isMexican?: boolean };
    const id = Number(payload.id);
    const partnerType = payload.partnerType === "CUSTOMER" ? "CUSTOMER" : payload.partnerType === "SUPPLIER" ? "SUPPLIER" : null;
    if (!Number.isInteger(id) || id <= 0 || !partnerType) return Response.json({ error: "No fue posible identificar el registro." }, { status: 400 });
    const isMexican = Boolean(payload.isMexican) || MEXICAN_STATE_CODES.has(clean(payload.stateCode ?? "").toUpperCase());
    const missing = requiredFields.some((field) => !clean(payload[field]));
    if (missing) return Response.json({ error: "Completa todos los campos obligatorios para continuar." }, { status: 400 });
    const email = clean(payload.contactEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Response.json({ error: "Ingresa un correo válido." }, { status: 400 });
    const phone = clean(payload.contactPhone).replace(/\D/g, "");
    if (!isMexican && phone.length !== 10) return Response.json({ error: "El teléfono debe contener exactamente 10 dígitos." }, { status: 400 });
    if (isMexican && phone.length < 7) return Response.json({ error: "Ingresa un teléfono válido." }, { status: 400 });
    if ((partnerType === "CUSTOMER" || payload.alsoOppositeType) && !clean(payload.assignedSeller)) return Response.json({ error: "Selecciona el vendedor de Norwest para el cliente." }, { status: 400 });
    const profitPercentage = Number(payload.profitPercentage ?? 0);
    if (!Number.isFinite(profitPercentage) || profitPercentage < 0 || profitPercentage > 100) return Response.json({ error: "El porcentaje de utilidad debe estar entre 0 y 100." }, { status: 400 });
    const db = await getDb();
    const values = {
      partnerType,
      name: clean(payload.name),
      pacaNumber: clean(payload.pacaNumber),
      taxId: clean(payload.taxId),
      blueBookNumber: clean(payload.blueBookNumber),
      dunsNumber: clean(payload.dunsNumber),
      street: clean(payload.street),
      exteriorNumber: clean(payload.exteriorNumber),
      interiorNumber: clean(payload.interiorNumber) || null,
      stateCode: clean(payload.stateCode),
      stateName: clean(payload.stateName),
      city: clean(payload.city),
      postalCode: clean(payload.postalCode),
      contactName: clean(payload.contactName),
      contactEmail: email,
      contactPhone: phone,
      buyerName: clean(payload.buyerName),
      buyerEmail: clean(payload.buyerEmail),
      buyerOfficePhone: clean(payload.buyerOfficePhone).replace(/\D/g, ""),
      buyerOfficeExtension: clean(payload.buyerOfficeExtension),
      buyerMobilePhone: clean(payload.buyerMobilePhone).replace(/\D/g, ""),
      assignedSeller: clean(payload.assignedSeller) || null,
      profitPercentage,
    };
    const [updated] = await db.update(businessPartners).set({
      ...values,
    }).where(and(eq(businessPartners.id, id), eq(businessPartners.organizationCode, "USA"))).returning();
    if (!updated) return Response.json({ error: "Registro no encontrado." }, { status: 404 });
    let opposite = null;
    if (payload.alsoOppositeType) {
      const oppositeType = partnerType === "SUPPLIER" ? "CUSTOMER" : "SUPPLIER";
      const [existingOpposite] = await db.select().from(businessPartners)
        .where(and(eq(businessPartners.organizationCode, "USA"), eq(businessPartners.partnerType, oppositeType), eq(businessPartners.name, values.name)))
        .limit(1);
      if (existingOpposite) {
        [opposite] = await db.update(businessPartners).set({ ...values, partnerType: oppositeType })
          .where(eq(businessPartners.id, existingOpposite.id)).returning();
      } else {
        [opposite] = await db.insert(businessPartners).values({ organizationCode: "USA", ...values, partnerType: oppositeType }).returning();
      }
    }
    return Response.json({ partner: updated, partners: opposite ? [updated, opposite] : [updated] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible actualizar el registro." }, { status: 500 });
  }
}
