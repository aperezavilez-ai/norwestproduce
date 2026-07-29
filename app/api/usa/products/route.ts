import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { products } from "../../../../db/schema";
import { requirePermission } from "../../../../lib/api-auth";
import { clean } from "../../../../lib/auth";


export async function GET(request: Request) {
  const denied = requirePermission(request, "catalogs");
  if (denied) return denied;
  try {
    const db = await getDb();
    const rows = await db.select().from(products)
      .where(eq(products.organizationCode, "USA"))
      .orderBy(asc(products.name), asc(products.presentation));
    return Response.json({ products: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible consultar productos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = requirePermission(request, "catalogs");
  if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (!clean(payload.name)) return Response.json({ error: "Ingresa el nombre del producto." }, { status: 400 });
    const alias = clean(payload.alias).toUpperCase();
    const boxesPerPallet = payload.boxesPerPallet === "" || payload.boxesPerPallet == null ? null : Number(payload.boxesPerPallet);
    if (!/^[A-Z]{1,3}$/.test(alias)) return Response.json({ error: "El alias debe tener de 1 a 3 letras." }, { status: 400 });
    if (boxesPerPallet != null && (!Number.isInteger(boxesPerPallet) || boxesPerPallet <= 0)) return Response.json({ error: "Cajas por pallet debe ser un número entero mayor que cero." }, { status: 400 });
    const db = await getDb();
    const existingAlias = await db.select().from(products).where(and(eq(products.organizationCode, "USA"), eq(products.alias, alias)));
    if (existingAlias.some((item) => item.name.toLocaleLowerCase() !== clean(payload.name).toLocaleLowerCase())) return Response.json({ error: "Ese alias ya está asignado a otro producto." }, { status: 409 });
    if (existingAlias.some((item) => item.name.toLocaleLowerCase() === clean(payload.name).toLocaleLowerCase()
      && (item.presentation || "").toLocaleLowerCase() === clean(payload.presentation).toLocaleLowerCase()
      && (item.size || "").toLocaleLowerCase() === clean(payload.size).toLocaleLowerCase()
      && (item.label || "").toLocaleLowerCase() === clean(payload.label).toLocaleLowerCase())) {
      return Response.json({ error: "Esta combinación de producto, presentación, tamaño y etiqueta ya existe." }, { status: 409 });
    }
    const [product] = await db.insert(products).values({
      organizationCode: "USA",
      name: clean(payload.name),
      alias,
      presentation: clean(payload.presentation) || null,
      size: clean(payload.size) || null,
      label: clean(payload.label) || null,
      boxesPerPallet,
    }).returning();
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible guardar el producto." }, { status: 500 });
  }
}
