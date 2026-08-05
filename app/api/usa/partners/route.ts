import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { businessPartners, inventoryLots, sales } from "../../../../db/schema";
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

function normalizedName(value: unknown) {
  return clean(value).normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
}

async function duplicatePartnerId(db: Awaited<ReturnType<typeof getDb>>, partnerType: string, name: string, excludedId?: number) {
  const conditions = [
    eq(businessPartners.organizationCode, "USA"),
    eq(businessPartners.partnerType, partnerType),
    sql`lower(regexp_replace(trim(${businessPartners.name}), '\\s+', ' ', 'g')) = ${normalizedName(name)}`,
  ];
  if (excludedId) conditions.push(ne(businessPartners.id, excludedId));
  const [duplicate] = await db.select({ id: businessPartners.id }).from(businessPartners).where(and(...conditions)).limit(1);
  return duplicate?.id;
}

function partnerCompleteness(partner: typeof businessPartners.$inferSelect) {
  return Object.values(partner).filter((value) => typeof value === "string" && value.trim()).length;
}

async function deduplicatePartners(db: Awaited<ReturnType<typeof getDb>>) {
  const rows = await db.select().from(businessPartners).where(eq(businessPartners.organizationCode, "USA"));
  const groups = new Map<string, typeof rows>();
  for (const partner of rows) {
    const key = `${partner.partnerType}:${normalizedName(partner.name)}`;
    groups.set(key, [...(groups.get(key) || []), partner]);
  }
  const merged: Array<{ name: string; removedIds: number[] }> = [];
  for (const duplicates of groups.values()) {
    if (duplicates.length < 2) continue;
    const ranked = [...duplicates].sort((left, right) => partnerCompleteness(right) - partnerCompleteness(left) || left.id - right.id);
    const canonical = ranked[0];
    const extras = ranked.slice(1);
    const value = (field: keyof typeof canonical) => ranked.find((item) => typeof item[field] === "string" && String(item[field]).trim())?.[field];
    await db.update(businessPartners).set({
      name: canonical.name,
      pacaNumber: String(value("pacaNumber") || ""),
      taxId: String(value("taxId") || ""),
      blueBookNumber: String(value("blueBookNumber") || ""),
      dunsNumber: String(value("dunsNumber") || ""),
      street: String(value("street") || ""),
      exteriorNumber: String(value("exteriorNumber") || ""),
      interiorNumber: String(value("interiorNumber") || "") || null,
      stateCode: String(value("stateCode") || ""),
      stateName: String(value("stateName") || ""),
      city: String(value("city") || ""),
      postalCode: String(value("postalCode") || ""),
      contactName: String(value("contactName") || ""),
      contactEmail: String(value("contactEmail") || ""),
      contactPhone: String(value("contactPhone") || ""),
      buyerName: String(value("buyerName") || ""),
      buyerEmail: String(value("buyerEmail") || ""),
      buyerOfficePhone: String(value("buyerOfficePhone") || ""),
      buyerOfficeExtension: String(value("buyerOfficeExtension") || ""),
      buyerMobilePhone: String(value("buyerMobilePhone") || ""),
      assignedSeller: String(value("assignedSeller") || "") || null,
      profitPercentage: Math.max(...ranked.map((item) => Number(item.profitPercentage || 0))),
    }).where(eq(businessPartners.id, canonical.id));
    for (const extra of extras) {
      if (canonical.partnerType === "CUSTOMER") {
        await db.update(sales).set({ customer: canonical.name }).where(and(eq(sales.organizationCode, "USA"), eq(sales.customer, extra.name)));
      } else {
        await db.update(sales).set({ supplier: canonical.name }).where(and(eq(sales.organizationCode, "USA"), eq(sales.supplier, extra.name)));
        await db.update(inventoryLots).set({ supplier: canonical.name }).where(and(eq(inventoryLots.organizationCode, "USA"), eq(inventoryLots.supplier, extra.name)));
      }
      await db.delete(businessPartners).where(eq(businessPartners.id, extra.id));
    }
    merged.push({ name: canonical.name, removedIds: extras.map((item) => item.id) });
  }
  return merged;
}


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
    const payload = (await request.json()) as Partial<NewBusinessPartner> & { alsoOppositeType?: boolean; isMexican?: boolean; action?: string };
    if (payload.action === "deduplicate") {
      const db = await getDb();
      return Response.json({ merged: await deduplicatePartners(db) });
    }
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
    if (await duplicatePartnerId(db, partnerType, partnerValues.name)) {
      return Response.json({ error: `Ya existe ${partnerType === "CUSTOMER" ? "un cliente" : "un proveedor"} con ese nombre.` }, { status: 409 });
    }
    if (payload.alsoOppositeType) {
      const oppositeType = partnerType === "SUPPLIER" ? "CUSTOMER" : "SUPPLIER";
      if (await duplicatePartnerId(db, oppositeType, partnerValues.name)) {
        return Response.json({ error: "El registro equivalente ya existe en el catálogo contrario." }, { status: 409 });
      }
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
    if (await duplicatePartnerId(db, partnerType, values.name, id)) {
      return Response.json({ error: `Ya existe ${partnerType === "CUSTOMER" ? "un cliente" : "un proveedor"} con ese nombre.` }, { status: 409 });
    }
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

export async function DELETE(request: Request) {
  const guard = requirePermission(request, "catalogs");
  if (guard) return guard;
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Registro no válido." }, { status: 400 });
    const db = await getDb();
    const [partner] = await db.select().from(businessPartners)
      .where(and(eq(businessPartners.id, id), eq(businessPartners.organizationCode, "USA"))).limit(1);
    if (!partner) return Response.json({ error: "Registro no encontrado." }, { status: 404 });
    const references = partner.partnerType === "CUSTOMER"
      ? await db.select({ id: sales.id }).from(sales).where(and(eq(sales.organizationCode, "USA"), eq(sales.customer, partner.name))).limit(1)
      : await db.select({ id: inventoryLots.id }).from(inventoryLots).where(and(eq(inventoryLots.organizationCode, "USA"), eq(inventoryLots.supplier, partner.name))).limit(1);
    if (references.length) {
      return Response.json({ error: `No se puede eliminar porque ${partner.partnerType === "CUSTOMER" ? "el cliente tiene ventas" : "el proveedor tiene entradas de inventario"}.` }, { status: 409 });
    }
    await db.delete(businessPartners).where(and(eq(businessPartners.id, id), eq(businessPartners.organizationCode, "USA")));
    return Response.json({ deletedId: id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible eliminar el registro." }, { status: 500 });
  }
}
