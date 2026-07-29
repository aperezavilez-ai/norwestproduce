"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, Fragment, KeyboardEvent, useEffect, useMemo, useState } from "react";
import type { BusinessPartner, ColdStorage, CompanySettings, InventoryLot, InvoiceAdjustment, InvoiceItem, PartnerType, Product, Sale, SellerLiquidation, UserAccount } from "../../lib/types";
import { calculateSellerProfitAllocations, normalizeSellerName } from "../../lib/seller-profit";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const moneyMxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const number = new Intl.NumberFormat("en-US");
const quoteNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quoteInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });
const documentDate = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
const SALES_ORDER_TERMS = "The perishable agricultural commodities listed on this invoice are sold subject to the statutory trust authorized by section 5(c) of the Perishable Agricultural Commodities Act, 1930 (7 U.S.C. 499e(c)). The seller of these commodities retains a trust claim over these commodities, all inventories of food or other products derived from these commodities, and any receivables or proceeds from the sale of these commodities until full payment is received. All claims must be supported by USDA Inspection Certificate. The tomatoes shipped under this bill of lading and sold pursuant to this invoice are subject to: 1) the 2019 Suspension Agreement between the United States Department of Commerce and certain tomato growers; 2) any subsequent amendments, clarifications or modifications thereof; and 3) certain letter agreements between yourselves and ourselves regarding the same, each of which is incorporated by this reference as if fully set forth herein. Copies of said agreements will be sent to you upon request. Failure to abide by these terms constitutes a violation of Section 2 of the PACA (7 U.S.C. §499b) and may subject the violator to disciplinary proceedings. Notice to subsequent purchaser or re-packer. These articles are imported. The requirements of 19 U.S.C. §1304 and 19 C.F.R. Part 134 provide that the articles or their containers must be marked in a conspicuous place as legibly, indelibly and permanently as the nature of the article or container will permit, in such a manner as to indicate to an ultimate purchaser in the United States, the English name of the country of origin of the articles. After payment is due, interest will accrue on unpaid balances at a rate of 18% per annum (1.5% per month) until paid. In the event a legal or other action is commenced to collect sums due under this invoice, the prevailing party shall be entitled to reimbursement of all costs and fees including reasonable attorney’s fees incurred. With the exception of tomatoes, which are covered by the Suspension Agreement, any variance noted by the receiver as to quantity, or price disparity must be brought to seller’s attention within 24 hours after the receipt of the merchandise. No adjustments on the above items will be honored unless seller is notified as herein stated.";
const INVOICE_TERMS = "Good Delivery Standars. Any claims for quality must be made within 24 hours of arrival at destination and must be supported with a timely federal inspection fo the complete lot in question. We reserve the right to deny credit. Negotiated under P.A.C.A. terms. INTEREST WILL ACCRUE ON ANY PAST BALANCE AT THE RATE OF 1.5% PER MONTH (18% PER ANNUM.) The perishable agricultural commodities listed on this invoice are sold subject to the statutory trust authorized by section 5(c) of the Perishable Agricultural Commodities Act, 1930 (7 U.S.C. 499e(c)). The seller of these commodities retains a trust claim over these commodities, all inventories of food or other products derived from these commodities, and any receivables or proceeds from the sale of these commodities until full payment is received. All claims must be supported by USDA Inspection Certificate. The tomatoes shipped under this bill of lading and sold pursuant to this invoice are subject to: 1) the 2019 Suspension Agreement between the United States Department of Commerce and certain tomato growers; 2) any subsequent amendments, clarifications or modifications thereof; and 3) certain letter agreements between yourselves and ourselves regarding the same, each of which is incorporated by this reference as if fully set forth herein. Copies of said agreements will be sent to you upon request. Failure to abide by these terms constitutes a violation of Section 2 of the PACA (7 U.S.C. §499b) and may subject the violator to disciplinary proceedings. Notice to subsequent purchaser or re-packer. These articles are imported. The requirements of 19 U.S.C. §1304 and 19 C.F.R. Part 134 provide that the articles or their containers must be marked in a conspicuous place as legibly, indelibly and permanently as the nature of the article or container will permit, in such a manner as to indicate to an ultimate purchaser in the United States, the English name of the country of origin of the articles. After payment is due, interest will accrue on unpaid balances at a rate of 18% per annum (1.5% per month) until paid. In the event a legal or other action is commenced to collect sums due under this invoice, the prevailing party shall be entitled to reimbursement of all costs and fees including reasonable attorney’s fees incurred. With the exception of tomatoes, which are covered by the Suspension Agreement, any variance noted by the receiver as to quantity, or price disparity must be brought to seller’s attention within 24 hours after the receipt of the merchandise. No adjustments on the above items will be honored unless seller is notified as herein stated.";
type Operation = "DIRECT_RESALE" | "IMPORTED_INVENTORY";
type Section = "dashboard" | "catalogs" | "inventory" | "importQuote" | "invoicing" | "collections" | "reports" | "administration" | "settings";
type CollectionFilter = "TODAS" | "VIGENTES" | "VENCIDAS" | "PAGADAS";
type ReportTab = "sales" | "inventory" | "collections" | "profit" | "importProfit" | "sellerProfit" | "salesByCustomer" | "salesDetailCustomer" | "salesBySeller" | "salesDetailSeller" | "salesByProduct" | "salesDetailProduct" | "salesByImportInvoice" | "salesDetailImportInvoice" | "adjustments";
type CatalogType = PartnerType | "WAREHOUSE" | "PRODUCT";
type StateOption = { code: string; name: string };
type LoadStatus = "OK" | "PAS" | "POSIBLE AJUSTE" | "USDA REQUESTED";
type InventoryEntryItem = { product: string; presentation: string; size: string; label: string; totalBoxes: string; boxesPerPallet: string; purchasePrice: string; purchaseCurrency: Currency };
type InventoryLoadGroup = { key: string; lots: InventoryLot[]; first: InventoryLot; totalBoxes: number; availableBoxes: number; allReceived: boolean };
type InventorySaleDraftItem = { lot: InventoryLot; boxes: string; salePrice: string };
type AdjustmentLineItem = InvoiceItem & { noAdjustment?: boolean };
type SalesReportLine = { sale: Sale; item: InvoiceItem; customer: string; seller: string; product: string; productDetail: string; importInvoice: string; boxes: number; price: number; total: number; profit: number; adjustments: number; invoiceValue: number };
type SalesReportGroup = { key: string; sales: Set<string>; boxes: number; total: number; profit: number; adjustments: number; invoiceValue: number; avgPrice: number };
type ImportQuoteProduct = { product: string; weight: string; weightUnit: "KG" | "LBS"; pallets: string; boxes: string; boxesPerPallet: string; purchasePriceMxn: string; marketPriceUsd: string };
type ImportQuoteItem = ImportQuoteProduct & { products: ImportQuoteProduct[]; freightMxn: string; mexicoCostsMxn: string; mexicoCostsCurrency: Currency; usCostsUsd: string; usCostsCurrency: Currency; inspectionUsd: string; coldStorageUsd: string; overweightMxn: string; overweightCurrency: Currency; otherCostsUsd: string; otherCostsCurrency: Currency; exchangeRate: string };
type ImportQuoteProductNumberField = "weight" | "pallets" | "boxes" | "boxesPerPallet" | "purchasePriceMxn" | "marketPriceUsd";
type ImportQuoteExpenseNumberField = "freightMxn" | "mexicoCostsMxn" | "usCostsUsd" | "inspectionUsd" | "coldStorageUsd" | "overweightMxn" | "otherCostsUsd" | "exchangeRate";
type ImportQuoteNumberField = ImportQuoteProductNumberField | ImportQuoteExpenseNumberField;
const importQuoteIntegerFields = new Set<ImportQuoteNumberField>(["pallets", "boxes", "boxesPerPallet"]);
const LOAD_STATUS_OPTIONS: LoadStatus[] = ["OK", "PAS", "POSIBLE AJUSTE", "USDA REQUESTED"];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function invoiceEligibilityMessage(sale: Sale) {
  if (!sale.pickupDate) return "Registra una fecha de pickup anterior a hoy para poder facturar.";
  if (sale.pickupDate >= localDateKey()) return "Sólo se puede facturar cuando la fecha de pickup sea anterior a hoy.";
  return "";
}

function formatDate(value: string | null) {
  return value ? shortDate.format(new Date(`${value}T00:00:00Z`)) : "—";
}

function formatDocumentDate(value: string | null) {
  return value ? documentDate.format(new Date(`${value}T00:00:00Z`)) : "—";
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function formatPhone(value: string | null | undefined) {
  const digits = digitsOnly(value || "");
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})-${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function parseQuoteNumber(value: string | number | null | undefined) {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanQuoteNumberInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...decimals] = cleaned.split(".");
  return decimals.length ? `${whole}.${decimals.join("").slice(0, 2)}` : whole;
}

function formatQuoteNumberInput(value: string) {
  const parsed = parseQuoteNumber(value);
  return parsed ? quoteNumber.format(parsed) : "";
}

function formatQuoteIntegerInput(value: string) {
  const parsed = Math.round(parseQuoteNumber(value));
  return parsed ? quoteInteger.format(parsed) : "";
}

function parseJsonArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function parseCostAttachmentMap(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([key, items]) => [key, Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []])) as Record<CostKey, string[]>;
  } catch {
    return {} as Record<CostKey, string[]>;
  }
}

function collectionStatus(sale: Sale): Exclude<CollectionFilter, "TODAS"> {
  if ((sale.paymentStatus || "").toLocaleUpperCase().includes("PAG")) return "PAGADAS";
  return sale.dueDate && sale.dueDate < localDateKey() ? "VENCIDAS" : "VIGENTES";
}

function overdueDays(dueDate: string | null) {
  if (!dueDate) return 0;
  const today = new Date(`${localDateKey()}T00:00:00Z`).getTime();
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((today - due) / 86400000));
}

function agingLabel(sale: Sale) {
  if (collectionStatus(sale) === "PAGADAS") return "Pagada";
  const days = overdueDays(sale.dueDate);
  if (!days) return "Vigente";
  if (days <= 30) return "1–30 días";
  if (days <= 60) return "31–60 días";
  if (days <= 90) return "61–90 días";
  return "+90 días";
}

function amountInWords(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Amount pending";
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underThousand = (whole: number) => {
    const parts: string[] = [];
    if (whole >= 100) { parts.push(`${ones[Math.floor(whole / 100)]} Hundred`); whole %= 100; }
    if (whole >= 20) { parts.push(tens[Math.floor(whole / 10)]); if (whole % 10) parts.push(ones[whole % 10]); }
    else if (whole) parts.push(ones[whole]);
    return parts.join(" ");
  };
  const whole = Math.floor(Math.abs(value));
  const cents = Math.round((Math.abs(value) - whole) * 100);
  const parts: string[] = [];
  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1_000);
  const remainder = whole % 1_000;
  if (millions) parts.push(`${underThousand(millions)} Million`);
  if (thousands) parts.push(`${underThousand(thousands)} Thousand`);
  if (remainder || !parts.length) parts.push(underThousand(remainder) || "Zero");
  return `${parts.join(" ")} Dollars and ${String(cents).padStart(2, "0")}/100`;
}

function partnerAddress(partner: BusinessPartner | undefined) {
  if (!partner) return ["Address pending"];
  const street = [partner.street, partner.exteriorNumber, partner.interiorNumber && `STE ${partner.interiorNumber}`].filter(Boolean).join(" ");
  const city = [partner.city, partner.stateCode, partner.postalCode].filter(Boolean).join(", ").replace(", ,", ",");
  return [street || "Address pending", city].filter(Boolean);
}

function invoiceItemsFor(sale: Sale): InvoiceItem[] {
  if (sale.invoiceItems) {
    try {
      const parsed = JSON.parse(sale.invoiceItems) as InvoiceItem[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* Fall back to the original sale row. */ }
  }
  return [{ product: sale.product, presentation: sale.presentation || "", size: sale.size || "", label: sale.label || "", quantity: sale.boxes, unitPrice: sale.salePrice || 0, purchasePrice: sale.purchasePrice ?? undefined }];
}

function invoiceItemDescription(item: InvoiceItem) {
  return [item.product, item.presentation, item.size, item.label].filter(Boolean).join(" - ");
}

function adjustedInvoiceItemsFromLines(originalItems: InvoiceItem[], adjustmentItems: AdjustmentLineItem[]) {
  return adjustmentItems.flatMap((item, index) => {
    const original = originalItems[index] || item;
    if (item.noAdjustment) return [{ ...original }];
    const affectedQuantity = Number(item.quantity);
    const originalQuantity = Number(original.quantity || 0);
    const remainingQuantity = originalQuantity - affectedQuantity;
    const rows: InvoiceItem[] = [{ ...original, quantity: affectedQuantity, unitPrice: Number(item.unitPrice) }];
    if (remainingQuantity > 0) rows.push({ ...original, quantity: remainingQuantity, unitPrice: Number(original.unitPrice) });
    return rows;
  });
}

function isAdjustedInvoiceItem(item: InvoiceItem, previousItems: InvoiceItem[]) {
  return previousItems.some((previous) => previous.product === item.product
    && previous.presentation === item.presentation
    && previous.size === item.size
    && previous.label === item.label
    && previous.unitPrice !== item.unitPrice);
}

function originalInvoiceItemsFor(sale: Sale): InvoiceItem[] {
  if (sale.originalInvoiceItems) {
    try {
      const parsed = JSON.parse(sale.originalInvoiceItems) as InvoiceItem[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch { /* Fall back to the current invoice items. */ }
  }
  return invoiceItemsFor(sale);
}

function adjustmentsFor(sale: Sale): InvoiceAdjustment[] {
  try {
    const parsed = JSON.parse(sale.invoiceAdjustments || "[]") as InvoiceAdjustment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saleReportKey(sale: Sale) {
  return String(sale.id ?? `${sale.invoiceNumber || ""}-${sale.pickupNumber || ""}-${sale.saleDate}-${sale.customer}`);
}

function groupSalesReportLines(rows: SalesReportLine[], keyFor: (row: SalesReportLine) => string): SalesReportGroup[] {
  const groups = new Map<string, SalesReportGroup>();
  rows.forEach((row) => {
    const key = keyFor(row) || "Sin asignar";
    const current = groups.get(key) || { key, sales: new Set<string>(), boxes: 0, total: 0, profit: 0, adjustments: 0, invoiceValue: 0, avgPrice: 0 };
    current.sales.add(saleReportKey(row.sale));
    current.boxes += row.boxes;
    current.total += row.total;
    current.profit += row.profit;
    current.adjustments += row.adjustments;
    current.invoiceValue += row.invoiceValue;
    groups.set(key, current);
  });
  return Array.from(groups.values())
    .map((row) => ({ ...row, avgPrice: row.boxes ? row.total / row.boxes : 0 }))
    .sort((a, b) => b.total - a.total);
}

const blankSale = {
  saleDate: localDateKey(), operationType: "DIRECT_RESALE" as Operation, supplier: "", inventoryLotId: "", customer: "", purchaseOrder: "", warehouse: "", pickupNumber: "",
  boxes: "", product: "", presentation: "", size: "", label: "", purchasePrice: "", salePrice: "", sellerName: "", shipDate: "", pickupDate: "",
  shipTo: "",
};

const MEXICAN_STATES = [
  { code: "AGS", name: "Aguascalientes" }, { code: "BC", name: "Baja California" }, { code: "BCS", name: "Baja California Sur" },
  { code: "CAMP", name: "Campeche" }, { code: "CHIS", name: "Chiapas" }, { code: "CHIH", name: "Chihuahua" },
  { code: "CDMX", name: "Ciudad de México" }, { code: "COAH", name: "Coahuila" }, { code: "COL", name: "Colima" },
  { code: "DGO", name: "Durango" }, { code: "GTO", name: "Guanajuato" }, { code: "GRO", name: "Guerrero" },
  { code: "HGO", name: "Hidalgo" }, { code: "JAL", name: "Jalisco" }, { code: "MEX", name: "Estado de México" },
  { code: "MICH", name: "Michoacán" }, { code: "MOR", name: "Morelos" }, { code: "NAY", name: "Nayarit" },
  { code: "NL", name: "Nuevo León" }, { code: "OAX", name: "Oaxaca" }, { code: "PUE", name: "Puebla" },
  { code: "QRO", name: "Querétaro" }, { code: "QROO", name: "Quintana Roo" }, { code: "SLP", name: "San Luis Potosí" },
  { code: "SIN", name: "Sinaloa" }, { code: "SON", name: "Sonora" }, { code: "TAB", name: "Tabasco" },
  { code: "TAMS", name: "Tamaulipas" }, { code: "TLAX", name: "Tlaxcala" }, { code: "VER", name: "Veracruz" },
  { code: "YUC", name: "Yucatán" }, { code: "ZAC", name: "Zacatecas" },
];

const blankPartner = {
  partnerType: "SUPPLIER" as PartnerType, name: "", pacaNumber: "", taxId: "", blueBookNumber: "", dunsNumber: "",
  street: "", exteriorNumber: "", interiorNumber: "", colonia: "", stateCode: "", stateName: "", city: "", postalCode: "",
  contactName: "", contactEmail: "", contactPhone: "", assignedSeller: "", profitPercentage: "0",
  buyerName: "", buyerEmail: "", buyerOfficePhone: "", buyerOfficeExtension: "", buyerMobilePhone: "",
};

const blankInventory = {
  loadDate: "", receivedDate: localDateKey(), supplier: "", warehouse: "", pickupNumber: "", product: "", presentation: "", size: "", label: "", totalBoxes: "",
  boxesPerPallet: "", palletsPerLoad: "", exchangeRate: "",
  purchasePrice: "", freightCost: "", mexicoCustomsCost: "", usCustomsCost: "", overweightCost: "", redLightCost: "", redLightUsCost: "", coldStorage: "", coldStorageCost: "",
  attachments: [] as string[], costAttachments: {} as Record<CostKey, string[]>,
};
const blankInventoryItem: InventoryEntryItem = { product: "", presentation: "", size: "", label: "", totalBoxes: "", boxesPerPallet: "", purchasePrice: "", purchaseCurrency: "MXN" };
const blankImportQuoteProduct: ImportQuoteProduct = { product: "", weight: "", weightUnit: "LBS", pallets: "", boxes: "", boxesPerPallet: "", purchasePriceMxn: "", marketPriceUsd: "" };
const blankImportQuoteItem: ImportQuoteItem = { ...blankImportQuoteProduct, products: [{ ...blankImportQuoteProduct }], freightMxn: "", mexicoCostsMxn: "", mexicoCostsCurrency: "MXN", usCostsUsd: "", usCostsCurrency: "USD", inspectionUsd: "", coldStorageUsd: "", overweightMxn: "", overweightCurrency: "MXN", otherCostsUsd: "", otherCostsCurrency: "USD", exchangeRate: "" };

const blankProduct = { name: "", alias: "", presentation: "", size: "", label: "", boxesPerPallet: "" };
const blankColdStorage = { name: "", address: "", phone: "", stateCode: "", stateName: "", city: "", street: "", exteriorNumber: "", interiorNumber: "", postalCode: "" };
const blankCompany = { legalName: "NORWEST PRODUCE LLC", street: "710 LAUREL AVENUE", city: "MCALLEN", state: "TX", postalCode: "78501", blueBookNumber: "", pacaNumber: "", dunsNumber: "", taxId: "", norwestProfitPercentage: "16" };
const blankUser = { fullName: "", alias: "", email: "", password: "", currentPassword: "", newPassword: "", confirmNewPassword: "", active: true, permissions: ["sales_view"] as string[] };
const PERMISSION_OPTIONS = [
  ["sales_view", "Consultar ventas"], ["sales_edit", "Crear y modificar ventas"], ["inventory", "Inventario importado"], ["invoicing", "Facturación"], ["collections", "Cartera"], ["catalogs", "Clientes y proveedores"], ["reports", "Reportes"], ["administration", "Administración"], ["settings", "Configuración de empresa"], ["users", "Administrar usuarios"],
] as const;
const ALL_PERMISSION_KEYS = PERMISSION_OPTIONS.map(([key]) => key);
const REPORT_OPTIONS: Array<[ReportTab, string]> = [
  ["sales", "Ventas"],
  ["inventory", "Inventario"],
  ["collections", "Cartera"],
  ["profit", "Utilidad por Venta"],
  ["importProfit", "Utilidad por Carga importada"],
  ["sellerProfit", "Utilidad por Vendedor"],
  ["salesByCustomer", "Ventas por Cliente"],
  ["salesDetailCustomer", "Detalle por Cliente"],
  ["salesBySeller", "Ventas por Vendedor"],
  ["salesDetailSeller", "Detalle por Vendedor"],
  ["salesByProduct", "Ventas por Producto"],
  ["salesDetailProduct", "Detalle por Producto"],
  ["salesByImportInvoice", "Ventas por Factura Import."],
  ["salesDetailImportInvoice", "Detalle Factura Import."],
  ["adjustments", "Ajustes"],
];
type Currency = "USD" | "MXN";
type CostKey = "purchasePrice" | "freightCost" | "mexicoCustomsCost" | "usCustomsCost" | "overweightCost" | "redLightCost" | "redLightUsCost" | "coldStorageCost";
const defaultCostCurrencies: Record<CostKey, Currency> = {
  purchasePrice: "MXN", freightCost: "MXN", mexicoCustomsCost: "MXN", usCustomsCost: "USD", overweightCost: "MXN", redLightCost: "MXN", redLightUsCost: "USD", coldStorageCost: "USD",
};
type PartnerTarget = "saleSupplier" | "saleCustomer" | "inventorySupplier" | null;

export default function UsaDashboard({ initialSales = [] }: { initialSales?: Sale[] }) {
  const router = useRouter();
  const [salesRows, setSalesRows] = useState<Sale[]>(initialSales);
  const [inventory, setInventory] = useState<InventoryLot[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>(["TODOS"]);
  const [operationFilters, setOperationFilters] = useState<string[]>(["TODAS"]);
  const [modalStep, setModalStep] = useState<"closed" | "choose" | "form">("closed");
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [form, setForm] = useState(blankSale);
  const [saleLineItems, setSaleLineItems] = useState<InvoiceItem[]>([]);
  const [inventorySaleLots, setInventorySaleLots] = useState<InventoryLot[] | null>(null);
  const [inventorySaleDraft, setInventorySaleDraft] = useState<InventorySaleDraftItem[]>([]);
  const [inventorySaleWarning, setInventorySaleWarning] = useState<{ lot: InventoryLot; salePrice: number; loss: number } | null>(null);
  const [saveState, setSaveState] = useState("");
  const [section, setSection] = useState<Section>("dashboard");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("TODAS");
  const [collectionCustomer, setCollectionCustomer] = useState("");
  const [statementCustomer, setStatementCustomer] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<ReportTab>("sales");
  const [reportQuery, setReportQuery] = useState("");
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [expandedReportGroup, setExpandedReportGroup] = useState<string | null>(null);
  const [reportPrintMode, setReportPrintMode] = useState(false);
  const [sellerLiquidations, setSellerLiquidations] = useState<SellerLiquidation[]>([]);
  const [sellerLiquidationForm, setSellerLiquidationForm] = useState({ sellerName: "", liquidationDate: localDateKey(), amount: "", notes: "" });
  const [sellerLiquidationState, setSellerLiquidationState] = useState("");
  const [sellerDetailName, setSellerDetailName] = useState<string | null>(null);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [partnerTypeFilter, setPartnerTypeFilter] = useState<CatalogType>("SUPPLIER");
  const [partnerModal, setPartnerModal] = useState<PartnerType | null>(null);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [partnerForm, setPartnerForm] = useState(blankPartner);
  const [partnerSaveState, setPartnerSaveState] = useState("");
  const [alsoOppositeType, setAlsoOppositeType] = useState(false);
  const [isMexicanPartner, setIsMexicanPartner] = useState(false);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [inventoryModal, setInventoryModal] = useState(false);
  const [editingInventoryId, setEditingInventoryId] = useState<number | null>(null);
  const [editingInventoryItemIds, setEditingInventoryItemIds] = useState<number[]>([]);
  const [inventoryForm, setInventoryForm] = useState(blankInventory);
  const [inventoryItems, setInventoryItems] = useState<InventoryEntryItem[]>([{ ...blankInventoryItem }]);
  const [inventorySaveState, setInventorySaveState] = useState("");
  const [inventoryDetailLots, setInventoryDetailLots] = useState<InventoryLot[] | null>(null);
  const [adminInventoryLot, setAdminInventoryLot] = useState<InventoryLot | null>(null);
  const [adminCredentials, setAdminCredentials] = useState({ email: "", password: "" });
  const [adminAuthState, setAdminAuthState] = useState("");
  const [importQuoteItems, setImportQuoteItems] = useState<ImportQuoteItem[]>([{ ...blankImportQuoteItem }]);
  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);
  const [invoiceStep, setInvoiceStep] = useState<"closed" | "pickup" | "bol" | "items">("closed");
  const [pickedUp, setPickedUp] = useState<boolean | null>(null);
  const [bolFile, setBolFile] = useState<File | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceSaveState, setInvoiceSaveState] = useState("");
  const [invoicePreview, setInvoicePreview] = useState<Sale | null>(null);
  const [adjustmentSale, setAdjustmentSale] = useState<Sale | null>(null);
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentLineItem[]>([]);
  const [adjustmentReason, setAdjustmentReason] = useState<InvoiceAdjustment["reason"]>("CAMBIO DE PRECIO");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [adjustmentInternalNotes, setAdjustmentInternalNotes] = useState("");
  const [adjustmentSaveState, setAdjustmentSaveState] = useState("");
  const [adjustmentPreview, setAdjustmentPreview] = useState<{ sale: Sale; adjustment: InvoiceAdjustment } | null>(null);
  const [socPreview, setSocPreview] = useState<Sale | null>(null);
  const [productDetailSale, setProductDetailSale] = useState<Sale | null>(null);
  const [productDetailItems, setProductDetailItems] = useState<InvoiceItem[]>([]);
  const [productDetailSaveState, setProductDetailSaveState] = useState("");
  const [productDetailReadOnly, setProductDetailReadOnly] = useState(false);
  const [importLoadDetail, setImportLoadDetail] = useState<{ loadReference: string; sales: Sale[] } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [expandedCatalogProducts, setExpandedCatalogProducts] = useState<string[]>([]);
  const [productModal, setProductModal] = useState(false);
  const [productForm, setProductForm] = useState(blankProduct);
  const [productVariantBase, setProductVariantBase] = useState<{ name: string; alias: string } | null>(null);
  const [productSaveState, setProductSaveState] = useState("");
  const [partnerTarget, setPartnerTarget] = useState<PartnerTarget>(null);
  const [productTarget, setProductTarget] = useState<"sale" | "inventory" | "catalog" | null>(null);
  const [productTargetLine, setProductTargetLine] = useState<number | null>(null);
  const [additionalExpenses, setAdditionalExpenses] = useState<Array<{ concept: string; amount: string; currency: Currency }>>([]);
  const [expenseConcepts, setExpenseConcepts] = useState<string[]>([]);
  const [activeExpenseConcept, setActiveExpenseConcept] = useState<number | null>(null);
  const [costCurrencies, setCostCurrencies] = useState<Record<CostKey, Currency>>(defaultCostCurrencies);
  const [, setTotalBoxesManual] = useState(false);
  const [coldStorages, setColdStorages] = useState<ColdStorage[]>([]);
  const [coldStorageModal, setColdStorageModal] = useState(false);
  const [coldStorageTarget, setColdStorageTarget] = useState<"inventory" | "sale" | "catalog">("inventory");
  const [editingColdStorageId, setEditingColdStorageId] = useState<number | null>(null);
  const [coldStorageForm, setColdStorageForm] = useState(blankColdStorage);
  const [coldStorageSaveState, setColdStorageSaveState] = useState("");
  const [companyForm, setCompanyForm] = useState(blankCompany);
  const [companySaveState, setCompanySaveState] = useState("");
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [userModal, setUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState(blankUser);
  const [userSaveState, setUserSaveState] = useState("");
  const [visibleUserPasswords, setVisibleUserPasswords] = useState({ password: false, current: false, next: false, confirm: false });
  const [statusModalSale, setStatusModalSale] = useState<Sale | null>(null);
  const [statusModalType, setStatusModalType] = useState<"PAS" | "USDA REQUESTED" | null>(null);
  const [pasDays, setPasDays] = useState("");
  const [usdaFile, setUsdaFile] = useState<File | null>(null);
  const [statusSaveState, setStatusSaveState] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cancelSale, setCancelSale] = useState<Sale | null>(null);
  const [cancelParty, setCancelParty] = useState<"CLIENTE CANCELÓ" | "NW CANCELÓ">("CLIENTE CANCELÓ");
  const [cancelReason, setCancelReason] = useState("Sin Razón");
  const [cancelSaveState, setCancelSaveState] = useState("");
  const [settingsAuthOpen, setSettingsAuthOpen] = useState(false);
  const [settingsCredentials, setSettingsCredentials] = useState({ email: "", password: "" });
  const [settingsAuthState, setSettingsAuthState] = useState("");

  useEffect(() => {
    fetch("/api/usa/sales").then((response) => response.ok ? response.json() : Promise.reject()).then((data) => {
      if (Array.isArray(data.sales)) setSalesRows(data.sales);
    }).catch(() => undefined);
    fetch("/api/usa/settings").then((response) => response.ok ? response.json() : Promise.reject()).then((data) => {
      if (!data.settings) return;
      const settings = data.settings as CompanySettings;
      setCompanyForm({ legalName: settings.legalName, street: settings.street, city: settings.city, state: settings.state, postalCode: settings.postalCode, blueBookNumber: settings.blueBookNumber, pacaNumber: settings.pacaNumber, dunsNumber: settings.dunsNumber, taxId: settings.taxId, norwestProfitPercentage: String(settings.norwestProfitPercentage ?? 16) });
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    function closeOpenFilters(event: PointerEvent) {
      const target = event.target as Node | null;
      document.querySelectorAll<HTMLDetailsElement>("details.filter-multiselect[open]").forEach((menu) => {
        if (!target || !menu.contains(target)) menu.removeAttribute("open");
      });
    }

    document.addEventListener("pointerdown", closeOpenFilters);
    return () => document.removeEventListener("pointerdown", closeOpenFilters);
  }, []);

  useEffect(() => {
    if (!reportPrintMode) return undefined;
    const finish = () => setReportPrintMode(false);
    window.addEventListener("afterprint", finish);
    return () => window.removeEventListener("afterprint", finish);
  }, [reportPrintMode]);

  async function loadPartners() {
    try {
      const response = await fetch("/api/usa/partners");
      const data = await response.json();
      if (Array.isArray(data.partners)) setPartners(data.partners);
    } catch {
      setPartners([]);
    }
  }

  async function loadProducts() {
    try {
      const response = await fetch("/api/usa/products");
      const data = await response.json();
      if (Array.isArray(data.products)) setProducts(data.products);
    } catch {
      setProducts([]);
    }
  }

  async function loadColdStorages() {
    try {
      const response = await fetch("/api/usa/cold-storages");
      const data = await response.json();
      if (Array.isArray(data.coldStorages)) setColdStorages(data.coldStorages);
    } catch {
      setColdStorages([]);
    }
  }

  async function loadExpenseConcepts() {
    try {
      const response = await fetch("/api/usa/inventory?all=1");
      const data = await response.json();
      const concepts: string[] = (Array.isArray(data.lots) ? data.lots : []).flatMap((lot: InventoryLot) => {
        try {
          const expenses = JSON.parse(lot.additionalExpenses || "[]") as Array<{ concept?: string }>;
          return expenses.map((item) => item.concept?.trim()).filter((item): item is string => Boolean(item));
        } catch {
          return [];
        }
      });
      setExpenseConcepts(Array.from(new Map<string, string>(concepts.map((item) => [item.toLocaleLowerCase(), item])).values()).sort((a, b) => a.localeCompare(b)));
    } catch {
      setExpenseConcepts([]);
    }
  }

  async function loadCaptureCatalogs() {
    await Promise.all([loadPartners(), loadProducts(), loadColdStorages()]);
  }

  async function loadSettings() {
    const [settingsResponse, usersResponse] = await Promise.all([fetch("/api/usa/settings"), fetch("/api/usa/users")]);
    const [settingsData, usersData] = await Promise.all([settingsResponse.json(), usersResponse.json()]);
    if (settingsResponse.ok && settingsData.settings) {
      const settings = settingsData.settings as CompanySettings;
      setCompanyForm({ legalName: settings.legalName, street: settings.street, city: settings.city, state: settings.state, postalCode: settings.postalCode, blueBookNumber: settings.blueBookNumber, pacaNumber: settings.pacaNumber, dunsNumber: settings.dunsNumber, taxId: settings.taxId, norwestProfitPercentage: String(settings.norwestProfitPercentage ?? 16) });
    }
    if (usersResponse.ok && Array.isArray(usersData.users)) setUsers(usersData.users);
  }

  async function loadSellerLiquidations() {
    try {
      const response = await fetch("/api/usa/seller-liquidations");
      const data = await response.json();
      if (Array.isArray(data.liquidations)) setSellerLiquidations(data.liquidations);
    } catch {
      setSellerLiquidations([]);
    }
  }

  function openSettings() {
    setSettingsAuthOpen(true);
    setSettingsAuthState("");
    setSettingsCredentials({ email: "", password: "" });
  }

  async function authorizeSettings(event: FormEvent) {
    event.preventDefault();
    setSettingsAuthState("Verificando...");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsCredentials) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No fue posible validar el usuario.");
      const permissions = JSON.parse(data.user?.permissions || "[]") as string[];
      const isAdmin = ALL_PERMISSION_KEYS.every((key) => permissions.includes(key));
      if (!isAdmin) throw new Error("El usuario no es Administrador.");
      setSettingsAuthOpen(false);
      setSection("settings");
      setCompanySaveState("");
      void loadSettings();
    } catch (error) {
      setSettingsAuthState(error instanceof Error ? error.message : "No fue posible validar el usuario.");
    }
  }

  function openReports() {
    setSection("reports");
    void Promise.all([loadPartners(), loadProducts(), loadColdStorages(), loadInventory(true), loadSettings(), loadSellerLiquidations()]);
  }

  function printCurrentReport() {
    setReportPrintMode(true);
    window.setTimeout(() => window.print(), 50);
  }

  function openAdministration() {
    setSection("administration");
    setSellerLiquidationState("");
    void Promise.all([loadPartners(), loadSettings(), loadSellerLiquidations()]);
  }

  async function saveSellerLiquidation(event: FormEvent) {
    event.preventDefault();
    setSellerLiquidationState("Guardando...");
    try {
      const response = await fetch("/api/usa/seller-liquidations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sellerLiquidationForm, sellerName: canonicalSellerName(sellerLiquidationForm.sellerName) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar la liquidacion.");
      if (data.liquidation) setSellerLiquidations((current) => [data.liquidation, ...current]);
      setSellerLiquidationForm((current) => ({ sellerName: current.sellerName, liquidationDate: localDateKey(), amount: "", notes: "" }));
      setSellerLiquidationState("Liquidacion registrada correctamente.");
    } catch (error) {
      setSellerLiquidationState(error instanceof Error ? error.message : "No se pudo registrar la liquidacion.");
    }
  }

  async function saveCompanySettings(event: FormEvent) {
    event.preventDefault();
    setCompanySaveState("Guardando…");
    try {
      const response = await fetch("/api/usa/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(companyForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      setCompanySaveState("Cambios guardados correctamente.");
    } catch (error) {
      setCompanySaveState(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  function openUserForm(user?: UserAccount) {
    setEditingUserId(user?.id ?? null);
    setUserForm(user ? { fullName: user.fullName, alias: user.alias, email: user.email, password: "", currentPassword: "", newPassword: "", confirmNewPassword: "", active: user.active, permissions: (() => { try { return JSON.parse(user.permissions) as string[]; } catch { return []; } })() } : blankUser);
    setVisibleUserPasswords({ password: false, current: false, next: false, confirm: false });
    setUserSaveState("");
    setUserModal(true);
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    if (editingUserId && userForm.newPassword !== userForm.confirmNewPassword) {
      setUserSaveState("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    setUserSaveState("Guardando…");
    try {
      const payload = editingUserId && !userForm.newPassword && !userForm.confirmNewPassword ? { ...userForm, currentPassword: "", newPassword: "", confirmNewPassword: "", id: editingUserId } : { ...userForm, id: editingUserId };
      const response = await fetch("/api/usa/users", { method: editingUserId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el usuario.");
      setUsers((current) => (editingUserId ? current.map((item) => item.id === editingUserId ? data.user : item) : [...current, data.user]).sort((a, b) => a.fullName.localeCompare(b.fullName)));
      setUserModal(false);
      setUserSaveState("");
    } catch (error) {
      setUserSaveState(error instanceof Error ? error.message : "No se pudo guardar el usuario.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
  }

  async function openCatalogs() {
    setSection("catalogs");
    await Promise.all([loadPartners(), loadColdStorages(), loadProducts()]);
  }

  async function openPartnerForm(type: PartnerType, target: PartnerTarget = null) {
    setPartnerTarget(target);
    setEditingPartnerId(null);
    setPartnerForm({ ...blankPartner, partnerType: type });
    setAlsoOppositeType(false);
    setIsMexicanPartner(false);
    setPartnerSaveState("");
    setCities([]);
    setPartnerModal(type);
    if (type === "CUSTOMER" && !users.length) {
      fetch("/api/usa/users").then((response) => response.json()).then((data) => { if (Array.isArray(data.users)) setUsers(data.users); }).catch(() => undefined);
    }
    if (!states.length) {
      try {
        const response = await fetch("/api/usa/locations");
        const data = await response.json();
        if (Array.isArray(data.states)) setStates(data.states);
      } catch {
        setStates([]);
      }
    }
  }

  async function editPartner(partner: BusinessPartner) {
    setEditingPartnerId(partner.id);
    setPartnerForm({
      partnerType: partner.partnerType, name: partner.name, pacaNumber: partner.pacaNumber || "", taxId: partner.taxId || "", blueBookNumber: partner.blueBookNumber || "", dunsNumber: partner.dunsNumber || "",
      street: partner.street || "", exteriorNumber: partner.exteriorNumber || "", interiorNumber: partner.interiorNumber || "", colonia: "", stateCode: partner.stateCode, stateName: partner.stateName,
      city: partner.city, postalCode: partner.postalCode, contactName: partner.contactName, contactEmail: partner.contactEmail, contactPhone: partner.contactPhone,
      assignedSeller: partner.assignedSeller || "",
      profitPercentage: String(partner.profitPercentage || 0),
      buyerName: partner.buyerName || "", buyerEmail: partner.buyerEmail || "", buyerOfficePhone: partner.buyerOfficePhone || "", buyerOfficeExtension: partner.buyerOfficeExtension || "", buyerMobilePhone: partner.buyerMobilePhone || "",
    });
    const oppositeType = partner.partnerType === "SUPPLIER" ? "CUSTOMER" : "SUPPLIER";
    setAlsoOppositeType(partners.some((item) => item.partnerType === oppositeType && item.name === partner.name));
    setIsMexicanPartner(MEXICAN_STATES.some((s) => s.code === partner.stateCode));
    setPartnerSaveState("");
    setPartnerModal(partner.partnerType);
    if (partner.partnerType === "CUSTOMER" && !users.length) {
      fetch("/api/usa/users").then((response) => response.json()).then((data) => { if (Array.isArray(data.users)) setUsers(data.users); }).catch(() => undefined);
    }
    try {
      const [statesResponse, citiesResponse] = await Promise.all([
        fetch("/api/usa/locations"),
        fetch(`/api/usa/locations?state=${encodeURIComponent(partner.stateCode)}`),
      ]);
      const statesData = await statesResponse.json();
      const citiesData = await citiesResponse.json();
      if (Array.isArray(statesData.states)) setStates(statesData.states);
      if (Array.isArray(citiesData.cities)) setCities(citiesData.cities);
    } catch {
      setCities([partner.city]);
    }
  }

  async function changePartnerState(code: string) {
    const selected = states.find((state) => state.code === code);
    setPartnerForm((current) => ({ ...current, stateCode: code, stateName: selected?.name ?? "", city: "" }));
    setCities([]);
    if (!code) return;
    setCitiesLoading(true);
    try {
      const response = await fetch(`/api/usa/locations?state=${encodeURIComponent(code)}`);
      const data = await response.json();
      setCities(Array.isArray(data.cities) ? data.cities : []);
    } catch {
      setCities([]);
    } finally {
      setCitiesLoading(false);
    }
  }

  async function savePartner(event: FormEvent) {
    event.preventDefault();
    setPartnerSaveState("Guardando…");
    try {
      const response = await fetch("/api/usa/partners", { method: editingPartnerId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...partnerForm, id: editingPartnerId, alsoOppositeType, isMexican: isMexicanPartner }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      setPartners((current) => {
        const incoming = (Array.isArray(data.partners) ? data.partners : [data.partner]).filter(Boolean) as BusinessPartner[];
        const byId = new Map(current.map((partner) => [partner.id, partner]));
        incoming.forEach((partner) => byId.set(partner.id, partner));
        return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
      });
      if (!editingPartnerId && partnerTarget === "saleSupplier") setForm((current) => ({ ...current, supplier: data.partner.name }));
      if (!editingPartnerId && partnerTarget === "saleCustomer") setForm((current) => ({ ...current, customer: data.partner.name, sellerName: data.partner.assignedSeller ? canonicalSellerName(data.partner.assignedSeller) : "" }));
      if (!editingPartnerId && partnerTarget === "inventorySupplier") setInventoryForm((current) => ({ ...current, supplier: data.partner.name }));
      setPartnerTypeFilter(partnerForm.partnerType);
      setPartnerModal(null);
      setPartnerTarget(null);
      setPartnerSaveState("");
    } catch (error) {
      setPartnerSaveState(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  async function loadInventory(includeAll = false) {
    setInventoryLoading(true);
    try {
      const response = await fetch(`/api/usa/inventory${includeAll ? "?all=1" : ""}`);
      const data = await response.json();
      setInventory(Array.isArray(data.lots) ? data.lots : []);
    } catch {
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  }

  async function openInventorySection() {
    setSection("inventory");
    setInventoryLoading(true);
    try {
      const response = await fetch("/api/usa/inventory?all=1");
      const data = await response.json();
      setInventory(Array.isArray(data.lots) ? data.lots : []);
    } catch {
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  }

  async function saveInventoryEntry(event: FormEvent) {
    event.preventDefault();
    setInventorySaveState("Guardando…");
    try {
      const normalizedItems = inventoryItems
        .filter((item) => item.product || item.totalBoxes || item.boxesPerPallet || item.purchasePrice)
        .map((item) => ({ ...item, totalBoxes: Number(item.totalBoxes), boxesPerPallet: item.boxesPerPallet, purchasePrice: Number(item.purchasePrice), purchaseCurrency: item.purchaseCurrency }));
      const totalBoxes = normalizedItems.reduce((sum, item) => sum + (Number(item.totalBoxes) || 0), 0);
      const response = await fetch("/api/usa/inventory", { method: editingInventoryId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...inventoryForm, id: editingInventoryId, itemIds: editingInventoryItemIds, items: normalizedItems, totalBoxes, product: normalizedItems[0]?.product || "", presentation: normalizedItems[0]?.presentation || "", size: normalizedItems[0]?.size || "", label: normalizedItems[0]?.label || "", boxesPerPallet: normalizedItems[0]?.boxesPerPallet || "", purchasePrice: normalizedItems[0]?.purchasePrice ?? "", purchaseCurrency: normalizedItems[0]?.purchaseCurrency ?? "MXN", additionalExpenses, costCurrencies }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar la entrada.");
      const savedLots = Array.isArray(data.lots) ? data.lots as InventoryLot[] : [data.lot as InventoryLot];
      setInventory((current) => {
        if (!editingInventoryId) return [...savedLots, ...current];
        const savedById = new Map(savedLots.map((lot) => [lot.id, lot]));
        const editedIds = new Set(editingInventoryItemIds);
        const updated = current.filter((lot) => !editedIds.has(lot.id) || savedById.has(lot.id)).map((lot) => savedById.get(lot.id) || lot);
        const existingIds = new Set(current.map((lot) => lot.id));
        return [...savedLots.filter((lot) => !existingIds.has(lot.id)), ...updated];
      });
      setExpenseConcepts((current) => Array.from(new Map([...current, ...additionalExpenses.map((item) => item.concept.trim()).filter(Boolean)].map((item) => [item.toLocaleLowerCase(), item])).values()).sort((a, b) => a.localeCompare(b)));
      setInventoryModal(false);
      setEditingInventoryId(null);
      setEditingInventoryItemIds([]);
      setInventorySaveState("");
    } catch (error) {
      setInventorySaveState(error instanceof Error ? error.message : "No se pudo registrar la entrada.");
    }
  }

  function openInventoryEntry() {
    setEditingInventoryId(null);
    setEditingInventoryItemIds([]);
    setInventoryForm({ ...blankInventory, receivedDate: localDateKey() });
    setInventoryItems([{ ...blankInventoryItem }]);
    setAdditionalExpenses([]);
    setCostCurrencies(defaultCostCurrencies);
    setTotalBoxesManual(false);
    setActiveExpenseConcept(null);
    setInventorySaveState("");
    setInventoryModal(true);
    void Promise.all([loadCaptureCatalogs(), loadExpenseConcepts()]);
  }

  function inventoryLoadKey(lot: InventoryLot) {
    return [lot.loadDate || "", lot.receivedDate || "", lot.supplier || "", lot.warehouse || "", lot.coldStorage || "", lot.pickupNumber || ""]
      .join("::")
      .toLocaleLowerCase();
  }

  function relatedInventoryLots(lot: InventoryLot) {
    const key = inventoryLoadKey(lot);
    return inventory.filter((item) => inventoryLoadKey(item) === key).sort((a, b) => a.id - b.id);
  }

  function openEditInventoryEntry(lot: InventoryLot) {
    if (lot.availableBoxes <= 0) return;
    const groupLots = relatedInventoryLots(lot);
    const parsedExpenses = (() => {
      try {
        const value = JSON.parse(lot.additionalExpenses || "[]") as Array<{ concept?: string; amount?: number; currency?: Currency }>;
        return Array.isArray(value) ? value.map((item) => ({ concept: item.concept || "", amount: item.amount == null ? "" : String(item.amount), currency: item.currency === "MXN" ? "MXN" as Currency : "USD" as Currency })) : [];
      } catch {
        return [];
      }
    })();
    const parsedCurrencies = (() => {
      try {
        return { ...defaultCostCurrencies, ...(JSON.parse(lot.costCurrencies || "{}") as Partial<Record<CostKey, Currency>>) };
      } catch {
        return defaultCostCurrencies;
      }
    })();
    setEditingInventoryId(groupLots[0]?.id ?? lot.id);
    setEditingInventoryItemIds(groupLots.map((item) => item.id));
    setInventoryForm({
      loadDate: groupLots[0]?.loadDate || lot.loadDate || "",
      receivedDate: groupLots[0]?.receivedDate || lot.receivedDate,
      supplier: groupLots[0]?.supplier || lot.supplier || "",
      warehouse: groupLots[0]?.warehouse || lot.warehouse,
      pickupNumber: groupLots[0]?.pickupNumber || lot.pickupNumber || "",
      product: groupLots[0]?.product || lot.product,
      presentation: groupLots[0]?.presentation || lot.presentation || "",
      size: groupLots[0]?.size || lot.size || "",
      label: groupLots[0]?.label || lot.label || "",
      totalBoxes: String(groupLots.reduce((sum, item) => sum + item.totalBoxes, 0)),
      boxesPerPallet: groupLots[0]?.boxesPerPallet == null ? "" : String(groupLots[0].boxesPerPallet),
      palletsPerLoad: "",
      exchangeRate: groupLots[0]?.exchangeRate == null ? "" : String(groupLots[0].exchangeRate),
      purchasePrice: groupLots[0]?.purchasePrice == null ? "" : String(groupLots[0].purchasePrice),
      freightCost: String(groupLots[0]?.freightCost || ""),
      mexicoCustomsCost: String(groupLots[0]?.mexicoCustomsCost || ""),
      usCustomsCost: String(groupLots[0]?.usCustomsCost || ""),
      overweightCost: String(groupLots[0]?.overweightCost || ""),
      redLightCost: String(groupLots[0]?.redLightCost || ""),
      redLightUsCost: String(groupLots[0]?.redLightUsCost || ""),
      coldStorage: groupLots[0]?.coldStorage || groupLots[0]?.warehouse || lot.coldStorage || lot.warehouse,
      coldStorageCost: String(groupLots[0]?.coldStorageCost || ""),
      attachments: parseJsonArray(groupLots[0]?.attachments),
      costAttachments: parseCostAttachmentMap(groupLots[0]?.costAttachments),
    });
    setInventoryItems(groupLots.map((item) => {
      const parsedCurrencies = (() => { try { return JSON.parse(item.costCurrencies || "{}") as Partial<Record<CostKey, Currency>>; } catch { return {}; } })();
      const purchaseCurrency = parsedCurrencies.purchasePrice === "USD" ? "USD" : "MXN";
      const exchangeRate = item.exchangeRate || 0;
      const purchasePrice = purchaseCurrency === "MXN" && exchangeRate && item.purchasePrice != null ? item.purchasePrice * exchangeRate : item.purchasePrice;
      return {
        product: item.product,
        presentation: item.presentation || "",
        size: item.size || "",
        label: item.label || "",
        totalBoxes: String(item.totalBoxes),
        boxesPerPallet: item.boxesPerPallet == null ? "" : String(item.boxesPerPallet),
        purchasePrice: purchasePrice == null ? "" : String(purchasePrice),
        purchaseCurrency,
      };
    }));
    setAdditionalExpenses(parsedExpenses);
    setCostCurrencies(parsedCurrencies);
    setTotalBoxesManual(true);
    setActiveExpenseConcept(null);
    setInventorySaveState("");
    setInventoryModal(true);
    void Promise.all([loadCaptureCatalogs(), loadExpenseConcepts()]);
  }

  async function receiveInventoryEntry(lot: InventoryLot) {
    try {
      const response = await fetch("/api/usa/inventory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: lot.id, receive: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo confirmar la recepción.");
      setInventory((current) => current.map((item) => item.id === lot.id ? data.lot : item));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo confirmar la recepción.");
    }
  }

  async function receiveInventoryGroup(lots: InventoryLot[]) {
    for (const lot of lots.filter((item) => !item.receivedConfirmedAt)) {
      await receiveInventoryEntry(lot);
    }
  }

  function requestEditInventoryEntry(lot: InventoryLot) {
    if (lot.receivedConfirmedAt) {
      setAdminInventoryLot(lot);
      setAdminCredentials({ email: "", password: "" });
      setAdminAuthState("");
      return;
    }
    openEditInventoryEntry(lot);
  }

  async function authorizeInventoryEdit(event: FormEvent) {
    event.preventDefault();
    if (!adminInventoryLot) return;
    setAdminAuthState("Validando…");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adminCredentials) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo validar el administrador.");
      const permissions = JSON.parse(data.user?.permissions || "[]") as string[];
      if (!permissions.includes("users") && !permissions.includes("settings")) throw new Error("El usuario no tiene permiso de administrador.");
      const lot = adminInventoryLot;
      setAdminInventoryLot(null);
      setAdminAuthState("");
      openEditInventoryEntry(lot);
    } catch (error) {
      setAdminAuthState(error instanceof Error ? error.message : "No se pudo validar el administrador.");
    }
  }

  async function openColdStorageForm(target: "inventory" | "sale" | "catalog" = "inventory", coldStorage?: ColdStorage) {
    setColdStorageTarget(target);
    setEditingColdStorageId(coldStorage?.id ?? null);
    setColdStorageForm(coldStorage ? { name: coldStorage.name, address: coldStorage.address, phone: coldStorage.phone, stateCode: coldStorage.stateCode || "", stateName: coldStorage.stateName || "", city: coldStorage.city || "", street: coldStorage.street || "", exteriorNumber: coldStorage.exteriorNumber || "", interiorNumber: coldStorage.interiorNumber || "", postalCode: coldStorage.postalCode || "" } : blankColdStorage);
    setColdStorageSaveState("");
    setCities([]);
    setColdStorageModal(true);
    try {
      const statesResponse = await fetch("/api/usa/locations");
      const statesData = await statesResponse.json();
      if (Array.isArray(statesData.states)) setStates(statesData.states);
      if (coldStorage?.stateCode) {
        const citiesResponse = await fetch(`/api/usa/locations?state=${encodeURIComponent(coldStorage.stateCode)}`);
        const citiesData = await citiesResponse.json();
        if (Array.isArray(citiesData.cities)) setCities(citiesData.cities);
      }
    } catch {
      if (coldStorage?.city) setCities([coldStorage.city]);
    }
  }

  async function changeColdStorageState(code: string) {
    const selected = states.find((state) => state.code === code);
    setColdStorageForm((current) => ({ ...current, stateCode: code, stateName: selected?.name ?? "", city: "" }));
    setCities([]);
    if (!code) return;
    setCitiesLoading(true);
    try {
      const response = await fetch(`/api/usa/locations?state=${encodeURIComponent(code)}`);
      const data = await response.json();
      setCities(Array.isArray(data.cities) ? data.cities : []);
    } catch {
      setCities([]);
    } finally {
      setCitiesLoading(false);
    }
  }

  async function saveColdStorage(event: FormEvent) {
    event.preventDefault();
    setColdStorageSaveState("Guardando…");
    try {
      const response = await fetch("/api/usa/cold-storages", { method: editingColdStorageId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...coldStorageForm, id: editingColdStorageId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el cold storage.");
      setColdStorages((current) => (editingColdStorageId ? current.map((item) => item.id === editingColdStorageId ? data.coldStorage : item) : [...current, data.coldStorage]).sort((a, b) => a.name.localeCompare(b.name)));
      if (!editingColdStorageId && coldStorageTarget === "sale") {
        setForm((current) => ({ ...current, warehouse: data.coldStorage.name, shipTo: warehouseShipTo(data.coldStorage) }));
      } else if (!editingColdStorageId && coldStorageTarget === "inventory") {
        setInventoryForm((current) => ({ ...current, coldStorage: data.coldStorage.name, warehouse: data.coldStorage.name }));
      }
      setColdStorageModal(false);
      setEditingColdStorageId(null);
      setColdStorageSaveState("");
    } catch (error) {
      setColdStorageSaveState(error instanceof Error ? error.message : "No se pudo guardar el cold storage.");
    }
  }

  function chooseColdStorage(value: string) {
    if (value === "__new__") return openColdStorageForm("inventory");
    const selected = coldStorages.find((item) => String(item.id) === value);
    setInventoryForm((current) => ({ ...current, coldStorage: selected?.name || "", warehouse: selected?.name || "" }));
  }

  function warehouseShipTo(warehouse: ColdStorage | undefined) {
    return warehouse ? [warehouse.city, warehouse.stateCode].filter(Boolean).join(", ") || warehouse.name : "";
  }

  function chooseSaleWarehouse(value: string) {
    if (value === "__new__") return openColdStorageForm("sale");
    if (value.startsWith("legacy:")) {
      const legacyName = value.slice("legacy:".length);
      setForm((current) => ({ ...current, warehouse: legacyName, shipTo: legacyName }));
      return;
    }
    const selected = coldStorages.find((item) => String(item.id) === value);
    setForm((current) => ({ ...current, warehouse: selected?.name || "", shipTo: warehouseShipTo(selected) }));
  }

  function updatePalletCalculation(field: "boxesPerPallet" | "palletsPerLoad", value: string) {
    setTotalBoxesManual(false);
    setInventoryForm((current) => {
      const next = { ...current, [field]: value };
      const calculated = (Number(next.boxesPerPallet) || 0) * (Number(next.palletsPerLoad) || 0);
      next.totalBoxes = calculated ? String(calculated) : "";
      return next;
    });
  }

  function inventoryAgeDays(lot: InventoryLot) {
    if (!lot.receivedDate) return 0;
    const received = new Date(`${lot.receivedDate}T00:00:00Z`).getTime();
    const today = new Date(`${localDateKey()}T00:00:00Z`).getTime();
    return Math.max(0, Math.floor((today - received) / 86400000));
  }

  function addInventoryAttachments(files: FileList | null) {
    const names = Array.from(files || []).map((file) => file.name).filter(Boolean);
    if (!names.length) return;
    setInventoryForm((current) => ({ ...current, attachments: Array.from(new Set([...current.attachments, ...names])) }));
  }

  function addCostAttachments(key: CostKey, files: FileList | null) {
    const names = Array.from(files || []).map((file) => file.name).filter(Boolean);
    if (!names.length) return;
    setInventoryForm((current) => ({ ...current, costAttachments: { ...current.costAttachments, [key]: Array.from(new Set([...(current.costAttachments[key] || []), ...names])) } }));
  }

  function moneyField(value: string | number | undefined, onChange: (value: string) => void, required = false, disabled = false) {
    return <span className="dollar-input"><span>$</span><input disabled={disabled} required={required} min="0" step="0.01" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></span>;
  }

  function moveToNextField(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || target.type === "submit") return;
    event.preventDefault();
    const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]):not([readonly]), select:not([disabled])"));
    const index = fields.indexOf(target);
    if (index >= 0 && index < fields.length - 1) {
      fields[index + 1].focus();
    }
  }

  async function updatePickupDate(row: Sale, pickupDate: string) {
    if (!row.id) return;
    if (pickupDate && pickupDate < localDateKey()) {
      window.alert("La fecha de pickup no puede ser anterior al día actual.");
      return;
    }
    const response = await fetch("/api/usa/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, pickupDate }) });
    const data = await response.json();
    if (response.ok && data.sale) {
      setSalesRows((current) => current.map((sale) => sale.id === row.id ? data.sale : sale));
    } else {
      window.alert(data.error || "No se pudo actualizar la fecha de pickup.");
    }
  }

  function replaceSale(updated: Sale) {
    setSalesRows((current) => current.map((sale) => sale.id === updated.id ? updated : sale));
  }

  function openStatusModal(row: Sale, type: "PAS" | "USDA REQUESTED") {
    setStatusModalSale(row);
    setStatusModalType(type);
    setPasDays("");
    setUsdaFile(null);
    setStatusSaveState("");
    setNotificationsOpen(false);
  }

  function closeStatusModal() {
    setStatusModalSale(null);
    setStatusModalType(null);
    setPasDays("");
    setUsdaFile(null);
    setStatusSaveState("");
  }

  async function changeLoadStatus(row: Sale, loadStatus: LoadStatus) {
    if (!row.id || row.invoiceNumber || loadStatus === row.loadStatus) return;
    if (loadStatus === "PAS" || loadStatus === "USDA REQUESTED") return openStatusModal(row, loadStatus);
    try {
      const response = await fetch("/api/usa/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, loadStatus }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cambiar el estatus.");
      replaceSale(data.sale);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo cambiar el estatus.");
    }
  }

  async function savePasStatus(event: FormEvent) {
    event.preventDefault();
    if (!statusModalSale?.id) return;
    const days = Number(pasDays);
    if (!Number.isInteger(days) || days <= 0 || days > 365) return setStatusSaveState("Indica de 1 a 365 días.");
    setStatusSaveState("Guardando plazo…");
    try {
      const response = await fetch("/api/usa/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: statusModalSale.id, loadStatus: "PAS", pasReviewDays: days, startDate: localDateKey() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el PAS.");
      replaceSale(data.sale);
      closeStatusModal();
    } catch (error) {
      setStatusSaveState(error instanceof Error ? error.message : "No se pudo guardar el PAS.");
    }
  }

  function selectUsdaFile(file?: File | null) {
    if (!file) return;
    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setUsdaFile(null);
      setStatusSaveState("La inspección debe ser PDF, JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUsdaFile(null);
      setStatusSaveState("La inspección no puede exceder 10 MB.");
      return;
    }
    setUsdaFile(file);
    setStatusSaveState("");
  }

  async function saveUsdaStatus(withoutFile: boolean) {
    if (!statusModalSale?.id) return;
    if (!withoutFile && !usdaFile) return setStatusSaveState("Selecciona la inspección o usa “Aún no la tengo”.");
    setStatusSaveState(withoutFile ? "Guardando como pendiente…" : "Adjuntando inspección…");
    try {
      const payload = new FormData();
      payload.set("saleId", String(statusModalSale.id));
      if (!withoutFile && usdaFile) payload.set("inspection", usdaFile);
      const response = await fetch("/api/usa/usda-inspections", { method: "POST", body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la inspección USDA.");
      replaceSale(data.sale);
      closeStatusModal();
    } catch (error) {
      setStatusSaveState(error instanceof Error ? error.message : "No se pudo guardar la inspección USDA.");
    }
  }

  function openInvoicing(sale?: Sale) {
    setInvoiceSale(sale ?? null);
    setSection("invoicing");
  }

  function openInvoicePreparation(sale: Sale) {
    const eligibilityMessage = invoiceEligibilityMessage(sale);
    if (eligibilityMessage) {
      setInvoiceSale(sale);
      setInvoiceSaveState(eligibilityMessage);
      setInvoiceStep("closed");
      return;
    }
    setInvoiceSale(sale);
    setPickedUp(null);
    setBolFile(null);
    setInvoiceItems(invoiceItemsFor(sale));
    setInvoiceSaveState("");
    setInvoiceStep("pickup");
    void loadProducts();
  }

  function closeInvoicePreparation() {
    setInvoiceStep("closed");
    setPickedUp(null);
    setBolFile(null);
    setInvoiceSaveState("");
  }

  function selectBolFile(file?: File | null) {
    if (!file) return;
    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setBolFile(null);
      setInvoiceSaveState("El BOL debe ser PDF, JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setBolFile(null);
      setInvoiceSaveState("El BOL no puede exceder 10 MB.");
      return;
    }
    setInvoiceSaveState("");
    setBolFile(file);
  }

  function updateInvoiceItem(index: number, changes: Partial<InvoiceItem>) {
    setInvoiceItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  function openProductDetail(sale: Sale, readOnly = false) {
    setProductDetailSale(sale);
    setProductDetailItems(invoiceItemsFor(sale));
    setProductDetailSaveState("");
    setProductDetailReadOnly(readOnly);
    void loadProducts();
  }

  function closeProductDetail() {
    setProductDetailSale(null);
    setProductDetailItems([]);
    setProductDetailSaveState("");
    setProductDetailReadOnly(false);
  }

  function updateProductDetailItem(index: number, changes: Partial<InvoiceItem>) {
    setProductDetailItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  async function saveProductDetail() {
    if (!productDetailSale?.id) return;
    if (productDetailSale.invoiceNumber) {
      setProductDetailSaveState("La venta ya fue facturada. Para modificarla, utiliza Crear ajuste desde la factura.");
      return;
    }
    if (productDetailItems.some((item) => item.quantity <= 0 || item.unitPrice < 0)) {
      setProductDetailSaveState("Revisa que los bultos/cajas sean mayores que cero y que los precios sean válidos.");
      return;
    }
    setProductDetailSaveState("Guardando cambios…");
    try {
      const response = await fetch("/api/usa/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: productDetailSale.id, items: productDetailItems }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la carga.");
      setSalesRows((current) => current.map((sale) => sale.id === data.sale.id ? data.sale : sale));
      closeProductDetail();
    } catch (error) {
      setProductDetailSaveState(error instanceof Error ? error.message : "No se pudo actualizar la carga.");
    }
  }

  async function issueInvoice(event: FormEvent) {
    event.preventDefault();
    if (!invoiceSale?.id || !bolFile) return setInvoiceSaveState("Adjunta el BOL para poder facturar.");
    const eligibilityMessage = invoiceEligibilityMessage(invoiceSale);
    if (eligibilityMessage) return setInvoiceSaveState(eligibilityMessage);
    if (!invoiceItems.length || invoiceItems.some((item) => !item.product.trim() || item.quantity <= 0 || item.unitPrice < 0)) return setInvoiceSaveState("Revisa las partidas, cantidades y precios.");
    setInvoiceSaveState("Generando factura…");
    try {
      const payload = new FormData();
      payload.set("saleId", String(invoiceSale.id));
      payload.set("bol", bolFile);
      payload.set("items", JSON.stringify(invoiceItems));
      const response = await fetch("/api/usa/invoices", { method: "POST", body: payload });
      const rawResponse = await response.text();
      let data: { sale?: Sale; error?: string } = {};
      try {
        data = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        throw new Error("El servidor no devolvió una respuesta válida. Revisa la conexión de archivos BOL en Vercel.");
      }
      if (!response.ok) throw new Error(data.error || "No se pudo generar la factura.");
      if (!data.sale) throw new Error("La factura se procesó, pero el servidor no devolvió la venta actualizada.");
      const updatedSale = data.sale;
      setSalesRows((current) => current.map((sale) => sale.id === updatedSale.id ? updatedSale : sale));
      setInvoiceSale(null);
      closeInvoicePreparation();
      openInvoicePreview(updatedSale);
    } catch (error) {
      setInvoiceSaveState(error instanceof Error ? error.message : "No se pudo generar la factura.");
    }
  }

  function openInvoicePreview(sale: Sale) {
    setSocPreview(null);
    setInvoicePreview(sale);
    void Promise.all([loadPartners(), loadColdStorages(), loadSettings()]);
  }

  function openInvoiceAdjustment(sale: Sale) {
    setAdjustmentPreview(null);
    setAdjustmentSale(sale);
    setAdjustmentItems(invoiceItemsFor(sale).map((item) => ({ ...item, noAdjustment: false })));
    setAdjustmentReason("CAMBIO DE PRECIO");
    setAdjustmentNotes("");
    setAdjustmentInternalNotes("");
    setAdjustmentSaveState("");
    void loadProducts();
  }

  function closeInvoiceAdjustment() {
    setAdjustmentSale(null);
    setAdjustmentItems([]);
    setAdjustmentNotes("");
    setAdjustmentInternalNotes("");
    setAdjustmentSaveState("");
  }

  async function saveInvoiceAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!adjustmentSale?.id) return;
    if (!adjustmentNotes.trim()) return setAdjustmentSaveState("Describe brevemente la razón del ajuste.");
    const originalItems = invoiceItemsFor(adjustmentSale);
    const adjustedItems = adjustedInvoiceItemsFromLines(originalItems, adjustmentItems);
    if (adjustmentItems.some((item, index) => !item.noAdjustment && (!item.product.trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > Number(originalItems[index]?.quantity || item.quantity) || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0))) return setAdjustmentSaveState("Revisa productos, bultos/cajas a ajustar y precio. La cantidad afectada no puede ser mayor que la factura original.");
    if (!adjustedItems.length) return setAdjustmentSaveState("No hay productos para ajustar.");
    setAdjustmentSaveState("Registrando ajuste…");
    try {
      const response = await fetch("/api/usa/invoice-adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId: adjustmentSale.id, reason: adjustmentReason, notes: adjustmentNotes, internalNotes: adjustmentInternalNotes, items: adjustedItems }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo registrar el ajuste.");
      replaceSale(data.sale);
      setInvoicePreview(data.sale);
      setAdjustmentPreview({ sale: data.sale, adjustment: data.adjustment });
      closeInvoiceAdjustment();
    } catch (error) {
      setAdjustmentSaveState(error instanceof Error ? error.message : "No se pudo registrar el ajuste.");
    }
  }

  function openSocPreview(sale: Sale) {
    setInvoicePreview(null);
    setSocPreview(sale);
    void Promise.all([loadPartners(), loadColdStorages(), loadSettings()]);
  }

  function openNewSale() {
    setEditingSale(null);
    setForm({ ...blankSale, saleDate: localDateKey() });
    setSaleLineItems([]);
    setSaveState("");
    setModalStep("choose");
    void loadCaptureCatalogs();
  }

  function openEditSale(sale: Sale) {
    if (!sale.id || sale.invoiceNumber) return;
    setEditingSale(sale);
    setSaleLineItems(invoiceItemsFor(sale).map((item) => ({ ...item, inventoryLotId: item.inventoryLotId ?? sale.inventoryLotId ?? undefined, purchasePrice: item.purchasePrice ?? sale.purchasePrice ?? 0 })));
    setForm({
      saleDate: sale.saleDate,
      operationType: sale.operationType,
      supplier: sale.supplier || "",
      inventoryLotId: sale.inventoryLotId == null ? "" : String(sale.inventoryLotId),
      customer: sale.customer,
      purchaseOrder: sale.purchaseOrder || "",
      warehouse: sale.warehouse,
      pickupNumber: sale.pickupNumber,
      boxes: String(sale.boxes),
      product: sale.product,
      presentation: sale.presentation || "",
      size: sale.size || "",
      label: sale.label || "",
      purchasePrice: sale.purchasePrice == null ? "" : String(sale.purchasePrice),
      salePrice: sale.salePrice == null ? "" : String(sale.salePrice),
      sellerName: sale.sellerName || "",
      shipDate: "",
      shipTo: sale.shipTo || "",
      pickupDate: sale.pickupDate || "",
    });
    setSaveState("");
    setModalStep("form");
    void loadCaptureCatalogs();
    if (sale.operationType === "IMPORTED_INVENTORY") void loadInventory(true);
  }

  function openProductForm(target: "sale" | "inventory" | "catalog", lineIndex: number | null = null, seed: Partial<typeof blankProduct> = {}) {
    setProductTarget(target);
    setProductTargetLine(lineIndex);
    setProductVariantBase(null);
    setProductForm({ ...blankProduct, ...seed, boxesPerPallet: seed.boxesPerPallet == null ? "" : String(seed.boxesPerPallet) });
    setProductSaveState("");
    setProductModal(true);
  }

  function openProductVariantForm(product: { name: string; alias: string }) {
    setProductTarget("catalog");
    setProductTargetLine(null);
    setProductVariantBase(product);
    setProductForm({ ...blankProduct, name: product.name, alias: product.alias });
    setProductSaveState("");
    setProductModal(true);
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    setProductSaveState("Guardando…");
    try {
      const response = await fetch("/api/usa/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(productForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el producto.");
      setProducts((current) => [...current, data.product].sort((a, b) => a.name.localeCompare(b.name)));
      if (productTarget === "sale") {
        if (form.operationType === "DIRECT_RESALE" && productTargetLine != null) setSaleLineItems((current) => current.map((item, index) => index === productTargetLine ? { ...item, product: data.product.name, presentation: data.product.presentation || "", size: data.product.size || "", label: data.product.label || "" } : item));
        else if (form.operationType === "DIRECT_RESALE") setSaleLineItems((current) => [...current, { product: data.product.name, presentation: data.product.presentation || "", size: data.product.size || "", label: data.product.label || "", quantity: "" as unknown as number, purchasePrice: "" as unknown as number, unitPrice: "" as unknown as number }]);
        else setForm((current) => ({ ...current, product: data.product.name, presentation: data.product.presentation || "", size: data.product.size || "", label: data.product.label || "" }));
      }
      if (productTarget === "inventory" && productTargetLine != null) {
        setInventoryItems((current) => current.map((item, index) => index === productTargetLine ? { ...item, product: data.product.name, presentation: data.product.presentation || "", size: data.product.size || "", label: data.product.label || "", boxesPerPallet: data.product.boxesPerPallet ? String(data.product.boxesPerPallet) : item.boxesPerPallet } : item));
      } else if (productTarget === "inventory") setInventoryForm((current) => ({ ...current, product: data.product.name, presentation: data.product.presentation || "", size: data.product.size || "", label: data.product.label || "", boxesPerPallet: data.product.boxesPerPallet ? String(data.product.boxesPerPallet) : current.boxesPerPallet }));
      if (productVariantBase) setExpandedCatalogProducts((current) => current.includes(data.product.name.trim().toLocaleLowerCase()) ? current : [...current, data.product.name.trim().toLocaleLowerCase()]);
      setProductModal(false);
      setProductTarget(null);
      setProductTargetLine(null);
      setProductVariantBase(null);
      setProductSaveState("");
    } catch (error) {
      setProductSaveState(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    }
  }

  function chooseProduct(value: string, target: "sale" | "inventory") {
    if (value === "__new__") return openProductForm(target);
    const product = products.find((item) => String(item.id) === value);
    if (!product) return;
    if (target === "sale") setForm((current) => ({ ...current, product: product.name, presentation: product.presentation || "", size: product.size || "", label: product.label || "" }));
    else setInventoryForm((current) => ({ ...current, product: product.name, presentation: product.presentation || "", size: product.size || "", label: product.label || "", boxesPerPallet: product.boxesPerPallet ? String(product.boxesPerPallet) : current.boxesPerPallet }));
  }

  function updateInventoryItem(index: number, changes: Partial<InventoryEntryItem>) {
    setInventoryItems((current) => {
      const next = current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item);
      return next;
    });
  }

  function removeInventoryItem(index: number) {
    setInventoryItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function chooseInventoryItemProduct(index: number, value: string) {
    if (value === "__new__") return openProductForm("inventory", index);
    const product = products.find((item) => item.name === value);
    if (!product) return updateInventoryItem(index, { product: "", presentation: "", size: "", label: "", boxesPerPallet: "" });
    updateInventoryItem(index, { product: product.name, presentation: "", size: "", label: "", boxesPerPallet: "" });
  }

  function inventoryItemCatalogValues(productName: string, field: "presentation" | "size" | "label") {
    return Array.from(new Set(products.filter((product) => product.name === productName).map((product) => product[field] || "").filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function updateInventoryItemVariant(index: number, field: "presentation" | "size" | "label", value: string) {
    const current = inventoryItems[index];
    if (!current) return;
    const next = { ...current, [field]: value };
    const matching = products.find((product) => product.name === next.product && (product.presentation || "") === next.presentation && (product.size || "") === next.size && (product.label || "") === next.label);
    updateInventoryItem(index, { [field]: value, boxesPerPallet: matching?.boxesPerPallet ? String(matching.boxesPerPallet) : next.boxesPerPallet });
  }

  function addInventoryItem() {
    setInventoryItems((current) => [...current, { ...blankInventoryItem }]);
  }

  function updateImportQuoteItem(index: number, changes: Partial<ImportQuoteItem>) {
    setImportQuoteItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  function updateImportQuoteNumber(index: number, field: ImportQuoteExpenseNumberField, value: string) {
    updateImportQuoteItem(index, { [field]: cleanQuoteNumberInput(value) } as Partial<ImportQuoteItem>);
  }

  function formatImportQuoteNumber(index: number, field: ImportQuoteExpenseNumberField) {
    setImportQuoteItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: importQuoteIntegerFields.has(field) ? formatQuoteIntegerInput(item[field]) : formatQuoteNumberInput(item[field]) } : item));
  }

  function quoteProductsFor(item: ImportQuoteItem) {
    return item.products?.length ? item.products : [{ product: item.product, weight: item.weight, weightUnit: item.weightUnit, pallets: item.pallets, boxes: item.boxes, boxesPerPallet: item.boxesPerPallet, purchasePriceMxn: item.purchasePriceMxn, marketPriceUsd: item.marketPriceUsd }];
  }

  function updateImportQuoteProduct(index: number, productIndex: number, changes: Partial<ImportQuoteProduct>) {
    setImportQuoteItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, products: quoteProductsFor(item).map((product, lineIndex) => lineIndex === productIndex ? { ...product, ...changes } : product) } : item));
  }

  function updateImportQuoteProductNumber(index: number, productIndex: number, field: ImportQuoteProductNumberField, value: string) {
    updateImportQuoteProduct(index, productIndex, { [field]: cleanQuoteNumberInput(value) } as Partial<ImportQuoteProduct>);
  }

  function formatImportQuoteProductNumber(index: number, productIndex: number, field: ImportQuoteProductNumberField) {
    setImportQuoteItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, products: quoteProductsFor(item).map((product, lineIndex) => lineIndex === productIndex ? { ...product, [field]: importQuoteIntegerFields.has(field) ? formatQuoteIntegerInput(product[field]) : formatQuoteNumberInput(product[field]) } : product) } : item));
  }

  function addImportQuoteProduct(index: number) {
    setImportQuoteItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, products: [...quoteProductsFor(item), { ...blankImportQuoteProduct }] } : item));
  }

  function removeImportQuoteProduct(index: number, productIndex: number) {
    setImportQuoteItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const products = quoteProductsFor(item);
      return products.length === 1 ? item : { ...item, products: products.filter((_, lineIndex) => lineIndex !== productIndex) };
    }));
  }

  function moveToNextQuoteField(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || target.type === "submit") return;
    event.preventDefault();
    const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]):not([readonly]), select:not([disabled])"));
    const index = fields.indexOf(target);
    if (index >= 0 && index < fields.length - 1) fields[index + 1].focus();
  }

  function addImportQuoteItem() {
    setImportQuoteItems((current) => [...current, { ...blankImportQuoteItem }]);
  }

  function removeImportQuoteItem(index: number) {
    setImportQuoteItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index));
  }

  function addSaleLineItem(productId?: string) {
    const product = products.find((item) => String(item.id) === productId);
    setSaleLineItems((current) => [...current, {
      product: product?.name || "",
      presentation: product?.presentation || "",
      size: product?.size || "",
      label: product?.label || "",
      quantity: "" as unknown as number,
      purchasePrice: "" as unknown as number,
      unitPrice: "" as unknown as number,
    }]);
  }

  function changeSaleLineProduct(index: number, productId: string) {
    if (productId === "__new__") return openProductForm("sale", index);
    const product = products.find((item) => item.name === productId);
    if (!product) return updateSaleLineItem(index, { product: "", presentation: "", size: "", label: "" });
    setSaleLineItems((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      product: product.name,
      presentation: "",
      size: "",
      label: "",
    } : item));
  }

  function saleLineCatalogValues(productName: string, field: "presentation" | "size" | "label") {
    return Array.from(new Set(products.filter((product) => product.name === productName).map((product) => product[field] || "").filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function changeSaleLineCatalogValue(index: number, field: "presentation" | "size" | "label", value: string) {
    const item = saleLineItems[index];
    if (!item) return;
    if (value === "__new__") {
      const catalogProduct = products.find((product) => product.name === item.product);
      return openProductForm("sale", index, {
        name: item.product,
        alias: catalogProduct?.alias || "",
        presentation: item.presentation,
        size: item.size,
        label: item.label,
      });
    }
    updateSaleLineItem(index, { [field]: value });
  }

  function updateSaleLineItem(index: number, changes: Partial<InvoiceItem>) {
    setSaleLineItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  }

  const customerCancellationReasons = ["Sin Razón", "Compró en otro lado", "Consiguió mejor precio", "No consiguió camión", "Canceló su cliente", "No le gustó la calidad"];
  const nwCancellationReasons = ["Producto no disponible", "Producto sin calidad", "Producto llegará tarde"];

  function openCancelSale(sale: Sale) {
    setCancelSale(sale);
    setCancelParty("CLIENTE CANCELÓ");
    setCancelReason("Sin Razón");
    setCancelSaveState("");
  }

  async function confirmCancelSale(event: FormEvent) {
    event.preventDefault();
    if (!cancelSale?.id) return;
    setCancelSaveState("Guardando cancelación…");
    try {
      const response = await fetch("/api/usa/sales", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cancelSale.id, cancelSale: true, canceledBy: cancelParty, cancellationReason: cancelReason }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cancelar la venta.");
      setSalesRows((current) => current.map((sale) => sale.id === data.sale.id ? data.sale : sale));
      setCancelSale(null);
    } catch (error) {
      setCancelSaveState(error instanceof Error ? error.message : "No se pudo cancelar la venta.");
    }
  }

  function chooseOperation(type: Operation) {
    setEditingSale(null);
    setForm({ ...blankSale, saleDate: localDateKey(), operationType: type });
    setSaleLineItems([]);
    setSaveState("");
    if (type === "IMPORTED_INVENTORY") void loadInventory();
    setModalStep("form");
  }

  function closeModal() {
    setModalStep("closed");
    setEditingSale(null);
    setSaleLineItems([]);
    setInventorySaleLots(null);
    setInventorySaleDraft([]);
    setInventorySaleWarning(null);
    setSaveState("");
  }

  function saleRowClass(row: Sale) {
    if (row.canceledAt) return "canceled-sale-row";
    if (row.loadStatus === "PAS") return "pas-attention-row";
    if (row.invoiceNumber) return "invoice-complete-row";
    if (row.pickupDate === localDateKey()) return "pickup-current-row";
    return "";
  }

  function editingInventoryQuantity(lotId: number) {
    if (editingSale?.operationType !== "IMPORTED_INVENTORY") return 0;
    const items = invoiceItemsFor(editingSale).filter((item) => Number(item.inventoryLotId) === lotId);
    if (items.length) return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return editingSale.inventoryLotId === lotId ? editingSale.boxes : 0;
  }

  function availableForSaleLot(lot: InventoryLot) {
    return lot.availableBoxes + editingInventoryQuantity(lot.id);
  }

  function openInventorySaleLoad(group: InventoryLoadGroup) {
    setInventorySaleWarning(null);
    setInventorySaleLots(group.lots);
    const existingItems = saleLineItems.length ? saleLineItems : editingSale?.operationType === "IMPORTED_INVENTORY" ? invoiceItemsFor(editingSale) : [];
    setInventorySaleDraft(group.lots
      .filter((lot) => availableForSaleLot(lot) > 0 || existingItems.some((item) => Number(item.inventoryLotId) === lot.id) || editingSale?.inventoryLotId === lot.id)
      .map((lot) => {
        const existingItem = existingItems.find((item) => Number(item.inventoryLotId) === lot.id) || (editingSale?.inventoryLotId === lot.id ? existingItems[0] : undefined);
        return { lot, boxes: existingItem?.quantity ? String(existingItem.quantity) : "", salePrice: existingItem?.unitPrice != null ? String(existingItem.unitPrice) : "" };
      }));
  }

  function updateInventorySaleDraft(lotId: number, changes: Partial<Omit<InventorySaleDraftItem, "lot">>) {
    setInventorySaleDraft((current) => current.map((item) => item.lot.id === lotId ? { ...item, ...changes } : item));
  }

  function closeInventorySaleLoad() {
    setInventorySaleLots(null);
    setInventorySaleDraft([]);
    setInventorySaleWarning(null);
  }

  function applyInventorySaleLoad(forceBelowCost = false) {
    const selectedItems = inventorySaleDraft
      .map((item) => ({ ...item, quantity: Number(item.boxes), unitPrice: Number(item.salePrice) }))
      .filter((item) => item.quantity > 0 || item.salePrice.trim());
    if (!selectedItems.length) return setInventorySaleWarning(null), setSaveState("Ingresa cajas a vender en al menos un producto de la factura.");
    const invalid = selectedItems.find((item) => !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > availableForSaleLot(item.lot) || !Number.isFinite(item.unitPrice) || item.unitPrice < 0);
    if (invalid) return setSaveState(`Revisa cajas disponibles y precio de venta de ${invalid.lot.product}.`);
    const belowCost = selectedItems.find((item) => item.lot.unitCost != null && item.unitPrice < item.lot.unitCost);
    if (belowCost?.lot.unitCost != null && !forceBelowCost) {
      setInventorySaleWarning({ lot: belowCost.lot, salePrice: belowCost.unitPrice, loss: belowCost.lot.unitCost - belowCost.unitPrice });
      return;
    }
    const nextItems: InvoiceItem[] = selectedItems.map((item) => ({
      inventoryLotId: item.lot.id,
      product: item.lot.product,
      presentation: item.lot.presentation || "",
      size: item.lot.size || "",
      label: item.lot.label || "",
      quantity: item.quantity,
      purchasePrice: item.lot.unitCost ?? 0,
      unitPrice: item.unitPrice,
    }));
    const first = nextItems[0];
    const firstLot = selectedItems[0].lot;
    const warehouse = firstLot.coldStorage || firstLot.warehouse;
    const warehouseAddress = coldStorages.find((item) => item.name === warehouse);
    setSaleLineItems(nextItems);
    setInventorySaleWarning(null);
    setForm((current) => ({
      ...current,
      inventoryLotId: first.inventoryLotId ? String(first.inventoryLotId) : "",
      supplier: firstLot.supplier ?? "",
      warehouse,
      pickupNumber: firstLot.pickupNumber ?? "",
      product: nextItems.length > 1 ? `${first.product} + ${nextItems.length - 1} partida(s)` : first.product,
      presentation: nextItems.length > 1 ? "" : first.presentation,
      size: nextItems.length > 1 ? "" : first.size,
      label: nextItems.length > 1 ? "" : first.label,
      purchasePrice: nextItems.length > 1 ? "" : String(first.purchasePrice ?? ""),
      salePrice: nextItems.length > 1 ? "" : String(first.unitPrice ?? ""),
      boxes: String(nextItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)),
      shipTo: current.shipTo || [warehouseAddress?.city, warehouseAddress?.stateCode].filter(Boolean).join(", "),
    }));
    setSaveState("");
    closeInventorySaleLoad();
  }

  const selectedLot = inventory.find((lot) => lot.id === Number(form.inventoryLotId));
  const selectedColdStorage = coldStorages.find((item) => item.name === inventoryForm.coldStorage);
  const registeredSaleWarehouses = Array.from(new Set(salesRows.map((row) => row.warehouse.trim()).filter(Boolean)))
    .filter((name) => !coldStorages.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const selectedSaleWarehouse = coldStorages.find((item) => item.name === form.warehouse);
  const inventoryLoadGroups = useMemo<InventoryLoadGroup[]>(() => {
    const groups = new Map<string, InventoryLot[]>();
    inventory.forEach((lot) => {
      const key = inventoryLoadKey(lot);
      groups.set(key, [...(groups.get(key) || []), lot]);
    });
    return Array.from(groups.entries()).map(([key, lots]) => {
      const sortedLots = lots.sort((a, b) => a.id - b.id);
      return {
        key,
        lots: sortedLots,
        first: sortedLots[0],
        totalBoxes: sortedLots.reduce((sum, lot) => sum + lot.totalBoxes, 0),
        availableBoxes: sortedLots.reduce((sum, lot) => sum + lot.availableBoxes, 0),
        allReceived: sortedLots.every((lot) => Boolean(lot.receivedConfirmedAt)),
      };
    });
  }, [inventory]);
  const documentSale = invoicePreview || socPreview;
  const documentItems = documentSale ? (invoicePreview ? originalInvoiceItemsFor(documentSale) : invoiceItemsFor(documentSale)) : [];
  const documentTotal = documentItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const documentCustomer = partners.find((item) => item.partnerType === "CUSTOMER" && item.name === documentSale?.customer);
  const documentWarehouse = coldStorages.find((item) => item.name === documentSale?.warehouse);
  function productAlias(name: string) {
    return products.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.alias || name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  }
  function productCell(sale: Sale, readOnly = false) {
    const items = invoiceItemsFor(sale);
    if (items.length <= 1) {
      const content = <><strong>{items[0]?.product || sale.product}</strong><small>{[items[0]?.presentation ?? sale.presentation, items[0]?.size ?? sale.size, items[0]?.label ?? sale.label].filter(Boolean).join(" · ") || "—"}</small></>;
      return sale.invoiceNumber || readOnly ? <button type="button" className="multi-product-button" onClick={() => openProductDetail(sale, readOnly)}>{content}</button> : content;
    }
    return <button type="button" className="multi-product-button" onClick={() => openProductDetail(sale, readOnly)}><strong>{items.map((item) => productAlias(item.product)).join(" / ")}</strong><small>{items.length} productos · Ver detalle</small></button>;
  }
  function adjustmentChanges(adjustment: InvoiceAdjustment) {
    const changes: string[] = [];
    const totalRows = Math.max(adjustment.previousItems.length, adjustment.adjustedItems.length);
    for (let index = 0; index < totalRows; index += 1) {
      const before = adjustment.previousItems[index];
      const after = adjustment.adjustedItems[index];
      if (before && !after) changes.push(`Producto eliminado: ${before.product} (${number.format(before.quantity)} bultos/cajas a ${money.format(before.unitPrice)})`);
      else if (!before && after) changes.push(`Producto agregado: ${after.product} (${number.format(after.quantity)} bultos/cajas a ${money.format(after.unitPrice)})`);
      else if (before && after) {
        if (before.product !== after.product) changes.push(`Producto: ${before.product} → ${after.product}`);
        if (before.quantity !== after.quantity) changes.push(`${after.product}: bultos/cajas ${number.format(before.quantity)} → ${number.format(after.quantity)}`);
        if (before.unitPrice !== after.unitPrice) changes.push(`${after.product}: precio ${money.format(before.unitPrice)} → ${money.format(after.unitPrice)}`);
      }
    }
    return changes.length ? changes : ["El ajuste no modificó productos, cantidades ni precios."];
  }
  function statusClass(value: string | null) {
    if (value === "OK") return "ok";
    if (value === "PAS" || value === "USDA REQUESTED") return "warning";
    return "adjusted";
  }
  function currentStatusValue(value: string | null): LoadStatus | string {
    return value && LOAD_STATUS_OPTIONS.includes(value as LoadStatus) ? value : value || "OK";
  }
  function toggleFilter(value: string, allValue: string, current: string[], update: (values: string[]) => void) {
    if (value === allValue) return update([allValue]);
    const withoutAll = current.filter((item) => item !== allValue);
    const next = withoutAll.includes(value) ? withoutAll.filter((item) => item !== value) : [...withoutAll, value];
    update(next.length ? next : [allValue]);
  }
  const overduePas = useMemo(() => {
    const today = localDateKey();
    return salesRows.filter((row) => !row.invoiceNumber && row.loadStatus === "PAS" && row.pasReviewDueDate && row.pasReviewDueDate <= today);
  }, [salesRows]);
  const filtered = useMemo(() => salesRows.filter((row) => {
    const text = `${row.customer} ${row.purchaseOrder ?? ""} ${row.pickupNumber} ${row.product} ${row.warehouse} ${row.invoiceNumber ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (statusFilters.includes("TODOS") || statusFilters.some((filter) => filter === "SIN FACTURA" ? !row.invoiceNumber && !row.canceledAt : filter === "CANCELADAS" ? Boolean(row.canceledAt) : row.loadStatus === filter && !row.canceledAt))
      && (operationFilters.includes("TODAS") || operationFilters.includes(row.operationType));
  }), [salesRows, query, statusFilters, operationFilters]);

  const productCatalogGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; alias: string; variants: Product[] }>();
    products.forEach((product) => {
      const key = product.name.trim().toLocaleLowerCase();
      const group = groups.get(key);
      if (group) group.variants.push(product);
      else groups.set(key, { key, name: product.name, alias: product.alias, variants: [product] });
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  function toggleCatalogProduct(key: string) {
    setExpandedCatalogProducts((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  const totals = useMemo(() => {
    const today = localDateKey();
    const currentMonth = today.slice(0, 7);
    const activeRows = salesRows.filter((row) => !row.canceledAt);
    const todayRows = activeRows.filter((row) => row.saleDate === today);
    const monthRows = activeRows.filter((row) => row.saleDate.startsWith(currentMonth));
    return {
      todaySales: todayRows.reduce((sum, row) => sum + (row.total ?? 0), 0),
      monthSales: monthRows.reduce((sum, row) => sum + (row.total ?? 0), 0),
      todayBoxes: todayRows.reduce((sum, row) => sum + row.boxes, 0),
      monthBoxes: monthRows.reduce((sum, row) => sum + row.boxes, 0),
      todayProfit: todayRows.reduce((sum, row) => sum + (row.profit ?? 0), 0),
      monthProfit: monthRows.reduce((sum, row) => sum + (row.profit ?? 0), 0),
      uninvoiced: activeRows.filter((row) => !row.invoiceNumber).reduce((sum, row) => sum + (row.total ?? 0), 0),
    };
  }, [salesRows]);

  const collectionData = useMemo(() => {
    const invoices = salesRows.filter((row) => Boolean(row.invoiceNumber) && !row.canceledAt);
    const pending = invoices.filter((row) => collectionStatus(row) !== "PAGADAS");
    const overdue = pending.filter((row) => collectionStatus(row) === "VENCIDAS");
    const queryValue = collectionQuery.trim().toLocaleLowerCase();
    const rows = invoices.filter((row) => {
      const matchesFilter = collectionFilter === "TODAS" || collectionStatus(row) === collectionFilter;
      const matchesCustomer = !collectionCustomer || row.customer === collectionCustomer;
      const matchesQuery = !queryValue || [row.customer, row.invoiceNumber, row.purchaseOrder, row.pickupNumber]
        .some((value) => String(value || "").toLocaleLowerCase().includes(queryValue));
      return matchesFilter && matchesCustomer && matchesQuery;
    }).sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"));
    return {
      rows,
      customers: Array.from(new Set(pending.map((row) => row.customer))).sort((a, b) => a.localeCompare(b)),
      total: pending.reduce((sum, row) => sum + (row.total ?? 0), 0),
      current: pending.filter((row) => collectionStatus(row) === "VIGENTES").reduce((sum, row) => sum + (row.total ?? 0), 0),
      overdue: overdue.reduce((sum, row) => sum + (row.total ?? 0), 0),
      over90: overdue.filter((row) => overdueDays(row.dueDate) > 90).reduce((sum, row) => sum + (row.total ?? 0), 0),
    };
  }, [salesRows, collectionFilter, collectionCustomer, collectionQuery]);

  const reportSearch = reportQuery.trim().toLocaleLowerCase();
  const matchesReportDate = (value: string | null | undefined) => {
    if (!value) return !reportFromDate && !reportToDate;
    return (!reportFromDate || value >= reportFromDate) && (!reportToDate || value <= reportToDate);
  };
  const saleBoxesFor = (sale: Sale) => {
    const items = invoiceItemsFor(sale);
    return items.length ? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : sale.boxes;
  };
  const saleTotalFor = (sale: Sale) => {
    const items = invoiceItemsFor(sale);
    return sale.total ?? items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  };
  const saleProfitFor = (sale: Sale) => {
    const items = invoiceItemsFor(sale);
    return sale.profit ?? items.reduce((sum, item) => sum + (Number(item.unitPrice || 0) - Number(item.purchasePrice ?? sale.purchasePrice ?? 0)) * Number(item.quantity || 0), 0);
  };
  const saleCostFor = (sale: Sale) => saleTotalFor(sale) - saleProfitFor(sale);
  const customerForSale = (sale: Sale) => partners.find((partner) => partner.partnerType === "CUSTOMER" && partner.name === sale.customer);
  const canonicalSellerName = (value: string | null | undefined) => normalizeSellerName(value, users);
  const sellerProfitAllocationsFor = (sale: Sale) => {
    const customer = customerForSale(sale);
    return calculateSellerProfitAllocations({
      saleProfit: saleProfitFor(sale),
      norwestProfitPercentage: Number(companyForm.norwestProfitPercentage || 16),
      assignedSeller: sale.sellerName || customer?.assignedSeller,
      assignedSellerPercentage: Number(customer?.profitPercentage || 0),
      sellers: users,
    });
  };
  const sellerProfitFor = (sale: Sale, sellerName?: string) => {
    const allocations = sellerProfitAllocationsFor(sale);
    if (sellerName) return allocations.find((allocation) => allocation.sellerName === canonicalSellerName(sellerName))?.amount ?? 0;
    return allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  };
  const reportSaleRows = useMemo(() => salesRows.filter((sale) => {
    if (sale.canceledAt || !matchesReportDate(sale.saleDate)) return false;
    if (!reportSearch) return true;
    const items = invoiceItemsFor(sale);
    const text = [
      sale.customer,
      canonicalSellerName(sale.sellerName),
      sale.invoiceNumber,
      sale.pickupNumber,
      sale.purchaseOrder,
      sale.warehouse,
      sale.supplier,
      sale.product,
      ...items.flatMap((item) => [item.product, item.presentation, item.size, item.label, productAlias(item.product)]),
    ].join(" ").toLocaleLowerCase();
    return text.includes(reportSearch);
  }), [reportSearch, reportFromDate, reportToDate, salesRows, products, users]);

  const reportInventoryRows = useMemo(() => inventoryLoadGroups.filter((group) => {
    const date = group.first.receivedDate || group.first.loadDate;
    if (!matchesReportDate(date)) return false;
    if (!reportSearch) return true;
    const text = [
      group.first.pickupNumber,
      group.first.supplier,
      group.first.warehouse,
      group.first.coldStorage,
      ...group.lots.flatMap((lot) => [lot.product, lot.presentation, lot.size, lot.label, productAlias(lot.product)]),
    ].join(" ").toLocaleLowerCase();
    return text.includes(reportSearch);
  }), [inventoryLoadGroups, products, reportFromDate, reportToDate, reportSearch]);

  const reportCollectionRows = useMemo(() => salesRows.filter((sale) => {
    if (!sale.invoiceNumber || sale.canceledAt || !matchesReportDate(sale.saleDate)) return false;
    if (!reportSearch) return true;
    const text = [sale.customer, sale.invoiceNumber, sale.pickupNumber, sale.purchaseOrder, sale.warehouse, sale.product].join(" ").toLocaleLowerCase();
    return text.includes(reportSearch);
  }).sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31")), [reportSearch, reportFromDate, reportToDate, salesRows]);

  const reportProfitRows = useMemo(() => reportSaleRows.map((sale) => ({
    sale,
    boxes: saleBoxesFor(sale),
    sales: saleTotalFor(sale),
    cost: saleCostFor(sale),
    profit: saleProfitFor(sale),
    sellerProfit: sellerProfitFor(sale),
  })).sort((a, b) => b.sale.saleDate.localeCompare(a.sale.saleDate)), [reportSaleRows, partners, users, companyForm.norwestProfitPercentage]);

  const inventoryLotById = useMemo(() => new Map(inventory.map((lot) => [lot.id, lot])), [inventory]);
  const importInvoiceForReportLine = (sale: Sale, item: InvoiceItem) => {
    const lot = item.inventoryLotId ? inventoryLotById.get(Number(item.inventoryLotId)) : sale.inventoryLotId ? inventoryLotById.get(sale.inventoryLotId) : undefined;
    if (lot?.pickupNumber) return lot.pickupNumber;
    return sale.operationType === "IMPORTED_INVENTORY" ? sale.pickupNumber || "S/R" : "N/A";
  };
  const reportLineRows = useMemo<SalesReportLine[]>(() => reportSaleRows.flatMap((sale) => {
    const items = invoiceItemsFor(sale);
    const saleTotal = saleTotalFor(sale);
    const adjustmentTotal = adjustmentsFor(sale).reduce((sum, adjustment) => sum + Number(adjustment.difference || 0), 0);
    return items.map((item) => {
      const boxes = Number(item.quantity || 0);
      const price = Number(item.unitPrice || 0);
      const total = boxes * price;
      const purchasePrice = Number(item.purchasePrice ?? sale.purchasePrice ?? 0);
      const profit = (price - purchasePrice) * boxes;
      const adjustmentShare = saleTotal ? adjustmentTotal * (total / saleTotal) : items.length ? adjustmentTotal / items.length : 0;
      return {
        sale,
        item,
        customer: sale.customer,
        seller: canonicalSellerName(sale.sellerName || customerForSale(sale)?.assignedSeller),
        product: productAlias(item.product),
        productDetail: invoiceItemDescription(item),
        importInvoice: importInvoiceForReportLine(sale, item),
        boxes,
        price,
        total,
        profit,
        adjustments: adjustmentShare,
        invoiceValue: total + adjustmentShare,
      };
    });
  }), [reportSaleRows, inventoryLotById, products, partners, users]);
  const reportSalesByCustomerRows = useMemo(() => groupSalesReportLines(reportLineRows, (row) => row.customer), [reportLineRows]);
  const reportSalesBySellerRows = useMemo(() => groupSalesReportLines(reportLineRows, (row) => row.seller), [reportLineRows]);
  const reportSalesByProductRows = useMemo(() => groupSalesReportLines(reportLineRows, (row) => row.product), [reportLineRows]);
  const reportSalesByImportInvoiceRows = useMemo(() => groupSalesReportLines(reportLineRows.filter((row) => row.importInvoice !== "N/A"), (row) => row.importInvoice), [reportLineRows]);

  const reportImportedLoadProfitRows = useMemo(() => {
    const lotsById = new Map(inventory.map((lot) => [lot.id, lot]));
    const groups = new Map<string, { key: string; loadReference: string; supplier: string; warehouse: string; productAliases: Set<string>; sales: Sale[]; boxes: number; saleTotal: number; cost: number; profit: number }>();
    reportSaleRows.filter((sale) => sale.operationType === "IMPORTED_INVENTORY").forEach((sale) => {
      const items = invoiceItemsFor(sale);
      const lot = items.map((item) => item.inventoryLotId ? lotsById.get(Number(item.inventoryLotId)) : undefined).find(Boolean) || (sale.inventoryLotId ? lotsById.get(sale.inventoryLotId) : undefined);
      const key = lot ? inventoryLoadKey(lot) : `sale:${sale.id ?? sale.pickupNumber}`;
      const current = groups.get(key) || { key, loadReference: lot?.pickupNumber || sale.pickupNumber || "S/R", supplier: lot?.supplier || sale.supplier || "N/A", warehouse: lot?.coldStorage || lot?.warehouse || sale.warehouse, productAliases: new Set<string>(), sales: [], boxes: 0, saleTotal: 0, cost: 0, profit: 0 };
      current.sales.push(sale);
      current.boxes += saleBoxesFor(sale);
      current.saleTotal += saleTotalFor(sale);
      current.cost += saleCostFor(sale);
      current.profit += saleProfitFor(sale);
      (items.length ? items : [{ product: sale.product } as InvoiceItem]).forEach((item) => current.productAliases.add(productAlias(item.product)));
      groups.set(key, current);
    });
    return Array.from(groups.values()).map((row) => ({ ...row, saleCount: row.sales.length, productLabel: Array.from(row.productAliases).join(" / "), profitPerBox: row.boxes ? row.profit / row.boxes : 0 })).sort((a, b) => b.profit - a.profit);
  }, [reportSaleRows, inventory, products]);

  const reportSellerProfitRows = useMemo(() => {
    const groups = new Map<string, { sellerName: string; sales: Sale[]; boxes: number; saleTotal: number; profit: number; sellerProfit: number; paid: number }>();
    const ensure = (sellerName: string) => {
      const key = canonicalSellerName(sellerName);
      const existing = groups.get(key);
      if (existing) return existing;
      const created = { sellerName: key, sales: [] as Sale[], boxes: 0, saleTotal: 0, profit: 0, sellerProfit: 0, paid: 0 };
      groups.set(key, created);
      return created;
    };
    users.filter((user) => user.active).forEach((user) => ensure(user.fullName));
    reportSaleRows.forEach((sale) => {
      sellerProfitAllocationsFor(sale).forEach((allocation) => {
        const row = ensure(allocation.sellerName);
        row.sales.push(sale);
        row.boxes += saleBoxesFor(sale);
        row.saleTotal += saleTotalFor(sale);
        row.profit += saleProfitFor(sale);
        row.sellerProfit += allocation.amount;
      });
    });
    sellerLiquidations.forEach((liquidation) => {
      ensure(canonicalSellerName(liquidation.sellerName)).paid += Number(liquidation.amount || 0);
    });
    return Array.from(groups.values())
      .map((row) => ({ ...row, balance: row.sellerProfit - row.paid, saleCount: row.sales.length }))
      .filter((row) => row.saleCount || row.paid || row.sellerName !== "Sin vendedor")
      .sort((a, b) => b.sellerProfit - a.sellerProfit);
  }, [reportSaleRows, partners, sellerLiquidations, users, companyForm.norwestProfitPercentage]);

  const sellerDetailSales = useMemo(() => sellerDetailName ? reportSaleRows.filter((sale) => sellerProfitAllocationsFor(sale).some((allocation) => allocation.sellerName === sellerDetailName && allocation.amount !== 0)) : [], [sellerDetailName, reportSaleRows, partners, users, companyForm.norwestProfitPercentage]);

  const reportAdjustmentRows = useMemo(() => salesRows.flatMap((sale) => adjustmentsFor(sale).map((adjustment) => ({ sale, adjustment }))).filter(({ sale, adjustment }) => {
    const adjustmentDate = adjustment.createdAt.slice(0, 10);
    if (!matchesReportDate(adjustmentDate)) return false;
    if (!reportSearch) return true;
    const text = [sale.customer, sale.invoiceNumber, sale.pickupNumber, sale.purchaseOrder, adjustment.number, adjustment.reason, adjustment.notes, adjustment.documentType].join(" ").toLocaleLowerCase();
    return text.includes(reportSearch);
  }).sort((a, b) => b.adjustment.createdAt.localeCompare(a.adjustment.createdAt)), [salesRows, reportSearch, reportFromDate, reportToDate]);

  const reportSummary = useMemo(() => {
    const pendingCollections = reportCollectionRows.filter((sale) => collectionStatus(sale) !== "PAGADAS");
    return {
      sales: reportSaleRows.reduce((sum, sale) => sum + saleTotalFor(sale), 0),
      boxes: reportSaleRows.reduce((sum, sale) => sum + saleBoxesFor(sale), 0),
      profit: reportSaleRows.reduce((sum, sale) => sum + saleProfitFor(sale), 0),
      receivable: pendingCollections.reduce((sum, sale) => sum + (sale.total ?? 0), 0),
    };
  }, [reportSaleRows, reportCollectionRows]);

  const administrationSellerRows = useMemo(() => {
    const rows = new Map<string, { sellerName: string; sales: Sale[]; boxes: number; saleTotal: number; profit: number; sellerProfit: number; paid: number }>();
    const ensure = (sellerName: string) => {
      const key = canonicalSellerName(sellerName);
      const existing = rows.get(key);
      if (existing) return existing;
      const created = { sellerName: key, sales: [] as Sale[], boxes: 0, saleTotal: 0, profit: 0, sellerProfit: 0, paid: 0 };
      rows.set(key, created);
      return created;
    };
    users.filter((user) => user.active).forEach((user) => ensure(user.fullName));
    salesRows.filter((sale) => !sale.canceledAt).forEach((sale) => {
      sellerProfitAllocationsFor(sale).forEach((allocation) => {
        const row = ensure(allocation.sellerName);
        row.sales.push(sale);
        row.boxes += saleBoxesFor(sale);
        row.saleTotal += saleTotalFor(sale);
        row.profit += saleProfitFor(sale);
        row.sellerProfit += allocation.amount;
      });
    });
    sellerLiquidations.forEach((liquidation) => {
      ensure(canonicalSellerName(liquidation.sellerName)).paid += Number(liquidation.amount || 0);
    });
    return Array.from(rows.values()).map((row) => ({ ...row, balance: row.sellerProfit - row.paid, saleCount: row.sales.length })).sort((a, b) => b.balance - a.balance);
  }, [salesRows, users, sellerLiquidations, partners, companyForm.norwestProfitPercentage]);

  const sellerOptions = useMemo(() => Array.from(new Set([...users.filter((user) => user.active).map((user) => user.fullName), canonicalSellerName("RR"), canonicalSellerName("GM"), ...salesRows.flatMap((sale) => sellerProfitAllocationsFor(sale).map((allocation) => allocation.sellerName)), ...sellerLiquidations.map((item) => canonicalSellerName(item.sellerName))])).sort((a, b) => a.localeCompare(b)), [users, salesRows, sellerLiquidations, partners, companyForm.norwestProfitPercentage]);
  const administrationTotals = useMemo(() => ({
    generated: administrationSellerRows.reduce((sum, row) => sum + row.sellerProfit, 0),
    paid: sellerLiquidations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    balance: administrationSellerRows.reduce((sum, row) => sum + row.balance, 0),
    sellers: administrationSellerRows.filter((row) => row.saleCount || row.paid).length,
  }), [administrationSellerRows, sellerLiquidations]);

  const statementRows = useMemo(() => {
    if (!statementCustomer) return [];
    const grouped = new Map<string, Sale>();
    salesRows
      .filter((row) => Boolean(row.invoiceNumber) && !row.canceledAt && row.customer === statementCustomer && collectionStatus(row) !== "PAGADAS")
      .forEach((row) => {
        const key = `${row.customer}::${row.invoiceNumber}`;
        const existing = grouped.get(key);
        grouped.set(key, existing ? { ...existing, total: (existing.total ?? 0) + (row.total ?? 0) } : { ...row });
      });
    return Array.from(grouped.values()).sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"));
  }, [salesRows, statementCustomer]);

  const inventoryItemsTotalBoxes = useMemo(() => inventoryItems.reduce((sum, item) => sum + (Number(item.totalBoxes) || 0), 0), [inventoryItems]);

  const inventoryCostSummary = useMemo(() => {
    const boxes = inventoryItemsTotalBoxes;
    const rate = Number(inventoryForm.exchangeRate) || 0;
    const usd = (value: string, currency: Currency) => currency === "MXN" ? (rate ? (Number(value) || 0) / rate : 0) : Number(value) || 0;
    const purchase = inventoryItems.reduce((sum, item) => sum + usd(item.purchasePrice, item.purchaseCurrency) * (Number(item.totalBoxes) || 0), 0);
    const fixed = (["freightCost", "mexicoCustomsCost", "usCustomsCost", "overweightCost", "redLightCost", "redLightUsCost", "coldStorageCost"] as CostKey[])
      .reduce((sum, key) => sum + usd(inventoryForm[key], costCurrencies[key]), 0);
    const extras = additionalExpenses.reduce((sum, item) => sum + usd(item.amount, item.currency), 0);
    const totalUsd = purchase + fixed + extras;
    const totalMxn = rate ? totalUsd * rate : 0;
    const fixedPerBox = boxes ? (fixed + extras) / boxes : 0;
    const itemCosts = inventoryItems.map((item, index) => {
      const unitUsd = usd(item.purchasePrice, item.purchaseCurrency) + fixedPerBox;
      return { key: `${item.product || "producto"}-${index}`, label: [item.product || `Producto ${index + 1}`, item.size, item.presentation, item.label].filter(Boolean).join(" · "), unitUsd, unitMxn: rate ? unitUsd * rate : 0 };
    });
    return { totalUsd, totalMxn, unitUsd: boxes ? totalUsd / boxes : 0, unitMxn: boxes ? totalMxn / boxes : 0, itemCosts };
  }, [inventoryForm, inventoryItems, inventoryItemsTotalBoxes, additionalExpenses, costCurrencies]);

  const importQuoteSummary = useMemo(() => {
    const rows = importQuoteItems.map((item, index) => {
      const products = quoteProductsFor(item).map((product, productIndex) => {
        const pallets = parseQuoteNumber(product.pallets);
        const boxesPerPallet = parseQuoteNumber(product.boxesPerPallet);
        const calculatedBoxes = pallets && boxesPerPallet ? pallets * boxesPerPallet : 0;
        const boxes = calculatedBoxes || parseQuoteNumber(product.boxes);
        return { key: `${product.product || "producto"}-${productIndex}`, product, pallets, boxesPerPallet, calculatedBoxes, boxes };
      });
      const pallets = products.reduce((sum, product) => sum + product.pallets, 0);
      const boxes = products.reduce((sum, product) => sum + product.boxes, 0);
      const rate = parseQuoteNumber(item.exchangeRate);
      const mxnToUsd = (value: string) => rate ? parseQuoteNumber(value) / rate : 0;
      const amountToUsd = (value: string, currency: Currency) => currency === "MXN" ? mxnToUsd(value) : parseQuoteNumber(value);
      const freightMxn = parseQuoteNumber(item.freightMxn);
      const importTotalUsd = mxnToUsd(String(freightMxn * 1.16)) + amountToUsd(item.mexicoCostsMxn, item.mexicoCostsCurrency) + amountToUsd(item.usCostsUsd, item.usCostsCurrency) + parseQuoteNumber(item.inspectionUsd) + (parseQuoteNumber(item.coldStorageUsd) * pallets) + amountToUsd(item.overweightMxn, item.overweightCurrency) + amountToUsd(item.otherCostsUsd, item.otherCostsCurrency);
      const importTotalMxn = rate ? importTotalUsd * rate : 0;
      const importCostBox = boxes ? importTotalUsd / boxes : 0;
      const importCostBoxMxn = boxes ? importTotalMxn / boxes : 0;
      const productRows = products.map((line) => {
        const purchaseUsd = mxnToUsd(line.product.purchasePriceMxn);
        const landedCost = purchaseUsd + importCostBox;
        const landedCostMxn = rate ? landedCost * rate : 0;
        const marketPrice = parseQuoteNumber(line.product.marketPriceUsd);
        const profitBox = marketPrice - landedCost;
        const profitBoxMxn = rate ? profitBox * rate : 0;
        const totalProfit = profitBox * line.boxes;
        const totalProfitMxn = rate ? totalProfit * rate : 0;
        return { ...line, purchaseUsd, landedCost, landedCostMxn, marketPrice, profitBox, profitBoxMxn, totalProfit, totalProfitMxn };
      });
      const landedCost = boxes ? productRows.reduce((sum, product) => sum + product.landedCost * product.boxes, 0) / boxes : 0;
      const landedCostMxn = rate ? landedCost * rate : 0;
      const profitBox = boxes ? productRows.reduce((sum, product) => sum + product.profitBox * product.boxes, 0) / boxes : 0;
      const profitBoxMxn = rate ? profitBox * rate : 0;
      const totalProfit = productRows.reduce((sum, product) => sum + product.totalProfit, 0);
      const totalProfitMxn = rate ? totalProfit * rate : 0;
      return { key: `carga-${index}`, item, products: productRows, pallets, boxes, importTotalUsd, importCostBox, importCostBoxMxn, landedCost, landedCostMxn, profitBox, profitBoxMxn, totalProfit, totalProfitMxn };
    });
    return {
      rows,
      boxes: rows.reduce((sum, row) => sum + row.boxes, 0),
      importTotalUsd: rows.reduce((sum, row) => sum + row.importTotalUsd, 0),
      totalProfit: rows.reduce((sum, row) => sum + row.totalProfit, 0),
    };
  }, [importQuoteItems]);

  const saleDraftSummary = useMemo(() => {
    const usesLineItems = form.operationType === "DIRECT_RESALE" || saleLineItems.length > 0;
    const total = usesLineItems
      ? saleLineItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0)
      : Number(form.boxes || 0) * Number(form.salePrice || 0);
    const profit = usesLineItems
      ? saleLineItems.reduce((sum, item) => sum + (Number(item.unitPrice || 0) - Number(item.purchasePrice || 0)) * Number(item.quantity || 0), 0)
      : (Number(form.salePrice || 0) - Number(form.purchasePrice || 0)) * Number(form.boxes || 0);
    const norwestPercentage = Math.min(100, Math.max(0, Number(companyForm.norwestProfitPercentage || 16)));
    const sellerProfit = Math.max(0, profit * ((100 - norwestPercentage) / 100));
    return { total, profit, sellerProfit };
  }, [form, saleLineItems, companyForm.norwestProfitPercentage]);

  const adjustmentOriginalItems = adjustmentSale ? invoiceItemsFor(adjustmentSale) : [];
  const adjustmentComputedItems = adjustedInvoiceItemsFromLines(adjustmentOriginalItems, adjustmentItems);
  const adjustmentOriginalTotal = adjustmentOriginalItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const adjustmentComputedTotal = adjustmentComputedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const reportRecordCount = reportTab === "sales" ? reportSaleRows.length
    : reportTab === "inventory" ? reportInventoryRows.length
      : reportTab === "collections" ? reportCollectionRows.length
        : reportTab === "profit" ? reportProfitRows.length
          : reportTab === "importProfit" ? reportImportedLoadProfitRows.length
            : reportTab === "sellerProfit" ? reportSellerProfitRows.length
              : reportTab === "salesByCustomer" ? reportSalesByCustomerRows.length
                : reportTab === "salesDetailCustomer" ? reportLineRows.length
                  : reportTab === "salesBySeller" ? reportSalesBySellerRows.length
                    : reportTab === "salesDetailSeller" ? reportLineRows.length
                      : reportTab === "salesByProduct" ? reportSalesByProductRows.length
                        : reportTab === "salesDetailProduct" ? reportLineRows.length
                          : reportTab === "salesByImportInvoice" ? reportSalesByImportInvoiceRows.length
                            : reportTab === "salesDetailImportInvoice" ? reportLineRows.filter((row) => row.importInvoice !== "N/A").length
                              : reportAdjustmentRows.length;
  const renderReportGroupPicker = (groups: SalesReportGroup[], label: string) => <div className="table-wrap report-table grouped-report-table"><table><thead><tr><th>{label}</th><th className="numeric">Ventas</th><th className="numeric">Cajas</th><th className="numeric">Precio prom.</th><th className="numeric">Venta total</th><th className="numeric">Ajustes</th><th className="numeric">Valor factura</th><th className="numeric">Utilidad</th></tr></thead><tbody>{groups.map((row) => <tr key={row.key} className={expandedReportGroup === row.key ? "selected-report-group" : ""}><td><button type="button" className="report-group-button" onClick={() => setExpandedReportGroup(expandedReportGroup === row.key ? null : row.key)}><strong>{row.key}</strong><small>{expandedReportGroup === row.key ? "Ocultar reporte" : "Ver reporte"}</small></button></td><td className="numeric">{number.format(row.sales.size)}</td><td className="numeric">{number.format(row.boxes)}</td><td className="numeric">{money.format(row.avgPrice)}</td><td className="numeric strong-number">{money.format(row.total)}</td><td className={`numeric ${row.adjustments < 0 ? "negative-number" : ""}`}>{money.format(row.adjustments)}</td><td className="numeric strong-number">{money.format(row.invoiceValue)}</td><td className={`numeric strong-number ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td></tr>)}</tbody></table></div>;
  const renderSalesSummaryReport = (groups: SalesReportGroup[], rows: SalesReportLine[], label: string, valueFor: (row: SalesReportLine) => string) => {
    const selectedRows = expandedReportGroup ? rows.filter((row) => valueFor(row) === expandedReportGroup) : [];
    const saleRows = Array.from(selectedRows.reduce((map, row) => {
      const key = saleReportKey(row.sale);
      const current = map.get(key) || { sale: row.sale, boxes: 0, total: 0, profit: 0, adjustments: 0, invoiceValue: 0 };
      current.boxes += row.boxes;
      current.total += row.total;
      current.profit += row.profit;
      current.adjustments += row.adjustments;
      current.invoiceValue += row.invoiceValue;
      map.set(key, current);
      return map;
    }, new Map<string, { sale: Sale; boxes: number; total: number; profit: number; adjustments: number; invoiceValue: number }>()).values());
    return <><section className="report-group-section"><div className="panel-heading compact-heading"><div><h2>Agrupado por {label.toLocaleLowerCase()}</h2><p>Selecciona una fila para desplegar el reporte.</p></div></div>{renderReportGroupPicker(groups, label)}</section>{expandedReportGroup && <section className="seller-detail-panel report-drilldown-panel"><div className="panel-heading"><div><h2>{expandedReportGroup}</h2><p>Ventas que integran este grupo.</p></div><button type="button" className="secondary-button" onClick={() => setExpandedReportGroup(null)}>Cerrar reporte</button></div><div className="table-wrap report-table"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Vendedor</th><th>Pickup #</th><th className="numeric">Cajas</th><th className="numeric">Precio prom.</th><th className="numeric">Venta total</th><th className="numeric">Ajustes</th><th className="numeric">Valor factura</th><th className="numeric">Utilidad</th></tr></thead><tbody>{saleRows.map((row) => <tr key={saleReportKey(row.sale)}><td>{formatDate(row.sale.saleDate)}</td><td>{row.sale.invoiceNumber || "Pendiente"}</td><td>{row.sale.customer}</td><td>{canonicalSellerName(row.sale.sellerName)}</td><td>{row.sale.pickupNumber || "N/A"}</td><td className="numeric">{number.format(row.boxes)}</td><td className="numeric">{money.format(row.boxes ? row.total / row.boxes : 0)}</td><td className="numeric strong-number">{money.format(row.total)}</td><td className={`numeric ${row.adjustments < 0 ? "negative-number" : ""}`}>{money.format(row.adjustments)}</td><td className="numeric strong-number">{money.format(row.invoiceValue)}</td><td className={`numeric strong-number ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td></tr>)}</tbody></table></div></section>}</>;
  };
  const renderSalesDetailReport = (groups: SalesReportGroup[], rows: SalesReportLine[], label: string, valueFor: (row: SalesReportLine) => string) => {
    const selectedRows = expandedReportGroup ? rows.filter((row) => valueFor(row) === expandedReportGroup) : [];
    return <><section className="report-group-section"><div className="panel-heading compact-heading"><div><h2>Agrupado por {label.toLocaleLowerCase()}</h2><p>Selecciona una fila para desplegar el detalle.</p></div></div>{renderReportGroupPicker(groups, label)}</section>{expandedReportGroup && <section className="seller-detail-panel report-drilldown-panel"><div className="panel-heading"><div><h2>{expandedReportGroup}</h2><p>Detalle de cada producto incluido en las ventas del grupo.</p></div><button type="button" className="secondary-button" onClick={() => setExpandedReportGroup(null)}>Cerrar reporte</button></div><div className="table-wrap report-table"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Vendedor</th><th>Pickup #</th><th>Producto</th><th>Factura importación</th><th className="numeric">Cajas</th><th className="numeric">Precio</th><th className="numeric">Ajuste</th><th className="numeric">Valor factura</th><th className="numeric">Utilidad</th></tr></thead><tbody>{selectedRows.map((row, index) => <tr key={`${saleReportKey(row.sale)}-${row.productDetail}-${index}`}><td>{formatDate(row.sale.saleDate)}</td><td>{row.sale.invoiceNumber || "Pendiente"}</td><td>{row.customer}</td><td>{row.seller}</td><td>{row.sale.pickupNumber || "N/A"}</td><td><strong>{row.product}</strong><small>{row.productDetail}</small></td><td>{row.importInvoice}</td><td className="numeric">{number.format(row.boxes)}</td><td className="numeric">{money.format(row.price)}</td><td className={`numeric ${row.adjustments < 0 ? "negative-number" : ""}`}>{money.format(row.adjustments)}</td><td className="numeric strong-number">{money.format(row.invoiceValue)}</td><td className={`numeric strong-number ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td></tr>)}</tbody></table></div></section>}</>;
  };

  async function saveSale(event: FormEvent) {
    event.preventDefault();
    if (form.pickupDate && form.pickupDate < localDateKey()) {
      setSaveState("La fecha de pickup no puede ser anterior al dia actual.");
      return;
    }
    if (form.operationType === "DIRECT_RESALE" && (!saleLineItems.length || saleLineItems.some((item) => !item.product || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.purchasePrice)) || Number(item.purchasePrice) < 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0))) {
      setSaveState("Agrega al menos un producto y revisa cajas, precio de compra y precio de venta.");
      return;
    }
    if (form.operationType === "IMPORTED_INVENTORY") {
      if (!saleLineItems.length || saleLineItems.some((item) => !item.inventoryLotId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) {
        setSaveState("Selecciona una factura y captura las cajas y precio de venta de cada producto.");
        return;
      }
      const belowCost = saleLineItems.find((item) => Number(item.unitPrice) < Number(item.purchasePrice ?? 0));
      if (belowCost) {
        setSaveState(`El precio de ${belowCost.product} esta por debajo del costo. Modifica el precio desde el detalle de la factura.`);
        return;
      }
    }
    const firstLine = saleLineItems[0];
    const lineBoxes = saleLineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    setSaveState("Guardando...");
    const payload = {
      saleDate: form.saleDate, operationType: form.operationType, supplier: form.supplier, inventoryLotId: firstLine?.inventoryLotId || (form.inventoryLotId ? Number(form.inventoryLotId) : null),
      customer: form.customer, sellerName: form.sellerName ? canonicalSellerName(form.sellerName) : null, purchaseOrder: form.purchaseOrder, warehouse: form.warehouse, pickupNumber: form.pickupNumber,
      boxes: lineBoxes || Number(form.boxes),
      product: firstLine?.product || form.product,
      presentation: firstLine?.presentation || form.presentation,
      size: firstLine?.size || form.size,
      label: firstLine?.label || form.label,
      purchasePrice: firstLine?.purchasePrice ?? (form.purchasePrice ? Number(form.purchasePrice) : null),
      salePrice: firstLine?.unitPrice ?? (form.salePrice ? Number(form.salePrice) : null),
      items: saleLineItems.length ? saleLineItems : undefined,
      shipDate: null, shipTo: form.shipTo, pickupDate: form.pickupDate || null,
      dueDate: form.pickupDate ? new Date(new Date(`${form.pickupDate}T00:00:00Z`).getTime() + 21 * 86400000).toISOString().slice(0, 10) : null,
      loadStatus: editingSale?.loadStatus || "OK", invoiceNumber: null,
    };
    try {
      const response = await fetch("/api/usa/sales", { method: editingSale ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingSale ? { ...payload, id: editingSale.id, editSale: true } : payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      setSalesRows((current) => editingSale ? current.map((sale) => sale.id === data.sale.id ? data.sale : sale) : [data.sale, ...current]);
      if (form.operationType === "IMPORTED_INVENTORY") await loadInventory();
      closeModal();
    } catch (error) {
      setSaveState(error instanceof Error ? error.message : "No se pudo guardar.");
    }
  }

  function costInput(label: string, key: CostKey) {
    return <div className="cost-field"><span className="cost-field-label">{label}</span><span className="money-entry money-entry-with-clip"><span className="dollar-input"><span>$</span><input min="0" step="0.01" type="number" value={inventoryForm[key]} onChange={(e) => setInventoryForm({ ...inventoryForm, [key]: e.target.value })} /></span><select aria-label={`Moneda de ${label}`} value={costCurrencies[key]} onChange={(e) => setCostCurrencies({ ...costCurrencies, [key]: e.target.value as Currency })}><option value="USD">USD</option><option value="MXN">MXN</option></select><label className="clip-upload" title={`Adjuntar documentos de ${label}`}><input type="file" multiple onChange={(event) => addCostAttachments(key, event.target.files)} /><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 12.8l5.9-5.9a3.1 3.1 0 014.4 4.4l-7.7 7.7a5 5 0 01-7.1-7.1l8.2-8.2a6.8 6.8 0 019.6 9.6l-8.2 8.2" /></svg></label></span>{Boolean(inventoryForm.costAttachments[key]?.length) && <small className="attachment-list">{inventoryForm.costAttachments[key].join(", ")}</small>}</div>;
  }

  return (
    <main className={`erp-shell ${reportPrintMode ? "report-print-mode" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><img className="sidebar-logo" src="/norwest-logo.jpg" alt="Norwest Produce" /></div>
        <nav>
          <button className={`nav-item ${section === "dashboard" ? "active" : ""}`} onClick={() => setSection("dashboard")}><span>▦</span> Inicio</button>
          <button className={`nav-item ${section === "inventory" ? "active" : ""}`} onClick={() => void openInventorySection()}><span>▤</span> Inventario importado</button>
          <button className={`nav-item ${section === "importQuote" ? "active" : ""}`} onClick={() => setSection("importQuote")}><span>$</span> Cotización para Importar</button>
          <button className={`nav-item ${section === "invoicing" ? "active" : ""}`} onClick={() => openInvoicing()}><span>□</span> Facturación</button><button className={`nav-item ${section === "collections" ? "active" : ""}`} onClick={() => { setSection("collections"); void loadPartners(); }}><span>◎</span> Cartera</button><button className={`nav-item ${section === "catalogs" ? "active" : ""}`} onClick={() => void openCatalogs()}><span>◇</span> Catálogos</button><button className={`nav-item ${section === "reports" ? "active" : ""}`} onClick={openReports}><span>⌁</span> Reportes</button><button className={`nav-item ${section === "administration" ? "active" : ""}`} onClick={openAdministration}><span>▣</span> Administración</button><button className={`nav-item ${section === "settings" ? "active" : ""}`} onClick={openSettings}><span>⚙</span> Configuración</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="operation-pill"><span>USA</span><div><strong>Norwest Produce LLC</strong><small>Operación activa</small></div></div>
          <Link href="/empresas">⇄ Cambiar empresa</Link>
          <button type="button" className="logout-button" onClick={() => void logout()}>Cerrar sesión</button>
        </div>
      </aside>

      {section === "dashboard" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Ventas y operaciones</h1></div><div className="topbar-actions notification-anchor"><button className={`icon-button ${overduePas.length ? "has-notifications" : ""}`} aria-label={`Notificaciones${overduePas.length ? `: ${overduePas.length} pendientes` : ""}`} onClick={() => setNotificationsOpen((current) => !current)}>♢{overduePas.length > 0 && <b>{overduePas.length}</b>}</button>{notificationsOpen && <div className="notifications-popover"><div><strong>Notificaciones</strong><button type="button" onClick={() => setNotificationsOpen(false)}>×</button></div>{overduePas.length ? overduePas.map((row) => <button type="button" key={row.id} onClick={() => openStatusModal(row, "PAS")}><span>Revisar PAS vencido</span><strong>{row.customer}</strong><small>Pickup #{row.pickupNumber} · venció {formatDate(row.pasReviewDueDate || null)}</small></button>) : <p>No hay revisiones pendientes.</p>}</div>}<button className="primary-button" onClick={openNewSale}>＋ Nueva venta</button></div></header>
        <section className="summary-grid">
          <article className="metric-card accent-green"><div className="metric-icon">$</div><p>Vendido hoy</p><strong>{money.format(totals.todaySales)}</strong><span>Acumulado del mes: <b>{money.format(totals.monthSales)}</b></span></article>
          <article className="metric-card accent-blue"><div className="metric-icon">□</div><p>Cajas vendidas hoy</p><strong>{number.format(totals.todayBoxes)}</strong><span>Acumulado del mes: <b>{number.format(totals.monthBoxes)}</b></span></article>
          <article className="metric-card accent-gold"><div className="metric-icon">!</div><p>Por facturar</p><strong>{money.format(totals.uninvoiced)}</strong><span>{salesRows.filter((row) => !row.invoiceNumber && !row.canceledAt).length} partidas sin factura</span></article>
          <article className="metric-card accent-earth"><div className="metric-icon">↗</div><p>Utilidad de hoy</p><strong>{money.format(totals.todayProfit)}</strong><span>Acumulado del mes: <b>{money.format(totals.monthProfit)}</b></span></article>
        </section>
        <section className="sales-panel">
          <div className="panel-heading"><div><h2>Registro de ventas</h2><p>Ventas registradas en la operación USA.</p></div><span className="record-count">{filtered.length} {filtered.length === 1 ? "partida" : "partidas"}</span></div>
          <div className="filters"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, PO#, PU#, producto o factura" /></label>
            <details className="filter-multiselect"><summary>{statusFilters.includes("TODOS") ? "TODOS LOS ESTATUS" : statusFilters.length === 1 ? statusFilters[0] : `${statusFilters.length} ESTATUS`}</summary><div className="filter-options">{["TODOS", ...LOAD_STATUS_OPTIONS, "SIN FACTURA", "CANCELADAS"].map((option) => <label key={option}><input type="checkbox" checked={statusFilters.includes(option)} onChange={() => toggleFilter(option, "TODOS", statusFilters, setStatusFilters)} /><span>{option === "TODOS" ? "Todos los estatus" : option}</span></label>)}</div></details>
            <details className="filter-multiselect"><summary>{operationFilters.includes("TODAS") ? "TODAS LAS OPERACIONES" : operationFilters.length === 1 ? (operationFilters[0] === "DIRECT_RESALE" ? "COMPRA Y REVENTA" : "INVENTARIO IMPORTADO") : `${operationFilters.length} OPERACIONES`}</summary><div className="filter-options">{[["TODAS", "Todas las operaciones"], ["DIRECT_RESALE", "Compra y reventa"], ["IMPORTED_INVENTORY", "Inventario importado"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={operationFilters.includes(value)} onChange={() => toggleFilter(value, "TODAS", operationFilters, setOperationFilters)} /><span>{label}</span></label>)}</div></details>
          </div>
          <div className="table-wrap"><table className="sales-table"><thead><tr><th>Fecha</th><th>Operación</th><th>Cliente</th><th>PO #</th><th>Pickup #</th><th>Bodega</th><th>Día de pickup</th><th>Producto</th><th className="numeric">Cajas</th><th className="numeric">Precio</th><th className="numeric">Total</th><th style={{width:"7rem"}}>STATUS</th><th>Factura</th><th>Edit</th></tr></thead>
            <tbody>{filtered.map((row, index) => { return <tr className={saleRowClass(row)} key={row.id ?? `${row.sourceRow}-${index}`}>
              <td className="date-cell">{formatDate(row.saleDate)}</td><td><span className={`operation-tag ${row.operationType === "IMPORTED_INVENTORY" ? "inventory" : "resale"}`}>{row.operationType === "IMPORTED_INVENTORY" ? "Inventario" : "Reventa"}</span></td>
              <td><strong>{row.customer}</strong></td><td>{row.purchaseOrder || "N/A"}</td><td><button type="button" className="pickup-number-button" onClick={() => openSocPreview(row)}>{row.pickupNumber}</button></td><td>{row.warehouse}</td><td className="date-cell"><input disabled={Boolean(row.canceledAt)} className="pickup-date-input" aria-label={`Cambiar día de pickup de ${row.customer}`} min={localDateKey()} type="date" value={row.pickupDate || ""} onChange={(e) => void updatePickupDate(row, e.target.value)} />{row.pickupDate === localDateKey() && <small>Pickup hoy</small>}</td>
              <td>{productCell(row)}</td><td className="numeric">{number.format(row.boxes)}</td>
              <td className="numeric">{invoiceItemsFor(row).length > 1 ? <button type="button" className="multi-price-button" onClick={() => openProductDetail(row)}>Varios</button> : row.invoiceNumber ? <button type="button" className="multi-price-button" onClick={() => openProductDetail(row)}>{money.format(invoiceItemsFor(row)[0]?.unitPrice ?? row.salePrice ?? 0)}</button> : row.salePrice == null ? <span className="pending-text">Pend.</span> : money.format(row.salePrice)}</td><td className="numeric strong-number">{row.total == null ? "—" : money.format(row.total)}</td>
              <td>{row.canceledAt ? <div className="cancellation-status"><strong>Cancelada</strong><small>{row.canceledBy} · {row.cancellationReason}</small></div> : <div className="sale-status-cell"><select disabled={Boolean(row.invoiceNumber)} title={row.invoiceNumber ? "El estatus queda bloqueado al facturar" : undefined} className={`status-select ${statusClass(row.loadStatus)}`} aria-label={`Cambiar estatus de ${row.customer}`} value={currentStatusValue(row.loadStatus)} onChange={(event) => void changeLoadStatus(row, event.target.value as LoadStatus)}>{row.loadStatus && !LOAD_STATUS_OPTIONS.includes(row.loadStatus as LoadStatus) && <option value={row.loadStatus} disabled>{row.loadStatus} · anterior</option>}{LOAD_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select>{row.loadStatus === "PAS" && <button type="button" disabled={Boolean(row.invoiceNumber)} className={`status-detail-button ${row.pasReviewDueDate && row.pasReviewDueDate <= localDateKey() ? "overdue" : ""}`} onClick={() => openStatusModal(row, "PAS")}>{row.pasReviewDueDate && row.pasReviewDueDate <= localDateKey() ? "Revisar PAS vencido" : `Revisar ${formatDate(row.pasReviewDueDate || null)}`}</button>}{row.loadStatus === "USDA REQUESTED" && (row.usdaInspectionStatus === "ATTACHED" && row.usdaInspectionFileName ? <a className="status-detail-button attached" href={`/api/usa/usda-inspections?saleId=${row.id}`} target="_blank" rel="noreferrer">Ver inspección</a> : <button type="button" className="status-detail-button overdue" onClick={() => openStatusModal(row, "USDA REQUESTED")}>Inspección pendiente</button>)}</div>}</td><td>{row.invoiceNumber ? <button type="button" className="invoice-number-button" onClick={() => openInvoicePreview(row)}><span className="invoice-chip invoice-ok">OK</span><small>{row.invoiceNumber}</small></button> : row.canceledAt ? <span className="muted">—</span> : <button type="button" className="invoice-button" title={invoiceEligibilityMessage(row) || "Facturar venta"} onClick={() => openInvoicing(row)}>Facturar</button>}</td><td><div className="row-actions">{!row.invoiceNumber && !row.canceledAt ? <><button type="button" className="edit-button" onClick={() => openEditSale(row)}>Edit</button><button type="button" className="delete-button" onClick={() => openCancelSale(row)}>Delete</button></> : <span className="muted">—</span>}</div></td>
            </tr>; })}</tbody></table></div>
        </section>
      </section>}

      {section === "catalogs" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Catálogos</h1></div></header>
        <section className="catalog-summary">
          <button className={`catalog-type-card ${partnerTypeFilter === "SUPPLIER" ? "active" : ""}`} onClick={() => setPartnerTypeFilter("SUPPLIER")}><span className="catalog-icon">⇄</span><div><strong>Proveedores</strong><small>{partners.filter((partner) => partner.partnerType === "SUPPLIER").length} registrados</small></div></button>
          <button className={`catalog-type-card ${partnerTypeFilter === "CUSTOMER" ? "active" : ""}`} onClick={() => setPartnerTypeFilter("CUSTOMER")}><span className="catalog-icon customer">◎</span><div><strong>Clientes</strong><small>{partners.filter((partner) => partner.partnerType === "CUSTOMER").length} registrados</small></div></button>
          <button className={`catalog-type-card ${partnerTypeFilter === "WAREHOUSE" ? "active" : ""}`} onClick={() => setPartnerTypeFilter("WAREHOUSE")}><span className="catalog-icon warehouse">▣</span><div><strong>Bodegas</strong><small>{coldStorages.length} registradas</small></div></button>
          <button className={`catalog-type-card ${partnerTypeFilter === "PRODUCT" ? "active" : ""}`} onClick={() => setPartnerTypeFilter("PRODUCT")}><span className="catalog-icon product">▦</span><div><strong>Productos</strong><small>{productCatalogGroups.length} registrados</small></div></button>
        </section>
        {partnerTypeFilter === "PRODUCT" ? <section className="sales-panel catalog-panel">
          <div className="panel-heading"><div><h2>Productos</h2><p>Productos, presentaciones, tamaños y etiquetas disponibles para ventas e inventario.</p></div><button className="primary-button" onClick={() => openProductForm("catalog")}>＋ Alta de producto</button></div>
          <div className="table-wrap catalog-table products-catalog-table"><table><thead><tr><th>Producto</th><th>Alias</th><th>Variantes registradas</th><th></th></tr></thead>
            <tbody>{productCatalogGroups.map((group) => {
              const expanded = expandedCatalogProducts.includes(group.key);
              const detailsId = `product-variants-${group.variants[0].id}`;
              return <Fragment key={group.key}>
                <tr className={`product-group-row ${expanded ? "expanded" : ""}`} onClick={() => toggleCatalogProduct(group.key)}>
                  <td><button type="button" className="product-expand-button" aria-expanded={expanded} aria-controls={detailsId}><span className="product-expand-chevron">›</span><strong>{group.name}</strong></button></td>
                  <td><span className="product-alias-chip">{group.alias}</span></td>
                  <td><button type="button" className="product-variant-count">{group.variants.length} {group.variants.length === 1 ? "variante" : "variantes"}<small>{expanded ? "Ocultar detalle" : "Ver detalle"}</small></button></td>
                  <td><button type="button" className="product-variant-add" onClick={(event) => { event.stopPropagation(); openProductVariantForm({ name: group.name, alias: group.alias }); }}>＋ Agregar variante</button></td>
                </tr>
                {expanded && <tr className="product-variants-row" id={detailsId}><td colSpan={4}><div className="product-variants-list">
                  <div className="product-variant-head"><span>Presentación</span><span>Tamaño</span><span>Etiqueta</span></div>
                  {group.variants.map((variant) => <div className="product-variant-item" key={variant.id}><span>{variant.presentation || "—"}</span><span>{variant.size || "—"}</span><span>{variant.label || "—"}</span></div>)}
                </div></td></tr>}
              </Fragment>;
            })}</tbody></table></div>
          {products.length === 0 && <div className="catalog-empty"><strong>Aún no hay productos registrados</strong><span>Usa “Alta de producto” o agrega uno desde una venta.</span></div>}
        </section> : partnerTypeFilter === "WAREHOUSE" ? <section className="sales-panel catalog-panel">
          <div className="panel-heading"><div><h2>Bodegas</h2><p>Catálogo de bodegas de destino de la operación USA</p></div><button className="primary-button" onClick={() => openColdStorageForm("catalog")}>＋ Alta de bodega</button></div>
          <div className="table-wrap catalog-table"><table><thead><tr><th>Nombre</th><th>Dirección</th><th>Teléfono</th><th></th></tr></thead>
            <tbody>{coldStorages.map((coldStorage) => <tr key={coldStorage.id}><td><strong>{coldStorage.name}</strong></td><td>{coldStorage.address}</td><td>{formatPhone(coldStorage.phone)}</td><td><button type="button" className="edit-button" onClick={() => openColdStorageForm("catalog", coldStorage)}>Edit</button></td></tr>)}</tbody></table></div>
          {coldStorages.length === 0 && <div className="catalog-empty"><strong>Aún no hay bodegas registradas</strong><span>Usa el botón de alta para crear el primer registro.</span></div>}
        </section> : <section className="sales-panel catalog-panel">
          <div className="panel-heading"><div><h2>{partnerTypeFilter === "SUPPLIER" ? "Proveedores" : "Clientes"}</h2><p>Catálogo exclusivo de la operación USA</p></div><button className="primary-button" onClick={() => void openPartnerForm(partnerTypeFilter)}>＋ Alta de {partnerTypeFilter === "SUPPLIER" ? "proveedor" : "cliente"}</button></div>
          <div className="table-wrap catalog-table"><table><thead><tr><th>Nombre</th><th>PACA #</th><th>TAX ID #</th><th>Blue Book #</th><th>DUNS & Bradstreet #</th><th>Direcci??n</th>{partnerTypeFilter === "CUSTOMER" && <th>Comprador</th>}<th>{partnerTypeFilter === "SUPPLIER" ? "Contacto para pagos" : "Contacto para cobros"}</th><th></th></tr></thead>
            <tbody>{partners.filter((partner) => partner.partnerType === partnerTypeFilter).map((partner) => <tr key={partner.id}><td><strong>{partner.name}</strong>{MEXICAN_STATES.some((s) => s.code === partner.stateCode) && <span style={{marginLeft:"0.4rem",fontSize:"0.65rem",fontWeight:700,background:"#16a34a",color:"#fff",borderRadius:"3px",padding:"1px 5px",verticalAlign:"middle",letterSpacing:"0.05em"}}>MX</span>}</td><td>{partner.pacaNumber || "Pendiente"}</td><td>{partner.taxId || "Pendiente"}</td><td>{partner.blueBookNumber || "Pendiente"}</td><td>{partner.dunsNumber || "Pendiente"}</td><td><strong>{[partner.street, partner.exteriorNumber && `#${partner.exteriorNumber}`, partner.interiorNumber && `Int. ${partner.interiorNumber}`].filter(Boolean).join(" ") || "Pendiente"}</strong><small>{partner.city}, {partner.stateCode} {partner.postalCode}</small></td>{partnerTypeFilter === "CUSTOMER" && <td><strong>{partner.buyerName || "Pendiente"}</strong><small>{partner.buyerEmail || ""}{partner.buyerOfficePhone ? ` ?? ${formatPhone(partner.buyerOfficePhone)}` : ""}</small></td>}<td><strong>{partner.contactName}</strong><small>{partner.contactEmail} ?? {formatPhone(partner.contactPhone)}</small></td><td><button type="button" className="edit-button" onClick={() => void editPartner(partner)}>Edit</button></td></tr>)}</tbody></table></div>
          {partners.filter((partner) => partner.partnerType === partnerTypeFilter).length === 0 && <div className="catalog-empty"><strong>Aún no hay {partnerTypeFilter === "SUPPLIER" ? "proveedores" : "clientes"} registrados</strong><span>Usa el botón de alta para crear el primer registro.</span></div>}
        </section>}
      </section>}

      {section === "inventory" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Inventario importado</h1></div><button className="primary-button" onClick={openInventoryEntry}>＋ Registrar entrada</button></header>
        <section className="sales-panel catalog-panel"><div className="panel-heading"><div><h2>Existencias por partida</h2><p>Aquí se da de alta el producto importado que entra a inventario.</p></div><span className="record-count">{inventoryLoadGroups.length} partidas</span></div>
          {inventoryLoading ? <div className="catalog-empty">Consultando inventario...</div> : <div className="table-wrap catalog-table"><table><thead><tr><th>Fecha de carga</th><th>Fecha de entrada</th><th>Producto</th><th>Proveedor</th><th>Factura #</th><th>Cold storage</th><th className="numeric">Cajas/pallet</th><th className="numeric">Bultos/cajas</th><th className="numeric">Disponibles</th><th className="numeric">Costo total de importación</th><th className="numeric">Costo real por caja</th><th></th></tr></thead><tbody>{inventoryLoadGroups.map((group) => { const lot = group.first; const aliases = Array.from(new Set(group.lots.map((item) => productAlias(item.product)))); const totalImportCost = group.lots.reduce((sum, item) => sum + (item.totalImportCost || 0), 0); const unitCost = group.totalBoxes ? totalImportCost / group.totalBoxes : lot.unitCost; return <tr key={group.key}><td>{formatDate(lot.loadDate || null)}</td><td>{formatDate(lot.receivedDate)}</td><td><button type="button" className="multi-product-button" onClick={() => setInventoryDetailLots(group.lots)}><strong>{aliases.join(" / ")}</strong><small>{group.lots.length > 1 ? `${group.lots.length} productos - Ver detalle` : [lot.product, lot.presentation, lot.size, lot.label].filter(Boolean).join(" - ") || "N/A"}</small></button></td><td>{lot.supplier || "N/A"}</td><td>{lot.pickupNumber || "N/A"}</td><td>{lot.coldStorage || lot.warehouse}</td><td className="numeric">{group.lots.length > 1 ? "Varios" : lot.boxesPerPallet == null ? "N/A" : number.format(lot.boxesPerPallet)}</td><td className="numeric">{number.format(group.totalBoxes)}</td><td className="numeric strong-number">{number.format(group.availableBoxes)}</td><td className="numeric dual-currency-cell">{totalImportCost ? <><strong>{money.format(totalImportCost)} USD</strong><small>{lot.exchangeRate ? `${moneyMxn.format(totalImportCost * lot.exchangeRate)} MXN` : "MXN pendiente"}</small></> : "N/A"}</td><td className="numeric dual-currency-cell">{unitCost == null ? "N/A" : <><strong>{money.format(unitCost)} USD</strong><small>{lot.exchangeRate ? `${moneyMxn.format(unitCost * lot.exchangeRate)} MXN` : "MXN pendiente"}</small></>}</td><td><div className="row-actions">{group.allReceived ? <span className="status-tag ok">Received</span> : <button type="button" className="edit-button" disabled={group.availableBoxes <= 0} title={group.availableBoxes <= 0 ? "Partida facturada por completo" : "Confirmar recepcion"} onClick={() => void receiveInventoryGroup(group.lots)}>Received</button>}<button type="button" className="edit-button" disabled={group.availableBoxes <= 0} title={group.availableBoxes <= 0 ? "Partida facturada por completo" : "Edit partida"} onClick={() => requestEditInventoryEntry(lot)}>Edit</button></div></td></tr>; })}</tbody></table></div>}
          {!inventoryLoading && inventory.length === 0 && <div className="catalog-empty"><strong>Aún no hay entradas de inventario</strong><span>Usa “Registrar entrada” para dar de alta el primer producto importado.</span></div>}
        </section>
      </section>}

      {section === "importQuote" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Cotización para Importar</h1></div></header>
        <section className="sales-panel import-quote-panel">
          <div className="panel-heading"><div><h2>Análisis de posible compra en México</h2><p>Consulta interna para estimar costo puesto en USA. No afecta inventario, ventas ni facturación.</p></div><span className="record-count">{importQuoteSummary.rows.reduce((sum, row) => sum + row.products.length, 0)} productos</span></div>
          <div className="import-quote-list">{importQuoteItems.map((item, index) => {
            const result = importQuoteSummary.rows[index];
            const quoteProducts = quoteProductsFor(item);
            return <article className="import-quote-card import-quote-sheet" key={index} onKeyDown={moveToNextQuoteField}>
              <div className="quote-sheet-toolbar"><strong>Carga {index + 1}</strong><button type="button" className="sale-line-remove" disabled={importQuoteItems.length === 1} aria-label="Eliminar cotización" onClick={() => removeImportQuoteItem(index)}>×</button></div>
              <div className="quote-sheet-body">
                <section className="quote-sheet-left">
                  <div className="quote-sheet-title">Datos del producto</div>
                  <div className="quote-product-items">{quoteProducts.map((product, productIndex) => {
                    const productOptionsId = `import-quote-products-${index}-${productIndex}`;
                    const productResult = result?.products[productIndex];
                    return <div className="quote-product-item" key={productIndex}>
                      <div className="quote-product-line">
                        <label className="quote-product-field"><span>Producto</span><input list={productOptionsId} value={product.product} onChange={(event) => updateImportQuoteProduct(index, productIndex, { product: event.target.value })} placeholder="Escribe o selecciona producto" /><datalist id={productOptionsId}>{productCatalogGroups.map((group) => <option key={group.key} value={group.name} />)}</datalist></label>
                        <label><span>Peso</span><div className="quote-weight-field"><input inputMode="decimal" value={product.weight} onBlur={() => formatImportQuoteProductNumber(index, productIndex, "weight")} onChange={(event) => updateImportQuoteProductNumber(index, productIndex, "weight", event.target.value)} placeholder="Ej. 50" /><select value={product.weightUnit} onChange={(event) => updateImportQuoteProduct(index, productIndex, { weightUnit: event.target.value as "KG" | "LBS" })}><option value="KG">KG</option><option value="LBS">LBS</option></select></div></label>
                        {productIndex === 0 ? <button className="primary-button quote-add-product-button" type="button" onClick={() => addImportQuoteProduct(index)}>＋ Agregar producto</button> : <button type="button" className="sale-line-remove quote-remove-product-button" aria-label="Eliminar producto de la carga" onClick={() => removeImportQuoteProduct(index, productIndex)}>×</button>}
                      </div>
                      <div className="quote-sheet-row"><span>Cajas/Bultos por pallet</span><input inputMode="decimal" value={product.boxesPerPallet} onBlur={() => formatImportQuoteProductNumber(index, productIndex, "boxesPerPallet")} onChange={(event) => updateImportQuoteProductNumber(index, productIndex, "boxesPerPallet", event.target.value)} /></div>
                      <div className="quote-sheet-row"><span>Pallets</span><input inputMode="decimal" value={product.pallets} onBlur={() => formatImportQuoteProductNumber(index, productIndex, "pallets")} onChange={(event) => updateImportQuoteProductNumber(index, productIndex, "pallets", event.target.value)} /></div>
                      <div className="quote-sheet-row quote-sheet-total-row"><span>Total cajas</span><input inputMode="decimal" readOnly={Boolean(productResult?.calculatedBoxes)} value={productResult?.calculatedBoxes ? quoteInteger.format(productResult.calculatedBoxes) : product.boxes} onBlur={() => formatImportQuoteProductNumber(index, productIndex, "boxes")} onChange={(event) => updateImportQuoteProductNumber(index, productIndex, "boxes", event.target.value)} /></div>
                      <div className="quote-sheet-subtitle">Costo x caja o bulto</div>
                      <div className="quote-sheet-row"><span>Compra MXN/caja o bulto</span><div className="quote-fixed-currency-field"><span className="dollar-input"><span>$</span><input inputMode="decimal" value={product.purchasePriceMxn} onBlur={() => formatImportQuoteProductNumber(index, productIndex, "purchasePriceMxn")} onChange={(event) => updateImportQuoteProductNumber(index, productIndex, "purchasePriceMxn", event.target.value)} /></span><b>MXN</b></div></div>
                      <div className="quote-sheet-row"><span>Precio de venta USD</span><div className="quote-fixed-currency-field"><span className="dollar-input"><span>$</span><input inputMode="decimal" value={product.marketPriceUsd} onBlur={() => formatImportQuoteProductNumber(index, productIndex, "marketPriceUsd")} onChange={(event) => updateImportQuoteProductNumber(index, productIndex, "marketPriceUsd", event.target.value)} /></span><b>USD</b></div></div>
                    </div>;
                  })}</div>
                  <div className="quote-sheet-row quote-sheet-total-row quote-load-total-row"><span>Total cajas carga</span><input readOnly value={quoteInteger.format(result?.boxes || 0)} /></div>
                </section>
                <section className="quote-sheet-right">
                  <div className="quote-sheet-title">Gastos</div>
                  <div className="quote-sheet-row"><span>Tipo de cambio</span><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.exchangeRate} onBlur={() => formatImportQuoteNumber(index, "exchangeRate")} onChange={(event) => updateImportQuoteNumber(index, "exchangeRate", event.target.value)} placeholder="MXN por USD" /></span></div>
                  <div className="quote-sheet-row quote-freight-row"><span>Flete + Transfer</span><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.freightMxn} onBlur={() => formatImportQuoteNumber(index, "freightMxn")} onChange={(event) => updateImportQuoteNumber(index, "freightMxn", event.target.value)} /></span><span>IVA</span><span className="dollar-input quote-calculated-money"><span>$</span><input readOnly value={quoteNumber.format(parseQuoteNumber(item.freightMxn) * 0.16)} /></span></div>
                  <div className="quote-sheet-row quote-sheet-total-row"><span>Total Flete</span><span className="dollar-input quote-calculated-money"><span>$</span><input readOnly value={quoteNumber.format(parseQuoteNumber(item.freightMxn) * 1.16)} /></span></div>
                  <div className="quote-sheet-row"><span>Gastos aduana MX</span><div className="quote-currency-field"><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.mexicoCostsMxn} onBlur={() => formatImportQuoteNumber(index, "mexicoCostsMxn")} onChange={(event) => updateImportQuoteNumber(index, "mexicoCostsMxn", event.target.value)} /></span><select value={item.mexicoCostsCurrency} onChange={(event) => updateImportQuoteItem(index, { mexicoCostsCurrency: event.target.value as Currency })}><option value="MXN">MXN</option><option value="USD">USD</option></select></div></div>
                  <div className="quote-sheet-row"><span>Gastos aduana USA</span><div className="quote-currency-field"><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.usCostsUsd} onBlur={() => formatImportQuoteNumber(index, "usCostsUsd")} onChange={(event) => updateImportQuoteNumber(index, "usCostsUsd", event.target.value)} /></span><select value={item.usCostsCurrency} onChange={(event) => updateImportQuoteItem(index, { usCostsCurrency: event.target.value as Currency })}><option value="MXN">MXN</option><option value="USD">USD</option></select></div></div>
                  <div className="quote-sheet-row"><span>Inspección USDA</span><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.inspectionUsd} onBlur={() => formatImportQuoteNumber(index, "inspectionUsd")} onChange={(event) => updateImportQuoteNumber(index, "inspectionUsd", event.target.value)} /></span></div>
                  <div className="quote-sheet-row"><span>Cold storage x pallet</span><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.coldStorageUsd} onBlur={() => formatImportQuoteNumber(index, "coldStorageUsd")} onChange={(event) => updateImportQuoteNumber(index, "coldStorageUsd", event.target.value)} /></span></div>
                  <div className="quote-sheet-row"><span>Sobrepeso</span><div className="quote-currency-field"><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.overweightMxn} onBlur={() => formatImportQuoteNumber(index, "overweightMxn")} onChange={(event) => updateImportQuoteNumber(index, "overweightMxn", event.target.value)} /></span><select value={item.overweightCurrency} onChange={(event) => updateImportQuoteItem(index, { overweightCurrency: event.target.value as Currency })}><option value="MXN">MXN</option><option value="USD">USD</option></select></div></div>
                  <div className="quote-sheet-row"><span>Otro</span><div className="quote-currency-field"><span className="dollar-input"><span>$</span><input inputMode="decimal" value={item.otherCostsUsd} onBlur={() => formatImportQuoteNumber(index, "otherCostsUsd")} onChange={(event) => updateImportQuoteNumber(index, "otherCostsUsd", event.target.value)} /></span><select value={item.otherCostsCurrency} onChange={(event) => updateImportQuoteItem(index, { otherCostsCurrency: event.target.value as Currency })}><option value="MXN">MXN</option><option value="USD">USD</option></select></div></div>
                  <div className="quote-sheet-row quote-sheet-calculated-row"><span>Gastos por caja MXN</span><input readOnly value={quoteNumber.format(result?.importCostBoxMxn || 0)} /></div>
                  <div className="quote-sheet-row quote-sheet-calculated-row"><span>Gastos por caja USD</span><input readOnly value={quoteNumber.format(result?.importCostBox || 0)} /></div>
                </section>
              </div>
              <div className="import-quote-result quote-sheet-results">
                <span><small>Costo puesto USA</small><strong>{money.format(result?.landedCost || 0)}</strong><b>{moneyMxn.format(result?.landedCostMxn || 0)}</b></span>
                <span className={(result?.profitBox || 0) >= 0 ? "positive" : "negative"}><small>Utilidad/caja</small><strong>{money.format(result?.profitBox || 0)}</strong><b>{moneyMxn.format(result?.profitBoxMxn || 0)}</b></span>
                <span className={(result?.totalProfit || 0) >= 0 ? "positive" : "negative"}><small>Utilidad total</small><strong>{money.format(result?.totalProfit || 0)}</strong><b>{moneyMxn.format(result?.totalProfitMxn || 0)}</b></span>
              </div>
            </article>;
          })}</div>
        </section>
      </section>}

      {section === "invoicing" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Facturación</h1></div></header>
        {invoiceSale && <section className="invoice-focus"><div><span>Venta seleccionada</span><h2>{invoiceSale.customer}</h2><p>Pickup #{invoiceSale.pickupNumber} · {number.format(invoiceSale.boxes)} cajas · {invoiceSale.total == null ? "Total pendiente" : money.format(invoiceSale.total)}</p>{invoiceEligibilityMessage(invoiceSale) && <small className="blocking-notice">{invoiceEligibilityMessage(invoiceSale)}</small>}</div><button type="button" className="secondary-button" onClick={() => setSection("dashboard")}>Volver a ventas</button></section>}
        <section className="sales-panel catalog-panel"><div className="panel-heading"><div><h2>Ventas pendientes de facturar</h2><p>Selecciona una venta desde el registro para preparar su factura.</p></div><span className="record-count">{salesRows.filter((row) => !row.invoiceNumber).length} pendientes</span></div>
          <div className="table-wrap catalog-table"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pickup #</th><th>Bodega</th><th>Producto</th><th className="numeric">Total</th><th></th></tr></thead><tbody>{salesRows.filter((row) => !row.invoiceNumber).map((row, index) => <tr className={invoiceSale?.id === row.id ? "selected-invoice-row" : ""} key={row.id ?? index}><td>{formatDate(row.saleDate)}</td><td><strong>{row.customer}</strong><small>PO# {row.purchaseOrder || "N/A"}</small></td><td>{row.pickupNumber}</td><td>{row.warehouse}</td><td>{row.product}</td><td className="numeric strong-number">{row.total == null ? "—" : money.format(row.total)}</td><td><button type="button" className="invoice-button" title={invoiceEligibilityMessage(row) || "Preparar factura"} onClick={() => openInvoicePreparation(row)}>Preparar factura</button></td></tr>)}</tbody></table></div>
        </section>
      </section>}

      {inventoryDetailLots && <div className="modal-backdrop modal-backdrop-elevated"><section className="sale-modal product-detail-modal">
        <div className="modal-heading"><div><p className="eyebrow">Inventario importado</p><h2>Detalle de la carga</h2><p className="modal-intro">Factura #{inventoryDetailLots[0]?.pickupNumber || "S/R"} · {inventoryDetailLots[0]?.coldStorage || inventoryDetailLots[0]?.warehouse}</p></div></div>
        <div className="product-detail-list">{inventoryDetailLots.map((lot) => <article key={lot.id}><span className="product-alias-chip">{productAlias(lot.product)}</span><div><strong>{lot.product}</strong><small>{[lot.size, lot.presentation, lot.label].filter(Boolean).join(" · ") || "Sin detalle"}</small></div><div className="inventory-detail-metrics"><span>Cajas: <strong>{number.format(lot.totalBoxes)}</strong></span><span>Disponibles: <strong>{number.format(lot.availableBoxes)}</strong></span><span>Costo/caja: <strong>{lot.unitCost == null ? "—" : money.format(lot.unitCost)}</strong></span></div></article>)}</div>
        <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setInventoryDetailLots(null)}>Cerrar</button></div>
      </section></div>}

      {adminInventoryLot && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal admin-auth-modal" onSubmit={authorizeInventoryEdit}>
        <div className="modal-heading"><div><p className="eyebrow">Autorización requerida</p><h2>Editar partida recibida</h2><p className="modal-intro">Esta carga ya está marcada como Received. Ingresa credenciales de administrador para abrir la edición.</p></div></div>
        <section className="form-section"><div className="form-grid"><label>Correo administrador<input required type="email" value={adminCredentials.email} onChange={(event) => setAdminCredentials((current) => ({ ...current, email: event.target.value }))} /></label><label>Contraseña<input required type="password" value={adminCredentials.password} onChange={(event) => setAdminCredentials((current) => ({ ...current, password: event.target.value }))} /></label></div></section>
        {adminAuthState && <p className="form-message">{adminAuthState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdminInventoryLot(null)}>Cancelar</button><button type="submit" className="primary-button">Autorizar</button></div>
      </form></div>}

      {section === "collections" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Cartera</h1></div></header>
        <section className="collections-review-note"><div><strong>Vista inicial para revisión</strong><span>Esta pantalla ya toma las facturas generadas por el sistema. Revisaremos el flujo de pagos y abonos antes de habilitar su captura.</span></div></section>
        <section className="summary-grid collections-summary">
          <article className="metric-card accent-green"><div className="metric-icon">$</div><p>Saldo por cobrar</p><strong>{money.format(collectionData.total)}</strong><span>Facturas pendientes de pago</span></article>
          <article className="metric-card accent-blue"><div className="metric-icon">○</div><p>Cartera vigente</p><strong>{money.format(collectionData.current)}</strong><span>Aún dentro del plazo de crédito</span></article>
          <article className="metric-card accent-gold"><div className="metric-icon">!</div><p>Cartera vencida</p><strong>{money.format(collectionData.overdue)}</strong><span>Saldo posterior a la fecha límite</span></article>
          <article className="metric-card accent-earth"><div className="metric-icon">90</div><p>Más de 90 días</p><strong>{money.format(collectionData.over90)}</strong><span>Saldo con mayor antigüedad</span></article>
        </section>
        <section className="sales-panel collections-panel">
          <div className="panel-heading"><div><h2>Cuentas por cobrar</h2><p>Facturas, vencimientos y antigüedad de saldos.</p></div><span className="record-count">{collectionData.rows.length} {collectionData.rows.length === 1 ? "factura" : "facturas"}</span></div>
          <div className="statement-customer-bar"><label><span>Cliente para Statement</span><select value={collectionCustomer} onChange={(event) => { setCollectionCustomer(event.target.value); setCollectionFilter(event.target.value ? "TODAS" : collectionFilter); }}><option value="">Todos los clientes</option>{collectionData.customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}</select></label><button type="button" className="primary-button" disabled={!collectionCustomer} onClick={() => setStatementCustomer(collectionCustomer)}>Generar Statement PDF</button></div>
          <div className="filters collections-filters"><label className="search-box"><span>⌕</span><input value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} placeholder="Buscar cliente, factura, PO# o pickup" /></label><div className="collection-filter-buttons">{(["TODAS", "VIGENTES", "VENCIDAS", "PAGADAS"] as CollectionFilter[]).map((filter) => <button type="button" className={collectionFilter === filter ? "active" : ""} key={filter} onClick={() => setCollectionFilter(filter)}>{filter === "TODAS" ? "Todas" : filter.charAt(0) + filter.slice(1).toLocaleLowerCase()}</button>)}</div></div>
          <div className="table-wrap collections-table"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Fecha</th><th>Vencimiento</th><th>Antigüedad</th><th>Estatus</th><th className="numeric">Saldo</th><th></th></tr></thead><tbody>{collectionData.rows.map((row) => { const status = collectionStatus(row); const days = overdueDays(row.dueDate); return <tr key={row.id}><td><strong>#{row.invoiceNumber}</strong><small>Pickup #{row.pickupNumber}</small></td><td><strong>{row.customer}</strong><small>PO# {row.purchaseOrder || "N/A"}</small></td><td>{formatDate(row.saleDate)}</td><td>{formatDate(row.dueDate)}</td><td><span className={`aging-chip ${days > 90 ? "critical" : days ? "overdue" : "current"}`}>{agingLabel(row)}</span></td><td><span className={`collection-status ${status.toLocaleLowerCase()}`}>{status === "PAGADAS" ? "Pagada" : status === "VENCIDAS" ? "Vencida" : "Vigente"}</span></td><td className="numeric strong-number">{money.format(status === "PAGADAS" ? 0 : row.total ?? 0)}</td><td><button type="button" className="edit-button" onClick={() => openInvoicePreview(row)}>Ver factura</button></td></tr>; })}</tbody></table></div>
          {collectionData.rows.length === 0 && <div className="catalog-empty"><strong>No hay facturas en esta vista</strong><span>Cambia el filtro o genera una factura para que aparezca en cartera.</span></div>}
        </section>
      </section>}

      {section === "administration" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Administración</h1></div></header>
        <section className="summary-grid administration-summary">
          <article className="metric-card accent-green"><div className="metric-icon">$</div><p>Utilidad vendedores</p><strong>{money.format(administrationTotals.generated)}</strong><span>{number.format(administrationTotals.sellers)} vendedores con movimiento</span></article>
          <article className="metric-card accent-blue"><div className="metric-icon">✓</div><p>Liquidado</p><strong>{money.format(administrationTotals.paid)}</strong><span>Pagos registrados a vendedores</span></article>
          <article className="metric-card accent-gold"><div className="metric-icon">!</div><p>Saldo por liquidar</p><strong>{money.format(administrationTotals.balance)}</strong><span>Utilidad pendiente de pago</span></article>
          <article className="metric-card accent-earth"><div className="metric-icon">◎</div><p>Ventas consideradas</p><strong>{number.format(salesRows.filter((sale) => !sale.canceledAt).length)}</strong><span>No incluye ventas canceladas</span></article>
        </section>
        <section className="administration-layout">
          <form className="sales-panel administration-card" onSubmit={saveSellerLiquidation}>
            <div className="panel-heading"><div><h2>Registrar liquidación</h2><p>Captura pagos hechos al vendedor para descontarlos de su saldo.</p></div></div>
            <div className="admin-form-grid">
              <label>Vendedor<select required value={sellerLiquidationForm.sellerName} onChange={(event) => setSellerLiquidationForm({ ...sellerLiquidationForm, sellerName: event.target.value })}><option value="">Selecciona vendedor</option>{sellerOptions.map((seller) => <option key={seller} value={seller}>{seller}</option>)}</select></label>
              <label>Fecha<input required type="date" value={sellerLiquidationForm.liquidationDate} onChange={(event) => setSellerLiquidationForm({ ...sellerLiquidationForm, liquidationDate: event.target.value })} /></label>
              <label>Monto liquidado<span className="dollar-input"><span>$</span><input required min="0.01" step="0.01" type="number" value={sellerLiquidationForm.amount} onChange={(event) => setSellerLiquidationForm({ ...sellerLiquidationForm, amount: event.target.value })} /></span></label>
              <label className="span-2">Nota<input value={sellerLiquidationForm.notes} onChange={(event) => setSellerLiquidationForm({ ...sellerLiquidationForm, notes: event.target.value })} placeholder="Referencia de pago, transferencia o comentario" /></label>
            </div>
            {sellerLiquidationState && <p className="form-message">{sellerLiquidationState}</p>}<div className="settings-actions"><button type="submit" className="primary-button">Guardar liquidación</button></div>
          </form>
          <section className="sales-panel administration-card">
            <div className="panel-heading"><div><h2>Saldo por vendedor</h2><p>Utilidad generada menos liquidaciones registradas.</p></div><span className="record-count">{administrationSellerRows.length} vendedores</span></div>
            <div className="table-wrap administration-table"><table><thead><tr><th>Vendedor</th><th className="numeric">Ventas</th><th className="numeric">Venta total</th><th className="numeric">Utilidad total</th><th className="numeric">Utilidad vendedor</th><th className="numeric">Liquidado</th><th className="numeric">Saldo</th></tr></thead><tbody>{administrationSellerRows.map((row) => <tr key={row.sellerName}><td><strong>{row.sellerName}</strong><small>{number.format(row.boxes)} cajas</small></td><td className="numeric">{number.format(row.saleCount)}</td><td className="numeric">{money.format(row.saleTotal)}</td><td className={`numeric ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td><td className="numeric strong-number">{money.format(row.sellerProfit)}</td><td className="numeric">{money.format(row.paid)}</td><td className={`numeric strong-number ${row.balance < 0 ? "negative-number" : ""}`}>{money.format(row.balance)}</td></tr>)}</tbody></table></div>
          </section>
        </section>
        <section className="sales-panel administration-history">
          <div className="panel-heading"><div><h2>Historial de liquidaciones</h2><p>Pagos registrados a vendedores.</p></div><span className="record-count">{sellerLiquidations.length} movimientos</span></div>
          <div className="table-wrap administration-table"><table><thead><tr><th>Fecha</th><th>Vendedor</th><th className="numeric">Monto</th><th>Nota</th><th>Registro</th></tr></thead><tbody>{sellerLiquidations.map((item) => <tr key={item.id}><td>{formatDate(item.liquidationDate)}</td><td><strong>{canonicalSellerName(item.sellerName)}</strong></td><td className="numeric strong-number">{money.format(item.amount)}</td><td>{item.notes || "Sin nota"}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleString("es-MX") : "N/A"}</td></tr>)}</tbody></table></div>
          {!sellerLiquidations.length && <div className="catalog-empty"><strong>Aun no hay liquidaciones registradas</strong><span>Cuando pagues utilidad a un vendedor, registrala desde el formulario superior.</span></div>}
        </section>
      </section>}

      {section === "reports" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Reportes</h1></div></header>
        <section className="summary-grid report-summary">
          <article className="metric-card accent-green"><div className="metric-icon">$</div><p>Ventas filtradas</p><strong>{money.format(reportSummary.sales)}</strong><span>{number.format(reportSaleRows.length)} operaciones</span></article>
          <article className="metric-card accent-blue"><div className="metric-icon">□</div><p>Cajas vendidas</p><strong>{number.format(reportSummary.boxes)}</strong><span>Segun ventas del periodo</span></article>
          <article className="metric-card accent-gold"><div className="metric-icon">↗</div><p>Utilidad</p><strong>{money.format(reportSummary.profit)}</strong><span>Utilidad estimada registrada</span></article>
          <article className="metric-card accent-earth"><div className="metric-icon">◎</div><p>Cartera</p><strong>{money.format(reportSummary.receivable)}</strong><span>Saldo pendiente en facturas filtradas</span></article>
        </section>
        <section className="sales-panel reports-panel reports-print-scope">
          <div className="panel-heading"><div><h2>Centro de reportes USA</h2><p>Consulta ventas, inventario, cartera, utilidad y ajustes sin modificar la operacion.</p></div><span className="record-count">{reportRecordCount} registros</span></div>
          <div className="filters report-filters">
            <label className="search-box"><span>⌕</span><input value={reportQuery} onChange={(event) => setReportQuery(event.target.value)} placeholder="Buscar cliente, factura, pickup, PO, producto o proveedor" /></label>
            <label className="report-date-field"><span>Desde</span><input type="date" value={reportFromDate} onChange={(event) => setReportFromDate(event.target.value)} /></label>
            <label className="report-date-field"><span>Hasta</span><input type="date" value={reportToDate} onChange={(event) => setReportToDate(event.target.value)} /></label>
            <button type="button" className="secondary-button report-reset-button" onClick={() => { setReportQuery(""); setReportFromDate(""); setReportToDate(""); }}>Limpiar</button>
          </div>
          <div className="report-selector-bar">
            <label>Reporte<select value={reportTab} onChange={(event) => { setReportTab(event.target.value as ReportTab); setExpandedReportGroup(null); setSellerDetailName(null); }}>{REPORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button type="button" className="primary-button report-print-button" onClick={printCurrentReport}>Imprimir en PDF</button>
          </div>

          {reportTab === "sales" && <div className="table-wrap report-table"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Operacion</th><th>PO #</th><th>Pickup #</th><th>Producto</th><th>Bodega</th><th className="numeric">Cajas</th><th className="numeric">Total</th><th className="numeric">Utilidad</th><th>Factura</th></tr></thead><tbody>{reportSaleRows.map((sale, index) => <tr key={sale.id ?? `${sale.pickupNumber}-${index}`}><td>{formatDate(sale.saleDate)}</td><td><strong>{sale.customer}</strong><small>{canonicalSellerName(sale.sellerName) || "Sin vendedor asignado"}</small></td><td><span className={`operation-tag ${sale.operationType === "IMPORTED_INVENTORY" ? "inventory" : "resale"}`}>{sale.operationType === "IMPORTED_INVENTORY" ? "Inventario" : "Reventa"}</span></td><td>{sale.purchaseOrder || "N/A"}</td><td>{sale.pickupNumber || "N/A"}</td><td>{productCell(sale, true)}</td><td>{sale.warehouse}</td><td className="numeric">{number.format(saleBoxesFor(sale))}</td><td className="numeric strong-number">{money.format(saleTotalFor(sale))}</td><td className="numeric strong-number">{money.format(saleProfitFor(sale))}</td><td>{sale.invoiceNumber ? <button type="button" className="invoice-number-button" onClick={() => openInvoicePreview(sale)}><span className="invoice-chip invoice-ok">OK</span><small>{sale.invoiceNumber}</small></button> : <span className="pending-text">Pendiente</span>}</td></tr>)}</tbody></table></div>}

          {reportTab === "inventory" && <div className="table-wrap report-table"><table><thead><tr><th>Fecha carga</th><th>Fecha entrada</th><th>Factura #</th><th>Proveedor</th><th>Producto</th><th>Bodega</th><th className="numeric">Cajas</th><th className="numeric">Disponibles</th><th className="numeric">Costo total</th><th className="numeric">Costo/caja</th><th>Estado</th></tr></thead><tbody>{reportInventoryRows.map((group) => { const lot = group.first; const aliases = Array.from(new Set(group.lots.map((item) => productAlias(item.product)))); const totalImportCost = group.lots.reduce((sum, item) => sum + (item.totalImportCost || 0), 0); const unitCost = group.totalBoxes ? totalImportCost / group.totalBoxes : lot.unitCost; return <tr key={group.key}><td>{formatDate(lot.loadDate || null)}</td><td>{formatDate(lot.receivedDate)}</td><td><strong>{lot.pickupNumber || "N/A"}</strong></td><td>{lot.supplier || "N/A"}</td><td><button type="button" className="multi-product-button" onClick={() => setInventoryDetailLots(group.lots)}><strong>{aliases.join(" / ")}</strong><small>{group.lots.length > 1 ? `${group.lots.length} productos - Ver detalle` : [lot.product, lot.size, lot.presentation, lot.label].filter(Boolean).join(" - ") || "N/A"}</small></button></td><td>{lot.coldStorage || lot.warehouse}</td><td className="numeric">{number.format(group.totalBoxes)}</td><td className="numeric strong-number">{number.format(group.availableBoxes)}</td><td className="numeric strong-number">{money.format(totalImportCost)}</td><td className="numeric">{unitCost == null ? "N/A" : money.format(unitCost)}</td><td>{group.allReceived ? <span className="status-tag ok">Received</span> : <span className="status-tag warning">En transito</span>}</td></tr>; })}</tbody></table></div>}

          {reportTab === "collections" && <div className="table-wrap report-table"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Fecha</th><th>Vencimiento</th><th>Antiguedad</th><th>PO / Pickup</th><th>Estatus</th><th className="numeric">Saldo</th><th></th></tr></thead><tbody>{reportCollectionRows.map((sale) => { const status = collectionStatus(sale); const days = overdueDays(sale.dueDate); return <tr key={sale.id}><td><strong>#{sale.invoiceNumber}</strong></td><td>{sale.customer}</td><td>{formatDate(sale.saleDate)}</td><td>{formatDate(sale.dueDate)}</td><td><span className={`aging-chip ${days > 90 ? "critical" : days ? "overdue" : "current"}`}>{agingLabel(sale)}</span></td><td><strong>{sale.purchaseOrder || "N/A"}</strong><small>Pickup #{sale.pickupNumber}</small></td><td><span className={`collection-status ${status.toLocaleLowerCase()}`}>{status === "PAGADAS" ? "Pagada" : status === "VENCIDAS" ? "Vencida" : "Vigente"}</span></td><td className="numeric strong-number">{money.format(status === "PAGADAS" ? 0 : sale.total ?? 0)}</td><td><button type="button" className="edit-button" onClick={() => openInvoicePreview(sale)}>Ver factura</button></td></tr>; })}</tbody></table></div>}

          {reportTab === "profit" && <div className="table-wrap report-table"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Pickup #</th><th>Producto</th><th className="numeric">Cajas</th><th className="numeric">Venta</th><th className="numeric">Costo</th><th className="numeric">Utilidad</th><th className="numeric">Utilidad/caja</th><th className="numeric">Utilidad vendedores</th></tr></thead><tbody>{reportProfitRows.map((row, index) => <tr key={row.sale.id ?? `${row.sale.pickupNumber}-${index}`}><td>{formatDate(row.sale.saleDate)}</td><td>{row.sale.invoiceNumber ? <button type="button" className="invoice-number-button" onClick={() => openInvoicePreview(row.sale)}><span className="invoice-chip invoice-ok">OK</span><small>{row.sale.invoiceNumber}</small></button> : <span className="pending-text">Pendiente</span>}</td><td><strong>{row.sale.customer}</strong><small>{canonicalSellerName(row.sale.sellerName)}</small></td><td>{row.sale.pickupNumber || "N/A"}</td><td>{productCell(row.sale, true)}</td><td className="numeric">{number.format(row.boxes)}</td><td className="numeric strong-number">{money.format(row.sales)}</td><td className="numeric">{money.format(row.cost)}</td><td className={`numeric strong-number ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td><td className={`numeric ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.boxes ? row.profit / row.boxes : 0)}</td><td className="numeric">{money.format(row.sellerProfit)}</td></tr>)}</tbody></table></div>}

          {reportTab === "importProfit" && <div className="table-wrap report-table"><table><thead><tr><th>Factura carga</th><th>Proveedor</th><th>Bodega</th><th>Productos</th><th className="numeric">Ventas</th><th className="numeric">Cajas vendidas</th><th className="numeric">Venta total</th><th className="numeric">Costo</th><th className="numeric">Utilidad</th><th className="numeric">Utilidad/caja</th></tr></thead><tbody>{reportImportedLoadProfitRows.map((row) => <tr key={row.key}><td><button type="button" className="invoice-number-button" onClick={() => setImportLoadDetail({ loadReference: row.loadReference, sales: row.sales })}><strong>{row.loadReference}</strong></button></td><td>{row.supplier}</td><td>{row.warehouse}</td><td>{row.productLabel || "N/A"}</td><td className="numeric">{number.format(row.saleCount)}</td><td className="numeric">{number.format(row.boxes)}</td><td className="numeric strong-number">{money.format(row.saleTotal)}</td><td className="numeric">{money.format(row.cost)}</td><td className={`numeric strong-number ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td><td className={`numeric ${row.profitPerBox < 0 ? "negative-number" : ""}`}>{money.format(row.profitPerBox)}</td></tr>)}</tbody></table></div>}

          {reportTab === "sellerProfit" && <><div className="table-wrap report-table"><table><thead><tr><th>Vendedor</th><th className="numeric">Ventas</th><th className="numeric">Cajas</th><th className="numeric">Venta total</th><th className="numeric">Utilidad total</th><th className="numeric">Utilidad vendedor</th><th className="numeric">Liquidado</th><th className="numeric">Saldo</th></tr></thead><tbody>{reportSellerProfitRows.map((row) => <tr key={row.sellerName}><td><strong>{row.sellerName}</strong></td><td className="numeric">{number.format(row.saleCount)}</td><td className="numeric">{number.format(row.boxes)}</td><td className="numeric strong-number">{money.format(row.saleTotal)}</td><td className={`numeric strong-number ${row.profit < 0 ? "negative-number" : ""}`}>{money.format(row.profit)}</td><td className="numeric"><button type="button" className="report-money-button" onClick={() => setSellerDetailName(sellerDetailName === row.sellerName ? null : row.sellerName)}>{money.format(row.sellerProfit)}</button></td><td className="numeric">{money.format(row.paid)}</td><td className={`numeric strong-number ${row.balance < 0 ? "negative-number" : ""}`}>{money.format(row.balance)}</td></tr>)}</tbody></table></div>{sellerDetailName && <section className="seller-detail-panel"><div className="panel-heading"><div><h2>Detalle de utilidad de {sellerDetailName}</h2><p>Ventas que integran el monto acumulado del vendedor.</p></div><button type="button" className="secondary-button" onClick={() => setSellerDetailName(null)}>Cerrar detalle</button></div><div className="table-wrap report-table"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Pickup #</th><th>Producto</th><th className="numeric">Venta</th><th className="numeric">Utilidad</th><th className="numeric">Utilidad vendedor</th></tr></thead><tbody>{sellerDetailSales.map((sale, index) => <tr key={sale.id ?? `${sale.pickupNumber}-${index}`}><td>{formatDate(sale.saleDate)}</td><td>{sale.invoiceNumber || "Pendiente"}</td><td>{sale.customer}</td><td>{sale.pickupNumber}</td><td>{productCell(sale, true)}</td><td className="numeric strong-number">{money.format(saleTotalFor(sale))}</td><td className={`numeric ${saleProfitFor(sale) < 0 ? "negative-number" : ""}`}>{money.format(saleProfitFor(sale))}</td><td className="numeric strong-number">{money.format(sellerProfitFor(sale, sellerDetailName))}</td></tr>)}</tbody></table></div></section>}</>}

          {reportTab === "salesByCustomer" && renderSalesSummaryReport(reportSalesByCustomerRows, reportLineRows, "Cliente", (row) => row.customer)}
          {reportTab === "salesDetailCustomer" && renderSalesDetailReport(reportSalesByCustomerRows, reportLineRows, "Cliente", (row) => row.customer)}
          {reportTab === "salesBySeller" && renderSalesSummaryReport(reportSalesBySellerRows, reportLineRows, "Vendedor", (row) => row.seller)}
          {reportTab === "salesDetailSeller" && renderSalesDetailReport(reportSalesBySellerRows, reportLineRows, "Vendedor", (row) => row.seller)}
          {reportTab === "salesByProduct" && renderSalesSummaryReport(reportSalesByProductRows, reportLineRows, "Producto", (row) => row.product)}
          {reportTab === "salesDetailProduct" && renderSalesDetailReport(reportSalesByProductRows, reportLineRows, "Producto", (row) => row.product)}
          {reportTab === "salesByImportInvoice" && renderSalesSummaryReport(reportSalesByImportInvoiceRows, reportLineRows.filter((row) => row.importInvoice !== "N/A"), "Factura de importación", (row) => row.importInvoice)}
          {reportTab === "salesDetailImportInvoice" && renderSalesDetailReport(reportSalesByImportInvoiceRows, reportLineRows.filter((row) => row.importInvoice !== "N/A"), "Factura de importación", (row) => row.importInvoice)}

          {reportTab === "adjustments" && <div className="table-wrap report-table"><table><thead><tr><th>Fecha</th><th>Ajuste</th><th>Factura</th><th>Cliente</th><th>Motivo</th><th>Tipo</th><th className="numeric">Diferencia</th><th>Notas</th><th></th></tr></thead><tbody>{reportAdjustmentRows.map(({ sale, adjustment }) => <tr key={`${sale.id}-${adjustment.number}`}><td>{formatDate(adjustment.createdAt.slice(0, 10))}</td><td><strong>{adjustment.number}</strong></td><td>{sale.invoiceNumber || "N/A"}</td><td>{sale.customer}</td><td>{adjustment.reason}</td><td>{adjustment.documentType}</td><td className={`numeric strong-number ${adjustment.difference < 0 ? "negative-number" : ""}`}>{money.format(adjustment.difference)}</td><td>{adjustment.notes || "Sin notas"}</td><td><button type="button" className="edit-button" onClick={() => setAdjustmentPreview({ sale, adjustment })}>Ver ajuste</button></td></tr>)}</tbody></table></div>}

          {reportRecordCount === 0 && <div className="catalog-empty"><strong>No hay informacion para mostrar</strong><span>Ajusta la busqueda o el rango de fechas para consultar otros registros.</span></div>}
        </section>
      </section>}

      {section === "settings" && <section className="erp-content">
        <header className="topbar"><div><p className="eyebrow">Norwest Produce LLC · USA</p><h1>Configuración de la empresa</h1></div></header>
        <div className="settings-layout">
          <form className="sales-panel settings-card" onSubmit={saveCompanySettings}>
            <div className="panel-heading"><div><h2>Datos de Norwest Produce LLC</h2><p>Esta información se utilizará en documentos y registros del módulo USA.</p></div></div>
            <div className="settings-form-grid">
              <label className="span-2">Nombre legal *<input required value={companyForm.legalName} onChange={(e) => setCompanyForm({...companyForm, legalName:e.target.value})} /></label>
              <label className="span-2">Dirección / calle<input value={companyForm.street} onChange={(e) => setCompanyForm({...companyForm, street:e.target.value})} /></label>
              <label>Ciudad<input value={companyForm.city} onChange={(e) => setCompanyForm({...companyForm, city:e.target.value})} /></label><label>Estado<input value={companyForm.state} onChange={(e) => setCompanyForm({...companyForm, state:e.target.value})} /></label><label>ZIP Code<input value={companyForm.postalCode} onChange={(e) => setCompanyForm({...companyForm, postalCode:e.target.value})} /></label>
              <label>Blue Book #<input value={companyForm.blueBookNumber} onChange={(e) => setCompanyForm({...companyForm, blueBookNumber:e.target.value})} /></label><label>PACA #<input value={companyForm.pacaNumber} onChange={(e) => setCompanyForm({...companyForm, pacaNumber:e.target.value})} /></label><label>DUNS & Bradstreet #<input value={companyForm.dunsNumber} onChange={(e) => setCompanyForm({...companyForm, dunsNumber:e.target.value})} /></label><label>TAX ID #<input value={companyForm.taxId} onChange={(e) => setCompanyForm({...companyForm, taxId:e.target.value})} /></label>
              <label className="profit-setting">% de utilidad de Norwest<input required min="0" max="100" step="0.01" type="number" value={companyForm.norwestProfitPercentage} onChange={(e) => setCompanyForm({...companyForm, norwestProfitPercentage:e.target.value})} /><small>Referencia administrativa. La utilidad de vendedores se reparte entre el vendedor del cliente y el restante en partes iguales para RR y GM.</small></label>
            </div>
            {companySaveState && <p className="form-message settings-message">{companySaveState}</p>}<div className="settings-actions"><button type="submit" className="primary-button">Guardar configuración</button></div>
          </form>
          <section className="sales-panel settings-card">
            <div className="panel-heading"><div><h2>Usuarios y vendedores</h2><p>Alias, correo y permisos por usuario.</p></div><button type="button" className="primary-button" onClick={() => openUserForm()}>＋ Agregar usuario</button></div>
            <div className="table-wrap settings-users-table"><table><thead><tr><th>Nombre</th><th>Alias</th><th>Correo</th><th>Estatus</th><th>Permisos</th><th></th></tr></thead><tbody>{users.map((user) => { let permissionCount = 0; try { permissionCount = (JSON.parse(user.permissions) as string[]).length; } catch { permissionCount = 0; } return <tr key={user.id}><td><strong>{user.fullName}</strong></td><td>{user.alias}</td><td>{user.email}</td><td><span className={`status-tag ${user.active ? "ok" : "adjusted"}`}>{user.active ? "Activo" : "Inactivo"}</span></td><td>{permissionCount} autorizaciones</td><td><button type="button" className="edit-button" onClick={() => openUserForm(user)}>Edit</button></td></tr>; })}</tbody></table></div>
            {!users.length && <div className="catalog-empty"><strong>Aún no hay usuarios internos</strong><span>Agrega al primer usuario o vendedor para asignarlo a los clientes.</span></div>}
          </section>
        </div>
      </section>}

      {invoiceStep !== "closed" && invoiceSale && <div className="modal-backdrop invoice-workflow-backdrop">
        {invoiceStep === "pickup" && <section className="sale-modal invoice-gate-modal">
          <div className="modal-heading"><div><p className="eyebrow">Preparar factura</p><h2>¿El cliente ya recogió el producto?</h2><p className="modal-intro">Pickup #{invoiceSale.pickupNumber} · {invoiceSale.customer}</p></div></div>
          <div className="pickup-confirmation">
            <button type="button" className={`confirmation-choice ${pickedUp === true ? "selected" : ""}`} onClick={() => setPickedUp(true)}><strong>Sí, ya recogió</strong><small>Continuar para adjuntar el BOL de la bodega.</small></button>
            <button type="button" className={`confirmation-choice danger-choice ${pickedUp === false ? "selected" : ""}`} onClick={() => setPickedUp(false)}><strong>No, todavía no</strong><small>La venta permanecerá pendiente y no podrá facturarse.</small></button>
          </div>
          {pickedUp === false && <p className="blocking-notice">No se puede facturar hasta que el cliente recoja el producto y exista un BOL.</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeInvoicePreparation}>Cancelar</button><button type="button" className="primary-button" disabled={pickedUp !== true} onClick={() => setInvoiceStep("bol")}>Continuar</button></div>
        </section>}

        {invoiceStep === "bol" && <section className="sale-modal invoice-gate-modal">
          <div className="modal-heading"><div><button type="button" className="back-link" onClick={() => setInvoiceStep("pickup")}>← Regresar</button><p className="eyebrow">BOL obligatorio</p><h2>Adjunta el Bill of Lading</h2><p className="modal-intro">Debe ser el BOL emitido por la bodega. Sin este archivo la factura no puede generarse.</p></div></div>
          <label
            className={`bol-dropzone ${bolFile ? "has-file" : ""}`}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDrop={(event) => { event.preventDefault(); selectBolFile(event.dataTransfer.files?.[0]); }}
          >
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => selectBolFile(event.target.files?.[0])} />
            <span className="bol-icon">⇧</span>
            <strong>{bolFile ? bolFile.name : "Arrastra o selecciona archivo BOL"}</strong>
            <small>{bolFile ? `${(bolFile.size / 1024 / 1024).toFixed(2)} MB · Archivo listo` : "PDF, JPG, PNG o WEBP · máximo 10 MB"}</small>
          </label>
          {invoiceSaveState && invoiceStep === "bol" && <p className="form-message">{invoiceSaveState}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeInvoicePreparation}>Cancelar</button><button type="button" className="primary-button" disabled={!bolFile || bolFile.size > 10 * 1024 * 1024} onClick={() => setInvoiceStep("items")}>Adjuntar y continuar</button></div>
        </section>}

        {invoiceStep === "items" && <form className="sale-modal invoice-items-modal" onSubmit={issueInvoice}>
          <div className="modal-heading"><div><button type="button" className="back-link" onClick={() => setInvoiceStep("bol")}>← Cambiar BOL</button><p className="eyebrow">Revisión final</p><h2>Partidas de la factura</h2><p className="modal-intro">Modifica cantidades o precios y agrega o elimina productos según lo que realmente se entregó.</p></div><span className="bol-attached-chip">✓ BOL: {bolFile?.name}</span></div>
          <datalist id="invoice-products">{products.map((product) => <option key={product.id} value={product.name} />)}</datalist>
          <div className="invoice-edit-table"><div className="invoice-edit-head"><span>Producto</span><span>Presentación</span><span>Tamaño</span><span>Etiqueta</span><span>Cantidad</span><span>Precio</span><span></span></div>{invoiceItems.map((item, index) => <div className="invoice-edit-row" key={index}>
            <input required list="invoice-products" aria-label="Producto" value={item.product} onChange={(event) => { const product = products.find((entry) => entry.name === event.target.value); updateInvoiceItem(index, product ? { product: product.name, presentation: product.presentation || "", size: product.size || "", label: product.label || "" } : { product: event.target.value }); }} />
            <input aria-label="Presentación" value={item.presentation} onChange={(event) => updateInvoiceItem(index, { presentation: event.target.value })} /><input aria-label="Tamaño" value={item.size} onChange={(event) => updateInvoiceItem(index, { size: event.target.value })} /><input aria-label="Etiqueta" value={item.label} onChange={(event) => updateInvoiceItem(index, { label: event.target.value })} />
            <input required min="1" step="1" type="number" aria-label="Cantidad" value={item.quantity} onChange={(event) => updateInvoiceItem(index, { quantity: Number(event.target.value) })} />{moneyField(item.unitPrice, (value) => updateInvoiceItem(index, { unitPrice: Number(value) }), true)}
            <button type="button" aria-label="Eliminar partida" disabled={invoiceItems.length === 1} onClick={() => setInvoiceItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
          </div>)}</div>
          <button type="button" className="add-expense-button invoice-add-item" onClick={() => setInvoiceItems((current) => [...current, { product: "", presentation: "", size: "", label: "", quantity: 1, unitPrice: 0 }])}>＋ Agregar producto</button>
          <div className="invoice-editor-total"><span>Total de factura</span><strong>{money.format(invoiceItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0))}</strong></div>
          {invoiceSaveState && <p className="form-message">{invoiceSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeInvoicePreparation}>Cancelar</button><button type="submit" className="primary-button">Generar factura</button></div>
        </form>}
      </div>}

      {partnerModal && <div className={`modal-backdrop ${partnerTarget ? "modal-backdrop-elevated" : ""}`}><form className="sale-modal partner-modal" onSubmit={savePartner}>
        <div className="modal-heading"><div><p className="eyebrow">Catálogo USA</p><h2>{editingPartnerId ? "Editar" : "Alta de"} {partnerModal === "SUPPLIER" ? "proveedor" : "cliente"}</h2><p className="modal-intro">Los campos marcados con * son obligatorios. Los demás pueden agregarse o modificarse después.</p></div></div>
        <label className="dual-role-check"><input type="checkbox" checked={alsoOppositeType} onChange={(e) => setAlsoOppositeType(e.target.checked)} /><span><strong>{partnerModal === "SUPPLIER" ? "También es cliente" : "También es proveedor"}</strong><small>Al guardar, la empresa se agregará automáticamente en ambos catálogos.</small></span></label>
        <label className="dual-role-check"><input type="checkbox" checked={isMexicanPartner} onChange={(e) => { setIsMexicanPartner(e.target.checked); setPartnerForm((f) => ({ ...f, stateCode: "", stateName: "", city: "", postalCode: "" })); }} /><span><strong>Empresa mexicana</strong><small>Activa esto para registrar un proveedor con RFC y dirección de México.</small></span></label>
        <section className="form-section partner-section"><div className="form-section-heading"><span>1</span><div><h3>Información fiscal y comercial</h3></div></div><div className="form-grid partner-grid">
          <label className="span-2">Nombre *<input required value={partnerForm.name} onChange={(e) => setPartnerForm({...partnerForm, name:e.target.value})} /></label>
          {isMexicanPartner
            ? <label>RFC<input value={partnerForm.taxId} placeholder="Ej. XAXX010101000" pattern="[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}" title="RFC válido: 3-4 letras, 6 dígitos de fecha, 3 caracteres alfanuméricos" onChange={(e) => setPartnerForm({...partnerForm, taxId:e.target.value.toUpperCase()})} /></label>
            : <><label>PACA #<input value={partnerForm.pacaNumber} onChange={(e) => setPartnerForm({...partnerForm, pacaNumber:e.target.value})} /></label><label>TAX ID #<input value={partnerForm.taxId} onChange={(e) => setPartnerForm({...partnerForm, taxId:e.target.value})} /></label><label>BLUE BOOK #<input value={partnerForm.blueBookNumber} onChange={(e) => setPartnerForm({...partnerForm, blueBookNumber:e.target.value})} /></label><label>DUNS and BRADSTREET #<input value={partnerForm.dunsNumber} onChange={(e) => setPartnerForm({...partnerForm, dunsNumber:e.target.value})} /></label></>}
          {(partnerModal === "CUSTOMER" || alsoOppositeType) && <><label>Vendedor *<select required value={partnerForm.assignedSeller} onChange={(e) => setPartnerForm({...partnerForm, assignedSeller:e.target.value})}><option value="">Selecciona un vendedor</option>{users.filter((user) => user.active).map((user) => <option key={user.id} value={user.fullName}>{user.fullName}</option>)}</select></label><label className="client-profit-field">% de utilidad del cliente<input min="0" max="100" step="0.01" type="number" value={partnerForm.profitPercentage} onChange={(e) => setPartnerForm({...partnerForm, profitPercentage:e.target.value})} /><small>Porcentaje para el vendedor asignado. El porcentaje restante se divide en partes iguales para RR y GM.</small></label></>}
        </div></section>
        <section className="form-section address-section"><div className="form-section-heading"><span>2</span><div><h3>Dirección</h3>{!isMexicanPartner && <p>Selecciona primero el estado para habilitar sus ciudades.</p>}</div></div><div className="form-grid partner-grid">
          {isMexicanPartner ? <>
            <label>Estado *<select required value={partnerForm.stateCode} onChange={(e) => { const s = MEXICAN_STATES.find((x) => x.code === e.target.value); setPartnerForm((f) => ({ ...f, stateCode: e.target.value, stateName: s?.name ?? "", city: "" })); }}><option value="">Selecciona un estado</option>{MEXICAN_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
            <label>Ciudad *<input required value={partnerForm.city} placeholder="Ciudad o municipio" onChange={(e) => setPartnerForm({...partnerForm, city:e.target.value})} /></label>
            <label>Calle *<input required value={partnerForm.street} onChange={(e) => setPartnerForm({...partnerForm, street:e.target.value})} /></label>
            <label>Número exterior *<input required value={partnerForm.exteriorNumber} onChange={(e) => setPartnerForm({...partnerForm, exteriorNumber:e.target.value})} /></label>
            <label>Número interior / Depto<input value={partnerForm.interiorNumber} placeholder="Depto, local, etc." onChange={(e) => setPartnerForm({...partnerForm, interiorNumber:e.target.value})} /></label>
            <label>Colonia<input value={partnerForm.dunsNumber} placeholder="Colonia o fraccionamiento" onChange={(e) => setPartnerForm({...partnerForm, dunsNumber:e.target.value})} /></label>
            <label>Código postal *<input required pattern="[0-9]{5}" maxLength={5} inputMode="numeric" placeholder="00000" value={partnerForm.postalCode} onChange={(e) => setPartnerForm({...partnerForm, postalCode:e.target.value.replace(/\D/g, "")})} /></label>
          </> : <>
            <label>Estado *<select required value={partnerForm.stateCode} onChange={(e) => void changePartnerState(e.target.value)}><option value="">Selecciona un estado</option>{states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>
            <label>Ciudad *<select required disabled={!partnerForm.stateCode || citiesLoading} value={partnerForm.city} onChange={(e) => setPartnerForm({...partnerForm, city:e.target.value})}><option value="">{citiesLoading ? "Cargando ciudades…" : partnerForm.stateCode ? "Selecciona una ciudad" : "Selecciona primero el estado"}</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
            <label>Calle<input value={partnerForm.street} onChange={(e) => setPartnerForm({...partnerForm, street:e.target.value})} /></label>
            <label>Número exterior<input value={partnerForm.exteriorNumber} onChange={(e) => setPartnerForm({...partnerForm, exteriorNumber:e.target.value})} /></label>
            <label>Número interior<input value={partnerForm.interiorNumber} onChange={(e) => setPartnerForm({...partnerForm, interiorNumber:e.target.value})} /></label>
            <label>P.O. / ZIP Code *<input required value={partnerForm.postalCode} onChange={(e) => setPartnerForm({...partnerForm, postalCode:e.target.value})} /></label>
          </>}
        </div></section>
        {(partnerModal === "CUSTOMER" || alsoOppositeType) && <section className="form-section buyer-section"><div className="form-section-heading"><span>3</span><div><h3>Datos de comprador</h3></div></div><div className="form-grid partner-grid">
          <label>Nombre del comprador<input value={partnerForm.buyerName} onChange={(e) => setPartnerForm({...partnerForm, buyerName:e.target.value})} /></label><label>Correo<input type="email" value={partnerForm.buyerEmail} onChange={(e) => setPartnerForm({...partnerForm, buyerEmail:e.target.value})} /></label><label>Teléfono oficina<input type="tel" inputMode="numeric" maxLength={14} placeholder="(XXX)-XXX-XXXX" value={formatPhone(partnerForm.buyerOfficePhone)} onChange={(e) => setPartnerForm({...partnerForm, buyerOfficePhone:digitsOnly(e.target.value)})} /></label><label>Extensión<input value={partnerForm.buyerOfficeExtension} onChange={(e) => setPartnerForm({...partnerForm, buyerOfficeExtension:e.target.value})} /></label><label>Celular<input type="tel" inputMode="numeric" maxLength={14} placeholder="(XXX)-XXX-XXXX" value={formatPhone(partnerForm.buyerMobilePhone)} onChange={(e) => setPartnerForm({...partnerForm, buyerMobilePhone:digitsOnly(e.target.value)})} /></label>
          <label className="dual-role-check span-2"><input type="checkbox" onChange={(e) => { if (e.target.checked) setPartnerForm((current) => ({ ...current, contactName: current.buyerName, contactEmail: current.buyerEmail, contactPhone: current.buyerOfficePhone || current.buyerMobilePhone })); }} /><span><strong>Contacto para pagos/cobros igual al comprador</strong></span></label>
        </div></section>}
        <section className="form-section contact-section"><div className="form-section-heading"><span>{partnerModal === "CUSTOMER" || alsoOppositeType ? "4" : "3"}</span><div><h3>Contacto para {partnerModal === "SUPPLIER" ? "pagos" : "cobros"}</h3></div></div><div className="form-grid partner-grid">
          <label>Nombre de contacto para {partnerModal === "SUPPLIER" ? "pagos" : "cobros"} *<input required value={partnerForm.contactName} onChange={(e) => setPartnerForm({...partnerForm, contactName:e.target.value})} /></label>
          <label>Correo para {partnerModal === "SUPPLIER" ? "pagos" : "cobros"} *<input required type="email" value={partnerForm.contactEmail} onChange={(e) => setPartnerForm({...partnerForm, contactEmail:e.target.value})} /></label>
          {isMexicanPartner
            ? <label>Teléfono para {partnerModal === "SUPPLIER" ? "pagos" : "cobros"} *<input required value={partnerForm.contactPhone} placeholder="10 dígitos sin espacios" onChange={(e) => setPartnerForm({...partnerForm, contactPhone:digitsOnly(e.target.value)})} /></label>
            : <label>Teléfono para {partnerModal === "SUPPLIER" ? "pagos" : "cobros"} *<input required type="tel" inputMode="numeric" maxLength={14} minLength={14} pattern="\([0-9]{3}\)-[0-9]{3}-[0-9]{4}" title="Formato (XXX)-XXX-XXXX" placeholder="(XXX)-XXX-XXXX" value={formatPhone(partnerForm.contactPhone)} onChange={(e) => setPartnerForm({...partnerForm, contactPhone:digitsOnly(e.target.value)})} /></label>}
        </div></section>
        {partnerSaveState && <p className="form-message">{partnerSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setPartnerModal(null); setPartnerTarget(null); }}>Cancelar</button><button type="submit" className="primary-button">{editingPartnerId ? "Guardar cambios" : `Registrar ${partnerModal === "SUPPLIER" ? "proveedor" : "cliente"}`}</button></div>
      </form></div>}

      {modalStep !== "closed" && <div className="modal-backdrop">
        {modalStep === "choose" ? <section className="sale-modal operation-modal">
          <div className="modal-heading"><div><p className="eyebrow">Nueva venta</p><h2>¿Qué tipo de venta es?</h2><p className="modal-intro">Selecciona el origen del producto para abrir la captura correspondiente.</p></div></div>
          <div className="operation-choice-grid">
            <button type="button" className="operation-choice resale-choice" onClick={() => chooseOperation("DIRECT_RESALE")}><span className="choice-icon">⇄</span><strong>Compra y reventa</strong><small>Registra primero a quién se compró y después a quién se vendió.</small><i>Continuar →</i></button>
            <button type="button" className="operation-choice inventory-choice" onClick={() => chooseOperation("IMPORTED_INVENTORY")}><span className="choice-icon">▦</span><strong>Venta de inventario importado</strong><small>Elige una partida disponible del inventario en USA.</small><i>Ver inventario →</i></button>
          </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModal}>Cancelar</button></div>
        </section> : <form className="sale-modal sale-modal-wide" onSubmit={saveSale} onKeyDown={moveToNextField}>
          <div className="modal-heading"><div>{!editingSale && <button type="button" className="back-link" onClick={() => setModalStep("choose")}>← Cambiar tipo</button>}<p className="eyebrow">{form.operationType === "DIRECT_RESALE" ? "Compra y reventa" : "Inventario importado"}</p><h2>{editingSale ? "Editar venta" : "Nueva venta"}</h2>{editingSale && <p className="modal-intro">Modifica los datos de la venta y guarda los cambios.</p>}</div></div>

          {form.operationType === "DIRECT_RESALE" ? <>
            <section className="form-section purchase-section"><div className="form-section-heading"><span>1</span><div><h3>Información de la compra</h3><p>Datos del proveedor y del producto adquirido.</p></div></div>
              <div className="form-grid purchase-header-fields"><label>Proveedor / a quién se compró<select required value={form.supplier} onChange={(e) => e.target.value === "__new__" ? void openPartnerForm("SUPPLIER", "saleSupplier") : setForm({...form, supplier:e.target.value})}><option value="">Selecciona un proveedor</option>{partners.filter((partner) => partner.partnerType === "SUPPLIER").map((partner) => <option key={partner.id} value={partner.name}>{partner.name}</option>)}<option value="__new__">＋ Agregar nuevo proveedor</option></select></label><label>PU# de compra<input required value={form.pickupNumber} onChange={(e) => setForm({...form, pickupNumber:e.target.value})} placeholder="Número de pickup" /></label></div>
              <div className="sale-lines-heading"><div><strong>Productos de la venta</strong><small>Puedes agregar el mismo producto con distintas presentaciones, tamaños o etiquetas.</small></div><button type="button" className="add-expense-button" onClick={() => addSaleLineItem()}>＋ Agregar producto</button></div>
              <div className="sale-lines">{saleLineItems.map((item, index) => { const productNames = Array.from(new Set(products.map((product) => product.name))).sort((a, b) => a.localeCompare(b)); return <article key={`${index}-${item.product}-${item.presentation}-${item.size}-${item.label}`}>
                <label><span>Producto</span><select required value={item.product} onChange={(event) => changeSaleLineProduct(index, event.target.value)}><option value="">Selecciona producto</option>{productNames.map((name) => <option key={name} value={name}>{name}</option>)}<option value="__new__">＋ Agregar nuevo producto</option></select></label>
                {(["presentation", "size", "label"] as const).map((field) => { const labels = { presentation: "Presentación", size: "Tamaño", label: "Etiqueta" }; return <label key={field}><span>{labels[field]}</span><select value={item[field]} disabled={!item.product} onChange={(event) => changeSaleLineCatalogValue(index, field, event.target.value)}><option value="">Sin {labels[field].toLocaleLowerCase()}</option>{saleLineCatalogValues(item.product, field).map((value) => <option key={value} value={value}>{value}</option>)}<option value="__new__">＋ Agregar nuevo</option></select></label>; })}
                <label><span>Bultos / cajas</span><input required min="1" step="1" type="number" value={item.quantity} onChange={(event) => updateSaleLineItem(index, { quantity: (event.target.value === "" ? "" : Number(event.target.value)) as unknown as number })} /></label>
                <label><span>Precio compra</span>{moneyField(item.purchasePrice ?? "", (value) => updateSaleLineItem(index, { purchasePrice: (value === "" ? "" : Number(value)) as unknown as number }), true)}</label>
                <label><span>Precio venta</span>{moneyField(item.unitPrice, (value) => updateSaleLineItem(index, { unitPrice: (value === "" ? "" : Number(value)) as unknown as number }), true)}</label>
                <div className="sale-line-total"><span>Total</span><strong>{money.format(item.quantity * item.unitPrice)}</strong></div>
                <button type="button" className="sale-line-remove" aria-label={`Eliminar ${item.product}`} onClick={() => setSaleLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </article>; })}</div>
              {!saleLineItems.length && <div className="sale-lines-empty">Agrega el primer producto para continuar.</div>}
            </section>
          </> : <section className="form-section inventory-section"><div className="form-section-heading"><span>1</span><div><h3>Selecciona del inventario</h3><p>Solo aparecen partidas con cajas disponibles.</p></div></div>
            {inventoryLoading ? <div className="inventory-empty">Consultando inventario…</div> : inventory.length === 0 ? <div className="inventory-empty"><strong>No hay inventario importado disponible</strong><span>Cuando se registren entradas de importación, aparecerán aquí para poder venderlas.</span></div> : <div className="inventory-list">{inventoryLoadGroups.filter((group) => group.lots.some((lot) => availableForSaleLot(lot) > 0)).map((group) => { const lot = group.first; const selected = group.lots.some((item) => saleLineItems.some((line) => line.inventoryLotId === item.id)); const aliases = Array.from(new Set(group.lots.map((item) => productAlias(item.product)))); return <button key={group.key} type="button" className={`inventory-row ${selected ? "selected" : ""}`} onClick={() => openInventorySaleLoad(group)}><span className="inventory-radio"/><span className="inventory-lot-reference"><strong>Factura #{lot.pickupNumber || "S/R"}</strong></span><span><strong>{inventoryAgeDays(lot)}</strong><small>dias en inventario</small></span><span><strong>{aliases.join(" / ")}</strong><small>{group.lots.length > 1 ? `${group.lots.length} productos` : "Producto"}</small></span><span><strong>{group.lots.length > 1 ? "Varios" : lot.size || "-"}</strong><small>Tamano</small></span><span><strong>{group.lots.length > 1 ? "Varios" : lot.presentation || "-"}</strong><small>Presentacion</small></span><span><strong>{group.lots.length > 1 ? "Varios" : lot.label || "-"}</strong><small>Etiqueta</small></span><span><strong>{lot.coldStorage || lot.warehouse}</strong><small>Bodega</small></span><span className="inventory-boxes"><strong>{number.format(group.lots.reduce((sum, item) => sum + availableForSaleLot(item), 0))}</strong><small>cajas disponibles</small></span></button>; })}</div>}
          </section>}

          {(form.operationType === "DIRECT_RESALE" || selectedLot) && <section className="form-section sale-section"><div className="form-section-heading"><span>2</span><div><h3>Información de la venta</h3><p>Datos del cliente, entrega y precio de venta.</p></div></div>
            <div className="form-grid"><label>Fecha de venta<input required type="date" value={form.saleDate} onChange={(e) => setForm({...form, saleDate:e.target.value})} /></label><label>Cliente / a quién se vendió<select required value={form.customer} onChange={(e) => { if (e.target.value === "__new__") return void openPartnerForm("CUSTOMER", "saleCustomer"); const customer = partners.find((partner) => partner.partnerType === "CUSTOMER" && partner.name === e.target.value); setForm({...form, customer:e.target.value, sellerName:customer?.assignedSeller ? canonicalSellerName(customer.assignedSeller) : ""}); }}><option value="">Selecciona un cliente</option>{partners.filter((partner) => partner.partnerType === "CUSTOMER").map((partner) => <option key={partner.id} value={partner.name}>{partner.name}</option>)}<option value="__new__">＋ Agregar nuevo cliente</option></select></label><label>Vendedor<input readOnly value={form.sellerName} placeholder="Asignado desde el cliente" /></label><label>PO# del cliente<input value={form.purchaseOrder} onChange={(e) => setForm({...form, purchaseOrder:e.target.value})} /></label><label>Bodega de Pickup<select required value={selectedSaleWarehouse?.id || (form.warehouse ? `legacy:${form.warehouse}` : "")} onChange={(e) => chooseSaleWarehouse(e.target.value)}><option value="">Selecciona una bodega</option>{coldStorages.map((item) => <option key={`catalog:${item.id}`} value={item.id}>{item.name}</option>)}{registeredSaleWarehouses.map((name) => <option key={`legacy:${name}`} value={`legacy:${name}`}>{name}</option>)}{form.warehouse && !selectedSaleWarehouse && !registeredSaleWarehouses.includes(form.warehouse) && <option value={`legacy:${form.warehouse}`}>{form.warehouse}</option>}<option value="__new__">＋ Agregar bodega</option></select>{selectedSaleWarehouse && <small className="field-help">{selectedSaleWarehouse.address} · {formatPhone(selectedSaleWarehouse.phone)}</small>}</label><label>SHIP TO<input list="ship-to-options" value={form.shipTo} onChange={(e) => setForm({...form, shipTo:e.target.value})} placeholder="Ciudad, Estado o términos de venta" /><datalist id="ship-to-options"><option value="FOB McAllen" /><option value="FOB Nogales" /><option value="Delivered" /></datalist></label><label>Día de pickup<input min={localDateKey()} type="date" value={form.pickupDate} onChange={(e) => setForm({...form, pickupDate:e.target.value})} /><small className="field-help">No puede ser anterior al día actual.</small></label></div>
          </section>}
{form.operationType === "IMPORTED_INVENTORY" && saleLineItems.length > 0 && <div className="selected-inventory-sale selected-inventory-sale-final"><div><strong>Productos seleccionados</strong><button type="button" className="secondary-button" onClick={() => { const group = inventoryLoadGroups.find((item) => item.lots.some((lot) => lot.id === Number(form.inventoryLotId))); if (group) openInventorySaleLoad(group); }}>Editar detalle</button></div>{saleLineItems.map((item) => <article key={`${item.inventoryLotId}-${item.product}`}><span className="product-alias-chip">{productAlias(item.product)}</span><div><strong>{item.product}</strong><small>{[item.size, item.presentation, item.label].filter(Boolean).join(" - ") || "Sin detalle"}</small></div><span><small>Cajas</small><b>{number.format(Number(item.quantity || 0))}</b></span><span><small>Precio venta</small><b>{money.format(Number(item.unitPrice || 0))}</b></span><span><small>UTILIDAD/CAJA USD</small><b>{money.format(Number(item.unitPrice || 0) - Number(item.purchasePrice || 0))}</b></span><span><small>Total</small><b>{money.format(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</b></span></article>)}</div>}
          <div className="form-total"><span>Total</span><strong>{money.format(saleDraftSummary.total)}</strong><small>Utilidad total: {money.format(saleDraftSummary.profit)}</small><small>Utilidad vendedores: {money.format(saleDraftSummary.sellerProfit)}</small></div>
          {saveState && <p className="form-message">{saveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModal}>Cancelar</button><button className="primary-button" type="submit" disabled={form.operationType === "IMPORTED_INVENTORY" && !saleLineItems.length}>{editingSale ? "Guardar cambios" : "Guardar venta"}</button></div>
        </form>}
      </div>}

      {inventorySaleLots && <div className="modal-backdrop modal-backdrop-elevated"><section className="sale-modal inventory-sale-detail-modal">
        <div className="modal-heading"><div><p className="eyebrow">Venta de inventario importado</p><h2>Factura #{inventorySaleLots[0]?.pickupNumber || "S/R"}</h2><p className="modal-intro">Captura las cajas a vender y el precio de venta por producto. Cierra esta ventana solo con Continuar o Cancelar.</p></div></div>
        <div className="inventory-sale-detail-list">{inventorySaleDraft.map((item) => {
          const available = availableForSaleLot(item.lot);
          return <article key={item.lot.id}><div><span className="product-alias-chip">{productAlias(item.lot.product)}</span><strong>{item.lot.product}</strong><small>{[item.lot.size, item.lot.presentation, item.lot.label].filter(Boolean).join(" · ") || "Sin detalle"}</small></div><span><small>Costo/caja USD</small><strong>{item.lot.unitCost == null ? "—" : money.format(item.lot.unitCost)}</strong></span><span><small>Disponible</small><strong>{number.format(available)}</strong></span><label><small>Cajas a vender</small><input min="0" max={available} step="1" type="number" value={item.boxes} onChange={(event) => updateInventorySaleDraft(item.lot.id, { boxes: event.target.value })} /></label><label><small>Precio venta</small>{moneyField(item.salePrice, (value) => updateInventorySaleDraft(item.lot.id, { salePrice: value }))}</label></article>;
        })}</div>
        {inventorySaleWarning && <div className="below-cost-alert"><strong>Precio por debajo del costo</strong><span>{inventorySaleWarning.lot.product}: costo USD {money.format(inventorySaleWarning.lot.unitCost || 0)} por caja, perdida USD {money.format(inventorySaleWarning.loss)} por caja.</span><div><button type="button" className="secondary-button" onClick={() => setInventorySaleWarning(null)}>Cancelar</button><button type="button" className="secondary-button" onClick={() => setInventorySaleWarning(null)}>Modificar precio de venta</button><button type="button" className="primary-button" onClick={() => applyInventorySaleLoad(true)}>Continuar con perdida</button></div></div>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeInventorySaleLoad}>Cancelar</button><button type="button" className="primary-button" onClick={() => applyInventorySaleLoad()}>Continuar</button></div>
      </section></div>}

      {inventoryModal && <div className="modal-backdrop"><form className="sale-modal sale-modal-wide" onSubmit={saveInventoryEntry} onKeyDown={moveToNextField}>
        <div className="modal-heading"><div><p className="eyebrow">Inventario importado</p><h2>{editingInventoryId ? "Editar entrada" : "Registrar entrada"}</h2><p className="modal-intro">Esta partida quedará disponible para seleccionarla al registrar una venta de inventario.</p></div></div>
        <section className="form-section inventory-section"><div className="form-section-heading"><span>1</span><div><h3>Datos de la importación</h3></div></div><div className="form-grid">
          <label>Fecha de carga<input type="date" value={inventoryForm.loadDate} onChange={(e) => setInventoryForm({...inventoryForm, loadDate:e.target.value})} /></label><label>Fecha de entrada *<input required type="date" value={inventoryForm.receivedDate} onChange={(e) => setInventoryForm({...inventoryForm, receivedDate:e.target.value})} /></label><label>Proveedor<select value={inventoryForm.supplier} onChange={(e) => e.target.value === "__new__" ? void openPartnerForm("SUPPLIER", "inventorySupplier") : setInventoryForm({...inventoryForm, supplier:e.target.value})}><option value="">Selecciona un proveedor</option>{partners.filter((partner) => partner.partnerType === "SUPPLIER").map((partner) => <option key={partner.id} value={partner.name}>{partner.name}</option>)}<option value="__new__">＋ Agregar nuevo proveedor</option></select></label><label>Factura #<input value={inventoryForm.pickupNumber} onChange={(e) => setInventoryForm({...inventoryForm, pickupNumber:e.target.value})} /></label><div className="span-all inventory-entry-items"><div className="inventory-entry-items-heading"><strong>Productos de la carga</strong><button type="button" className="add-expense-button" onClick={addInventoryItem}>+ Agregar producto</button></div>{inventoryItems.map((item, index) => { const productNames = Array.from(new Set(products.map((product) => product.name))).sort((a, b) => a.localeCompare(b)); return <article key={index}><label><span>Producto</span><select required value={item.product} onChange={(event) => chooseInventoryItemProduct(index, event.target.value)}><option value="">Selecciona producto</option>{productNames.map((name) => <option key={name} value={name}>{name}</option>)}<option value="__new__">+ Agregar nuevo producto</option></select></label><label><span>Tamaño</span><select disabled={!item.product} value={item.size} onChange={(event) => updateInventoryItemVariant(index, "size", event.target.value)}><option value="">Selecciona</option>{inventoryItemCatalogValues(item.product, "size").map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Presentación</span><select disabled={!item.product} value={item.presentation} onChange={(event) => updateInventoryItemVariant(index, "presentation", event.target.value)}><option value="">Selecciona</option>{inventoryItemCatalogValues(item.product, "presentation").map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Etiqueta</span><select disabled={!item.product} value={item.label} onChange={(event) => updateInventoryItemVariant(index, "label", event.target.value)}><option value="">Selecciona</option>{inventoryItemCatalogValues(item.product, "label").map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Cantidad cajas</span><input required min="1" step="1" type="number" value={item.totalBoxes} onChange={(event) => updateInventoryItem(index, { totalBoxes: event.target.value })} /></label><label><span>Cajas por pallet</span><input min="1" step="1" type="number" value={item.boxesPerPallet} onChange={(event) => updateInventoryItem(index, { boxesPerPallet: event.target.value })} /></label><label><span>Precio compra</span><span className="money-entry"><span className="dollar-input"><span>$</span><input required min="0" step="0.01" type="number" value={item.purchasePrice} onChange={(event) => updateInventoryItem(index, { purchasePrice: event.target.value })} /></span><select aria-label="Moneda precio compra" value={item.purchaseCurrency} onChange={(event) => updateInventoryItem(index, { purchaseCurrency: event.target.value as Currency })}><option value="MXN">MXN</option><option value="USD">USD</option></select></span></label><button type="button" className="sale-line-remove" aria-label="Eliminar producto" disabled={inventoryItems.length === 1} onClick={() => removeInventoryItem(index)}>x</button></article>; })}</div><label>Total de bultos o cajas *<input name="totalBoxes" required readOnly value={inventoryItemsTotalBoxes ? String(inventoryItemsTotalBoxes) : ""} /><small className="field-help">Se calcula con la suma de las cajas de los productos agregados.</small></label><div className="span-2 document-inline-upload"><span>Documentos de la carga</span><label className="document-chip-button"><input type="file" multiple onChange={(event) => addInventoryAttachments(event.target.files)} />Seleccionar archivos</label>{inventoryForm.attachments.length > 0 && <small className="attachment-list">{inventoryForm.attachments.join(", ")}</small>}</div></div></section>
        <section className="form-section cost-section"><div className="form-section-heading"><span>2</span><div><h3>Costos y gastos de importación</h3><p>Los gastos son totales de la carga y se distribuyen entre todos los bultos o cajas.</p></div></div><div className="exchange-rate-row"><label>Tipo de cambio de esta transacción <span>1 USD =</span><input required min="0.0001" step="0.0001" type="number" value={inventoryForm.exchangeRate} onChange={(e) => setInventoryForm({...inventoryForm, exchangeRate:e.target.value})} /><b>MXN</b></label></div><div className="form-grid cost-grid">
          {costInput("Flete total", "freightCost")}{costInput("Aduana MX total", "mexicoCustomsCost")}{costInput("Aduana US total", "usCustomsCost")}{costInput("Sobrepeso total", "overweightCost")}{costInput("Semáforo rojo MX", "redLightCost")}{costInput("Semáforo rojo US", "redLightUsCost")}<label>Cold storage de destino *<select required value={selectedColdStorage?.id || ""} onChange={(e) => chooseColdStorage(e.target.value)}><option value="">Selecciona un cold storage</option>{coldStorages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="__new__">＋ Agregar nuevo cold storage</option></select>{selectedColdStorage && <small className="field-help">{selectedColdStorage.address} · {formatPhone(selectedColdStorage.phone)}</small>}</label>{costInput("Costo total de cold storage", "coldStorageCost")}
        </div><div className="extra-expenses"><div className="extra-heading"><strong>Otros costos o gastos totales</strong><button type="button" className="add-expense-button" onClick={() => setAdditionalExpenses((current) => [...current, { concept: "", amount: "", currency: "USD" }])}>＋ Agregar gasto</button></div>{additionalExpenses.map((expense, index) => <div className="expense-row" key={index}><div className="expense-concept-field"><input aria-label="Concepto del gasto" placeholder="Concepto" autoComplete="off" value={expense.concept} onFocus={() => setActiveExpenseConcept(index)} onBlur={() => window.setTimeout(() => setActiveExpenseConcept((current) => current === index ? null : current), 120)} onChange={(e) => setAdditionalExpenses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, concept: e.target.value } : item))} />{activeExpenseConcept === index && expenseConcepts.length > 0 && <div className="expense-concept-menu">{expenseConcepts.filter((concept) => concept.toLocaleLowerCase().includes(expense.concept.toLocaleLowerCase())).map((concept) => <button type="button" key={concept} onMouseDown={(event) => event.preventDefault()} onClick={() => { setAdditionalExpenses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, concept } : item)); setActiveExpenseConcept(null); }}>{concept}</button>)}</div>}</div><span className="dollar-input"><span>$</span><input aria-label="Importe total del gasto" placeholder="Importe total" min="0" step="0.01" type="number" value={expense.amount} onChange={(e) => setAdditionalExpenses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: e.target.value } : item))} /></span><select aria-label="Moneda del gasto" value={expense.currency} onChange={(e) => setAdditionalExpenses((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, currency: e.target.value as Currency } : item))}><option value="USD">USD</option><option value="MXN">MXN</option></select><button type="button" aria-label="Eliminar gasto" onClick={() => setAdditionalExpenses((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>
        <div className="import-cost-summary"><span><small>Costo total de importación</small><strong>{money.format(inventoryCostSummary.totalUsd)} USD</strong><b>{moneyMxn.format(inventoryCostSummary.totalMxn)} MXN</b></span><span><small>Costo real por caja</small><strong>{money.format(inventoryItems.length > 1 ? 0 : inventoryCostSummary.unitUsd)} USD</strong><b>{moneyMxn.format(inventoryItems.length > 1 ? 0 : inventoryCostSummary.unitMxn)} MXN</b></span></div>{inventoryItems.length > 1 && <div className="import-product-costs">{inventoryCostSummary.itemCosts.map((item) => <span key={item.key}><small>{item.label}</small><strong>{money.format(item.unitUsd)} USD</strong><b>{moneyMxn.format(item.unitMxn)} MXN</b></span>)}</div>}</section>
        {inventorySaveState && <p className="form-message">{inventorySaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setInventoryModal(false); setEditingInventoryId(null); }}>Cancelar</button><button type="submit" className="primary-button">{editingInventoryId ? "Guardar cambios" : "Registrar entrada"}</button></div>
      </form></div>}

      {coldStorageModal && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal product-modal" onSubmit={saveColdStorage}>
        <div className="modal-heading"><div><p className="eyebrow">Catálogo USA</p><h2>{editingColdStorageId ? "Editar" : "Agregar"} bodega</h2><p className="modal-intro">{coldStorageTarget === "catalog" ? "Los cambios se reflejarán en los selectores de bodega del sistema." : `Al guardarla regresarás a ${coldStorageTarget === "sale" ? "la venta" : "la entrada de inventario"} con esta bodega seleccionada.`}</p></div></div>
        <section className="form-section"><div className="form-grid"><label>Nombre de la bodega *<input required value={coldStorageForm.name} onChange={(e) => setColdStorageForm({...coldStorageForm, name:e.target.value})} /></label><label>Estado *<select required value={coldStorageForm.stateCode} onChange={(e) => void changeColdStorageState(e.target.value)}><option value="">Selecciona un estado</option>{states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label><label>Ciudad *<select required disabled={!coldStorageForm.stateCode || citiesLoading} value={coldStorageForm.city} onChange={(e) => setColdStorageForm({...coldStorageForm, city:e.target.value})}><option value="">{citiesLoading ? "Cargando ciudades..." : coldStorageForm.stateCode ? "Selecciona una ciudad" : "Selecciona primero el estado"}</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label><label>Calle *<input required value={coldStorageForm.street} onChange={(e) => setColdStorageForm({...coldStorageForm, street:e.target.value})} /></label><label>Número exterior *<input required value={coldStorageForm.exteriorNumber} onChange={(e) => setColdStorageForm({...coldStorageForm, exteriorNumber:e.target.value})} /></label><label>Número interior<input value={coldStorageForm.interiorNumber} onChange={(e) => setColdStorageForm({...coldStorageForm, interiorNumber:e.target.value})} /></label><label>P.O. / ZIP Code *<input required value={coldStorageForm.postalCode} onChange={(e) => setColdStorageForm({...coldStorageForm, postalCode:e.target.value})} /></label><label>Teléfono *<input required type="tel" inputMode="numeric" maxLength={14} placeholder="(XXX)-XXX-XXXX" value={formatPhone(coldStorageForm.phone)} onChange={(e) => setColdStorageForm({...coldStorageForm, phone:digitsOnly(e.target.value)})} /></label></div></section>
        {coldStorageSaveState && <p className="form-message">{coldStorageSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setColdStorageModal(false)}>Cancelar</button><button type="submit" className="primary-button">{editingColdStorageId ? "Guardar cambios" : "Registrar bodega"}</button></div>
      </form></div>}

      {productModal && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal product-modal" onSubmit={saveProduct}>
        <div className="modal-heading"><div><p className="eyebrow">Catálogo USA</p><h2>{productVariantBase ? "Agregar variante" : "Agregar nuevo producto"}</h2><p className="modal-intro">{productVariantBase ? "El producto se conserva; captura únicamente la nueva presentación, tamaño y etiqueta." : productTarget === "catalog" ? "El producto quedará disponible para ventas e inventario." : "Al guardarlo regresarás a la captura anterior con el producto seleccionado."}</p></div></div>
        {productVariantBase && <div className="product-variant-context"><div><span>Producto</span><strong>{productVariantBase.name}</strong></div><div><span>Alias</span><strong className="product-alias-chip">{productVariantBase.alias}</strong></div></div>}
        <section className="form-section"><div className="form-grid">{!productVariantBase && <><label>Producto *<input required value={productForm.name} onChange={(e) => setProductForm({...productForm, name:e.target.value})} /></label><label>Alias *<input required maxLength={3} pattern="[A-Za-z]{1,3}" title="De 1 a 3 letras" value={productForm.alias} onChange={(e) => setProductForm({...productForm, alias:e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3)})} placeholder="Máx. 3 letras" /></label></>}<label>Presentación<input value={productForm.presentation} onChange={(e) => setProductForm({...productForm, presentation:e.target.value})} placeholder="Ej. caja 25 lb" /></label><label>Tamaño<input value={productForm.size} onChange={(e) => setProductForm({...productForm, size:e.target.value})} /></label><label>Etiqueta<input value={productForm.label} onChange={(e) => setProductForm({...productForm, label:e.target.value})} /></label><label>Cajas por pallet<input min="1" step="1" type="number" value={productForm.boxesPerPallet} onChange={(e) => setProductForm({...productForm, boxesPerPallet:e.target.value})} /></label></div></section>
        {productSaveState && <p className="form-message">{productSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setProductModal(false); setProductTarget(null); setProductTargetLine(null); setProductVariantBase(null); }}>Cancelar</button><button type="submit" className="primary-button">{productVariantBase ? "Guardar variante" : "Registrar producto"}</button></div>
      </form></div>}

      {settingsAuthOpen && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal admin-auth-modal" onSubmit={authorizeSettings}>
        <div className="modal-heading"><div><p className="eyebrow">Autorización requerida</p><h2>Configuración USA</h2><p className="modal-intro">Ingresa con un usuario Administrador para modificar empresa, usuarios y permisos.</p></div></div>
        <section className="form-section"><div className="form-grid"><label>Correo administrador<input required type="email" value={settingsCredentials.email} onChange={(event) => setSettingsCredentials((current) => ({ ...current, email: event.target.value }))} /></label><label>Contraseña<input required type="password" value={settingsCredentials.password} onChange={(event) => setSettingsCredentials((current) => ({ ...current, password: event.target.value }))} /></label></div></section>
        {settingsAuthState && <p className="form-message">{settingsAuthState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSettingsAuthOpen(false)}>Cancelar</button><button type="submit" className="primary-button">Entrar</button></div>
      </form></div>}

      {userModal && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal user-modal" onSubmit={saveUser}>
        <div className="modal-heading"><div><p className="eyebrow">Configuración USA</p><h2>{editingUserId ? "Editar usuario" : "Agregar usuario"}</h2><p className="modal-intro">Define sus datos y lo que podrá consultar o modificar.</p></div></div>
        <section className="form-section"><div className="form-grid"><label>Nombre completo *<input required value={userForm.fullName} onChange={(e) => setUserForm({...userForm, fullName:e.target.value})} /></label><label>Alias *<input required value={userForm.alias} onChange={(e) => setUserForm({...userForm, alias:e.target.value})} /></label><label>Correo *<input required type="email" value={userForm.email} onChange={(e) => setUserForm({...userForm, email:e.target.value})} /></label>{editingUserId ? <><label hidden>Contraseña actual<div className="password-input"><input minLength={8} type={visibleUserPasswords.current ? "text" : "password"} autoComplete="current-password" value={userForm.currentPassword} onChange={(e) => setUserForm({...userForm, currentPassword:e.target.value})} placeholder="No requerida" /><button type="button" className={visibleUserPasswords.current ? "is-visible" : ""} aria-label={visibleUserPasswords.current ? "Ocultar contraseña actual" : "Mostrar contraseña actual"} aria-pressed={visibleUserPasswords.current} onClick={() => setVisibleUserPasswords((current) => ({...current, current:!current.current}))}>👁</button></div></label><label>Nueva contraseña<div className="password-input"><input minLength={8} type={visibleUserPasswords.next ? "text" : "password"} autoComplete="new-password" value={userForm.newPassword} onChange={(e) => setUserForm({...userForm, newPassword:e.target.value})} placeholder="Mínimo 8 caracteres" /><button type="button" className={visibleUserPasswords.next ? "is-visible" : ""} aria-label={visibleUserPasswords.next ? "Ocultar nueva contraseña" : "Mostrar nueva contraseña"} aria-pressed={visibleUserPasswords.next} onClick={() => setVisibleUserPasswords((current) => ({...current, next:!current.next}))}>👁</button></div></label><label>Confirmar nueva contraseña<div className="password-input"><input minLength={8} type={visibleUserPasswords.confirm ? "text" : "password"} autoComplete="new-password" value={userForm.confirmNewPassword} onChange={(e) => setUserForm({...userForm, confirmNewPassword:e.target.value})} placeholder="Repite la nueva contraseña" /><button type="button" className={visibleUserPasswords.confirm ? "is-visible" : ""} aria-label={visibleUserPasswords.confirm ? "Ocultar confirmación" : "Mostrar confirmación"} aria-pressed={visibleUserPasswords.confirm} onClick={() => setVisibleUserPasswords((current) => ({...current, confirm:!current.confirm}))}>👁</button></div></label></> : <label>Contraseña *<div className="password-input"><input required minLength={8} type={visibleUserPasswords.password ? "text" : "password"} autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({...userForm, password:e.target.value})} placeholder="Mínimo 8 caracteres" /><button type="button" className={visibleUserPasswords.password ? "is-visible" : ""} aria-label={visibleUserPasswords.password ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visibleUserPasswords.password} onClick={() => setVisibleUserPasswords((current) => ({...current, password:!current.password}))}>👁</button></div></label>}<label className="user-active-check"><input type="checkbox" checked={userForm.active} onChange={(e) => setUserForm({...userForm, active:e.target.checked})} /> Usuario activo</label></div>{editingUserId && <p className="password-change-help">Para conservar la contraseña actual, deja vacíos nueva contraseña y confirmación.</p>}</section>
        <section className="form-section"><div className="form-section-heading"><span>✓</span><div><h3>Permisos del usuario</h3><p>Autoriza individualmente cada área.</p></div></div><label className="dual-role-check admin-check"><input type="checkbox" checked={ALL_PERMISSION_KEYS.every((key) => userForm.permissions.includes(key))} onChange={(e) => setUserForm({...userForm, permissions:e.target.checked ? [...ALL_PERMISSION_KEYS] : ["sales_view"]})} /><span><strong>Es Administrador</strong><small>Al activar esta casilla obtiene todos los permisos en automatico.</small></span></label><div className="permissions-grid">{PERMISSION_OPTIONS.map(([key, label]) => <label key={key}><input type="checkbox" checked={userForm.permissions.includes(key)} onChange={(e) => setUserForm({...userForm, permissions:e.target.checked ? [...userForm.permissions, key] : userForm.permissions.filter((item) => item !== key)})} /><span>{label}</span></label>)}</div></section>
        {userSaveState && <p className="form-message">{userSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setUserModal(false)}>Cancelar</button><button type="submit" className="primary-button">{editingUserId ? "Guardar cambios" : "Crear usuario"}</button></div>
      </form></div>}

      {statusModalSale && statusModalType === "PAS" && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal status-modal" onSubmit={savePasStatus}>
        <div className="modal-heading"><div><p className="eyebrow">Estatus · PAS</p><h2>{statusModalSale.loadStatus === "PAS" ? "Revisar plazo abierto" : "Price After Sale"}</h2><p className="modal-intro">Pickup #{statusModalSale.pickupNumber} · {statusModalSale.customer}</p></div></div>
        {statusModalSale.loadStatus === "PAS" && statusModalSale.pasReviewDueDate && <div className={`pas-current-term ${statusModalSale.pasReviewDueDate <= localDateKey() ? "expired" : ""}`}><span>Plazo actual</span><strong>{statusModalSale.pasReviewDueDate <= localDateKey() ? "Vencido" : "Abierto"} hasta {formatDate(statusModalSale.pasReviewDueDate)}</strong></div>}
        <section className="form-section"><label>¿Cuántos días quedará abierto el precio? *<input autoFocus required min="1" max="365" step="1" type="number" value={pasDays} onChange={(event) => setPasDays(event.target.value)} placeholder="Ej. 3" /></label><p className="field-help">Al vencer, el sistema mostrará una notificación para revisar el acuerdo o conceder más días.</p></section>
        {statusSaveState && <p className="form-message">{statusSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeStatusModal}>Cancelar</button><button type="submit" className="primary-button">{statusModalSale.loadStatus === "PAS" ? "Dar nuevos días" : "Guardar PAS"}</button></div>
      </form></div>}

      {statusModalSale && statusModalType === "USDA REQUESTED" && <div className="modal-backdrop modal-backdrop-elevated"><section className="sale-modal status-modal">
        <div className="modal-heading"><div><p className="eyebrow">Estatus · USDA Requested</p><h2>Inspección USDA</h2><p className="modal-intro">Pickup #{statusModalSale.pickupNumber} · {statusModalSale.customer}</p></div></div>
        <section className="form-section"><div className="usda-explanation"><strong>Adjunta la inspección si ya la recibiste.</strong><span>Si los inspectores todavía no han acudido o el documento tarda en llegar, puedes guardar el estatus como pendiente y agregarlo después.</span></div><label className={`document-drop-zone ${usdaFile ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectUsdaFile(event.dataTransfer.files[0]); }}><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => selectUsdaFile(event.target.files?.[0])} /><span>{usdaFile ? "✓" : "⇧"}</span><strong>{usdaFile ? usdaFile.name : "Arrastra o selecciona la inspección USDA"}</strong><small>PDF, JPG, PNG o WEBP · Máximo 10 MB</small></label></section>
        {statusSaveState && <p className="form-message">{statusSaveState}</p>}<div className="modal-actions status-modal-actions"><button type="button" className="secondary-button" onClick={closeStatusModal}>Cancelar</button><button type="button" className="secondary-button" onClick={() => void saveUsdaStatus(true)}>Aún no la tengo</button><button type="button" className="primary-button" disabled={!usdaFile} onClick={() => void saveUsdaStatus(false)}>Guardar inspección</button></div>
      </section></div>}

      {importLoadDetail && <div className="modal-backdrop modal-backdrop-elevated"><section className="sale-modal sale-modal-wide import-load-detail-modal">
        <div className="modal-heading"><div><p className="eyebrow">Utilidad por carga importada</p><h2>Factura de carga {importLoadDetail.loadReference}</h2><p className="modal-intro">Detalle de ventas generadas desde esta carga.</p></div></div>
        <div className="table-wrap report-table import-load-detail-table"><table><thead><tr><th>Fecha</th><th>Factura venta</th><th>Cliente</th><th>PO #</th><th>Pickup #</th><th>Producto</th><th className="numeric">Cajas</th><th className="numeric">Venta</th><th className="numeric">Utilidad</th><th className="numeric">Utilidad vendedores</th></tr></thead><tbody>{importLoadDetail.sales.map((sale, index) => <tr key={sale.id ?? `${sale.pickupNumber}-${index}`}><td>{formatDate(sale.saleDate)}</td><td>{sale.invoiceNumber || "Pendiente"}</td><td><strong>{sale.customer}</strong><small>{canonicalSellerName(sale.sellerName)}</small></td><td>{sale.purchaseOrder || "N/A"}</td><td>{sale.pickupNumber || "N/A"}</td><td>{productCell(sale, true)}</td><td className="numeric">{number.format(saleBoxesFor(sale))}</td><td className="numeric strong-number">{money.format(saleTotalFor(sale))}</td><td className={`numeric strong-number ${saleProfitFor(sale) < 0 ? "negative-number" : ""}`}>{money.format(saleProfitFor(sale))}</td><td className="numeric">{money.format(sellerProfitFor(sale))}</td></tr>)}</tbody></table></div>
        <div className="modal-actions"><button type="button" className="primary-button" onClick={() => setImportLoadDetail(null)}>Ok</button></div>
      </section></div>}

      {productDetailSale && <div className="modal-backdrop modal-backdrop-elevated"><section className="sale-modal product-detail-modal">
        <div className="modal-heading"><div><p className="eyebrow">Detalle de la carga</p><h2>Productos · Pickup #{productDetailSale.pickupNumber}</h2><p className="modal-intro">{productDetailSale.customer}</p></div></div>
        {productDetailSale.canceledAt && <div className="canceled-record-notice"><strong>Venta cancelada</strong><span>{productDetailSale.canceledBy} · {productDetailSale.cancellationReason}</span></div>}
        {(productDetailSale.invoiceNumber || productDetailReadOnly) && <div className="locked-detail-notice"><strong>Detalle sólo consulta</strong><span>{productDetailReadOnly ? "Esta vista viene desde Reportes y no permite modificar información." : "Para cambiar productos, bultos/cajas o precios, utiliza Crear ajuste desde la vista de la factura."}</span></div>}
        <div className="product-detail-list">{productDetailItems.map((item, index) => { const purchasePrice = Number(item.purchasePrice ?? productDetailSale.purchasePrice ?? 0); const salePrice = Number(item.unitPrice || 0); const boxes = Number(item.quantity || 0); const lineTotal = boxes * salePrice; const lineProfit = (salePrice - purchasePrice) * boxes; return <article key={`${item.product}-${index}`}><span className="product-alias-chip">{productAlias(item.product)}</span><div><strong>{item.product}</strong><small>{[item.presentation, item.size, item.label].filter(Boolean).join(" · ") || "Sin presentación especificada"}</small></div><div className="product-detail-edit product-detail-metrics"><label><span>Bultos / cajas</span><input disabled={Boolean(productDetailReadOnly || productDetailSale.canceledAt || productDetailSale.invoiceNumber)} min="1" step="1" type="number" value={item.quantity} onChange={(event) => updateProductDetailItem(index, { quantity: Number(event.target.value) })} /></label><div><span>Precio compra</span><strong>{money.format(purchasePrice)}</strong></div><label><span>Precio venta</span>{moneyField(item.unitPrice, (value) => updateProductDetailItem(index, { unitPrice: Number(value) }), false, Boolean(productDetailReadOnly || productDetailSale.canceledAt || productDetailSale.invoiceNumber))}</label><div><span>Utilidad</span><strong className={lineProfit < 0 ? "negative-number" : ""}>{money.format(lineProfit)}</strong></div><div><span>Total factura</span><strong>{money.format(lineTotal)}</strong></div></div></article>; })}</div>
        <div className="product-detail-summary"><span>Total de bultos/cajas: <strong>{number.format(productDetailItems.reduce((sum, item) => sum + item.quantity, 0))}</strong></span><span>Total de factura: <strong>{money.format(productDetailItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))}</strong></span><span>Total de utilidad: <strong>{money.format(productDetailItems.reduce((sum, item) => sum + (Number(item.unitPrice || 0) - Number(item.purchasePrice ?? productDetailSale.purchasePrice ?? 0)) * Number(item.quantity || 0), 0))}</strong></span></div>
        {productDetailSaveState && <p className="form-message">{productDetailSaveState}</p>}
        <div className="modal-actions">{productDetailReadOnly ? <button type="button" className="primary-button" onClick={closeProductDetail}>Ok</button> : <><button type="button" className="secondary-button" onClick={closeProductDetail}>{productDetailSale.canceledAt || productDetailSale.invoiceNumber ? "Cerrar" : "Cancelar"}</button>{!productDetailSale.canceledAt && !productDetailSale.invoiceNumber && <button type="button" className="primary-button" onClick={() => void saveProductDetail()}>Guardar cambios</button>}</>}</div>
      </section></div>}

      {cancelSale && <div className="modal-backdrop modal-backdrop-elevated"><form className="sale-modal cancellation-modal" onSubmit={confirmCancelSale}>
        <div className="modal-heading"><div><p className="eyebrow">Conservar historial</p><h2>Delete / cancelar venta</h2><p className="modal-intro">La venta y su Sales Order no desaparecerán. Quedarán marcados como cancelados con el motivo registrado.</p></div></div>
        <section className="form-section"><div className="cancellation-sale-summary"><strong>{cancelSale.customer}</strong><span>Pickup #{cancelSale.pickupNumber}</span><span>{number.format(cancelSale.boxes)} bultos/cajas</span></div><div className="form-grid">
          <label>¿Quién canceló? *<select required value={cancelParty} onChange={(event) => { const party = event.target.value as "CLIENTE CANCELÓ" | "NW CANCELÓ"; setCancelParty(party); setCancelReason(party === "CLIENTE CANCELÓ" ? "Sin Razón" : "Producto no disponible"); }}><option>CLIENTE CANCELÓ</option><option>NW CANCELÓ</option></select></label>
          <label>Razón *<select required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>{(cancelParty === "CLIENTE CANCELÓ" ? customerCancellationReasons : nwCancellationReasons).map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
        </div></section>
        {cancelSaveState && <p className="form-message">{cancelSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCancelSale(null)}>Regresar</button><button type="submit" className="danger-button">Confirmar cancelación</button></div>
      </form></div>}

      {adjustmentSale && <div className="modal-backdrop adjustment-modal-backdrop"><form className="sale-modal sale-modal-wide adjustment-modal" onSubmit={saveInvoiceAdjustment}>
        <div className="modal-heading"><div><p className="eyebrow">Ajuste posterior a facturación</p><h2>Factura {adjustmentSale.invoiceNumber}</h2><p className="modal-intro">La factura original permanecerá intacta. El sistema generará una nota ligada a ella por la diferencia.</p></div></div>
        <section className="form-section adjustment-reason-section"><div className="form-grid"><label>Motivo<select value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value as InvoiceAdjustment["reason"])}><option>CAMBIO DE PRECIO</option><option>CALIDAD</option><option>RECHAZO PARCIAL</option><option>PRODUCTO ELIMINADO</option><option>CARGA POR ERROR</option><option>OTRO</option></select></label><label className="span-2">Descripción del ajuste<input required value={adjustmentNotes} onChange={(event) => setAdjustmentNotes(event.target.value)} placeholder="Ej. Rechazo parcial por calidad; se acreditan 25 cajas. ESTE TEXTO APARECERÁ EN LA FACTURA AJUSTADA" /></label><label className="span-3">Descripción Detallada para NORWEST PRODUCE<input value={adjustmentInternalNotes} onChange={(event) => setAdjustmentInternalNotes(event.target.value)} placeholder="Notas internas de seguimiento. No aparecen en la factura ajustada." /></label></div></section>
        <div className="adjustment-items">{adjustmentItems.map((item, index) => { const original = adjustmentOriginalItems[index] || item; const remaining = Math.max(0, Number(original.quantity || 0) - Number(item.quantity || 0)); return <article key={`${item.product}-${index}`}><label><span>Producto</span><input readOnly value={invoiceItemDescription(original)} /></label><label><span>Bultos/Cajas a Ajustar</span><input disabled={Boolean(item.noAdjustment)} min="1" max={original.quantity} step="1" type="number" value={item.quantity} onChange={(event) => setAdjustmentItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} /></label><label><span>Precio</span>{moneyField(item.unitPrice, (value) => setAdjustmentItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, unitPrice: Number(value) } : row)), false, Boolean(item.noAdjustment))}</label><strong>{item.noAdjustment ? money.format(original.quantity * original.unitPrice) : <><span>{money.format(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span>{remaining > 0 && <small>{number.format(remaining)} cajas quedan a {money.format(original.unitPrice)}</small>}</>}</strong><label className="adjustment-no-change"><input type="checkbox" checked={Boolean(item.noAdjustment)} onChange={(event) => setAdjustmentItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, noAdjustment: event.target.checked } : row))} /><span>Sin ajuste</span></label></article>; })}</div>
        <div className="adjustment-summary"><span>Total vigente <strong>{money.format(adjustmentOriginalTotal)}</strong></span><span>Nuevo total <strong>{money.format(adjustmentComputedTotal)}</strong></span><span>Diferencia <strong>{money.format(adjustmentComputedTotal - adjustmentOriginalTotal)}</strong></span></div>
        {adjustmentSaveState && <p className="form-message">{adjustmentSaveState}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={closeInvoiceAdjustment}>Cancelar</button><button type="submit" className="primary-button">Generar ajuste</button></div>
      </form></div>}

      {statementCustomer && <div className="modal-backdrop invoice-preview-backdrop statement-preview-backdrop"><section className="sale-modal invoice-preview-modal statement-preview-modal">
        <div className="invoice-toolbar"><div><p className="eyebrow">Cuentas por cobrar</p><h2>Statement · {statementCustomer}</h2></div><div><button type="button" className="secondary-button" onClick={() => setStatementCustomer(null)}>Cerrar</button><button type="button" className="primary-button" onClick={() => window.print()}>Imprimir / Guardar PDF</button></div></div>
        <article className="print-document commercial-document statement-print-document">
          <div className="statement-header"><div className="document-company"><img src="/norwest-logo.jpg" alt="Norwest Produce" width="390" height="142" /><div><strong>{companyForm.legalName}</strong><span>{companyForm.street}</span><span>{[companyForm.city, companyForm.state, companyForm.postalCode].filter(Boolean).join(", ")}</span></div></div><div className="statement-title"><span>ACCOUNT</span><h3>STATEMENT</h3><dl><dt>Statement Date:</dt><dd>{formatDocumentDate(localDateKey())}</dd><dt>Terms:</dt><dd>21 Days</dd></dl></div></div>
          <div className="statement-customer"><small>STATEMENT FOR:</small><strong>{statementCustomer}</strong>{partnerAddress(partners.find((partner) => partner.partnerType === "CUSTOMER" && partner.name === statementCustomer)).map((line) => <span key={line}>{line}</span>)}</div>
          <table className="statement-table"><thead><tr><th>Invoice</th><th>Invoice Date</th><th>Due Date</th><th>PO #</th><th>Pickup #</th><th>Status</th><th className="numeric">Amount Due</th></tr></thead><tbody>{statementRows.map((row) => <tr key={row.id}><td><strong>#{row.invoiceNumber}</strong></td><td>{formatDocumentDate(row.saleDate)}</td><td>{formatDocumentDate(row.dueDate)}</td><td>{row.purchaseOrder || "N/A"}</td><td>{row.pickupNumber}</td><td><span className={`statement-status ${collectionStatus(row) === "VENCIDAS" ? "overdue" : ""}`}>{collectionStatus(row) === "VENCIDAS" ? `PAST DUE · ${agingLabel(row)}` : "CURRENT"}</span></td><td className="numeric">{money.format(row.total ?? 0)}</td></tr>)}</tbody><tfoot><tr><td colSpan={6}>TOTAL BALANCE DUE:</td><td className="numeric">{money.format(statementRows.reduce((sum, row) => sum + (row.total ?? 0), 0))}</td></tr></tfoot></table>
          {statementRows.length === 0 && <p className="statement-empty">This customer has no outstanding invoices.</p>}
          <div className="statement-remit"><section><small>PLEASE REMIT PAYMENT TO:</small><strong>BANKING INFORMATION:</strong><span>Bank: IBC BANK</span><span>Acc. Name: NORWEST PRODUCE LLC</span><span>Acc. Number: 2516358520</span><span>Wire Routing: 114902528</span></section><section><small>ADDRESS:</small><strong>1 S Broadway St.</strong><span>McAllen, Tx. 78501</span></section></div>
          <footer className="statement-footer"><span>Thank you for your business.</span><strong>{money.format(statementRows.reduce((sum, row) => sum + (row.total ?? 0), 0))} DUE</strong></footer>
        </article>
      </section></div>}

      {invoicePreview && !adjustmentPreview && <div className="modal-backdrop invoice-preview-backdrop"><section className="sale-modal invoice-preview-modal">
        <div className="invoice-toolbar"><div><p className="eyebrow">Vista previa</p><h2>Factura {invoicePreview.invoiceNumber}</h2></div><div><button type="button" className="secondary-button" onClick={() => openInvoiceAdjustment(invoicePreview)}>Crear ajuste</button><button type="button" className="secondary-button" onClick={() => setInvoicePreview(null)}>Cerrar</button><button type="button" className="primary-button" onClick={() => window.print()}>Imprimir PDF</button></div></div>
        {invoicePreview.canceledAt && <div className="canceled-record-notice"><strong>Venta cancelada</strong><span>{invoicePreview.canceledBy} · {invoicePreview.cancellationReason}</span></div>}{adjustmentsFor(invoicePreview).length > 0 && <div className="invoice-adjustment-history"><strong>Ajustes registrados</strong>{adjustmentsFor(invoicePreview).map((adjustment) => <article key={adjustment.number}><div><b>{adjustment.number}</b><span>{new Date(adjustment.createdAt).toLocaleString("es-MX")} · {adjustment.documentType}</span></div><p><strong>{adjustment.reason}</strong> · {adjustment.notes}</p>{adjustment.internalNotes && <p><strong>Interno Norwest:</strong> {adjustment.internalNotes}</p>}<ul>{adjustmentChanges(adjustment).map((change) => <li key={change}>{change}</li>)}</ul><button type="button" onClick={() => setAdjustmentPreview({ sale: invoicePreview, adjustment })}>Ver / imprimir ajuste</button></article>)}</div>}
        <article className="print-document commercial-document invoice-document">
          <div className="document-top"><div className="document-company"><img src="/norwest-logo.jpg" alt="Norwest Produce" width="390" height="142" /><div><strong>{companyForm.legalName}</strong><span>{companyForm.street}</span><span>{[companyForm.city, companyForm.state, companyForm.postalCode].filter(Boolean).join(", ")}</span></div></div><div className="document-title-block"><h3><span>INVOICE:</span><b>{invoicePreview.invoiceNumber}</b></h3><dl><dt>ISSUED:</dt><dd>{formatDocumentDate(invoicePreview.saleDate)}</dd><dt>P.O. #:</dt><dd>{invoicePreview.purchaseOrder || "N/A"}</dd><dt>PICKUP #:</dt><dd>{invoicePreview.pickupNumber}</dd><dt>PICKUP DATE:</dt><dd>{formatDocumentDate(invoicePreview.pickupDate)}</dd><dt>CREDIT TERMS:</dt><dd>21 Days</dd><dt>DUE DATE:</dt><dd>{formatDocumentDate(invoicePreview.dueDate)}</dd></dl></div></div>
          <div className="document-parties two-columns"><section><h4>BILL TO:</h4><strong>{invoicePreview.customer}</strong>{partnerAddress(documentCustomer).map((line) => <span key={line}>{line}</span>)}</section><section><h4>SHIP TO:</h4><strong>{invoicePreview.warehouse}</strong>{documentWarehouse ? <><span>{documentWarehouse.address}</span><span>PH: {formatPhone(documentWarehouse.phone)}</span></> : <span>Pickup destination</span>}</section></div>
          <table className="document-items"><thead><tr><th>Description</th><th>Size</th><th>Label</th><th>Unit</th><th className="numeric">Qty</th><th className="numeric">Unit Price</th><th className="numeric">Total</th></tr></thead><tbody>{documentItems.map((item, index) => <tr key={index}><td>{item.product}</td><td>{item.size || "—"}</td><td>{item.label || "—"}</td><td>{item.presentation || "—"}</td><td className="numeric">{number.format(item.quantity)}</td><td className="numeric">{money.format(item.unitPrice)}</td><td className="numeric">{money.format(item.quantity * item.unitPrice)}</td></tr>)}{Array.from({ length: Math.max(0, 5 - documentItems.length) }).map((_, index) => <tr className="empty-item-row" key={`empty-${index}`}><td /><td /><td /><td /><td /><td /><td /></tr>)}</tbody><tfoot><tr><td colSpan={6}>TOTAL:</td><td className="numeric">{money.format(documentTotal)}</td></tr></tfoot></table>
          <p className="amount-words">{amountInWords(documentTotal)}</p>
          <p className="remit-note">Please remit payments to:</p><div className="payment-details"><section><strong>BANKING INFORMATION:</strong><span>Bank: IBC BANK</span><span>Acc. Name: NORWEST PRODUCE LLC</span><span>Acc. Number: 2516358520</span><span>Wire Routing: 114902528</span></section><section><strong>ADDRESS:</strong><span>1 S Broadway St</span><span>McAllen, TX. 78501</span></section></div>
          {invoicePreview.bolFileName && (invoicePreview.bolObjectKey ? <a className="invoice-bol-link" href={`/api/usa/invoices?saleId=${invoicePreview.id}`} target="_blank" rel="noreferrer">BOL adjunto: {invoicePreview.bolFileName}</a> : <span className="invoice-bol-link">BOL registrado sin archivo descargable: {invoicePreview.bolFileName}</span>)}
          <p className="document-terms invoice-terms">{INVOICE_TERMS}</p>
        </article>
      </section></div>}

      {adjustmentPreview && <div className="modal-backdrop invoice-preview-backdrop adjustment-preview-backdrop"><section className="sale-modal invoice-preview-modal">
        <div className="invoice-toolbar"><div><p className="eyebrow">Vista previa del ajuste</p><h2>{adjustmentPreview.adjustment.number}</h2></div><div><button type="button" className="secondary-button" onClick={() => setAdjustmentPreview(null)}>Volver a factura</button><button type="button" className="primary-button" onClick={() => window.print()}>Imprimir ajuste en PDF</button></div></div>
        <div className="adjustment-document-summary"><div><span>Factura original</span><strong>{adjustmentPreview.sale.invoiceNumber}</strong></div><div><span>Tipo</span><strong>{adjustmentPreview.adjustment.documentType}</strong></div><div><span>Motivo</span><strong>{adjustmentPreview.adjustment.reason}</strong></div><div><span>Diferencia</span><strong>{money.format(adjustmentPreview.adjustment.difference)}</strong></div><p>{adjustmentPreview.adjustment.notes}</p></div>
        <article className="print-document commercial-document invoice-document adjustment-print-document">
          <div className="document-top"><div className="document-company"><img src="/norwest-logo.jpg" alt="Norwest Produce" width="390" height="142" /><div><strong>{companyForm.legalName}</strong><span>{companyForm.street}</span><span>{[companyForm.city, companyForm.state, companyForm.postalCode].filter(Boolean).join(", ")}</span></div></div><div className="document-title-block"><h3><span>ADJUSTED INVOICE:</span><b>{adjustmentPreview.sale.invoiceNumber}</b></h3><dl><dt>ADJUSTMENT:</dt><dd>{adjustmentPreview.adjustment.number}</dd><dt>ISSUED:</dt><dd>{formatDocumentDate(adjustmentPreview.adjustment.createdAt.slice(0, 10))}</dd><dt>P.O. #:</dt><dd>{adjustmentPreview.sale.purchaseOrder || "N/A"}</dd><dt>PICKUP #:</dt><dd>{adjustmentPreview.sale.pickupNumber}</dd><dt>DUE DATE:</dt><dd>{formatDocumentDate(adjustmentPreview.sale.dueDate)}</dd></dl></div></div>
          <div className="document-parties two-columns"><section><h4>BILL TO:</h4><strong>{adjustmentPreview.sale.customer}</strong>{partnerAddress(partners.find((item) => item.partnerType === "CUSTOMER" && item.name === adjustmentPreview.sale.customer)).map((line) => <span key={line}>{line}</span>)}</section><section><h4>SHIP TO:</h4><strong>{adjustmentPreview.sale.warehouse}</strong><span>Pickup #{adjustmentPreview.sale.pickupNumber}</span></section></div>
          <table className="document-items"><thead><tr><th>Description</th><th>Size</th><th>Label</th><th>Unit</th><th className="numeric">Qty</th><th className="numeric">Unit Price</th><th className="numeric">Total</th></tr></thead><tbody>{adjustmentPreview.adjustment.adjustedItems.map((item, index) => <tr key={index}><td>{item.product}{isAdjustedInvoiceItem(item, adjustmentPreview.adjustment.previousItems) && <strong className="adjusted-line-mark">**Adjusted</strong>}</td><td>{item.size || "—"}</td><td>{item.label || "—"}</td><td>{item.presentation || "—"}</td><td className="numeric">{number.format(item.quantity)}</td><td className="numeric">{money.format(item.unitPrice)}</td><td className="numeric">{money.format(item.quantity * item.unitPrice)}</td></tr>)}{Array.from({ length: Math.max(0, 5 - adjustmentPreview.adjustment.adjustedItems.length) }).map((_, index) => <tr className="empty-item-row" key={`adjustment-empty-${index}`}><td /><td /><td /><td /><td /><td /><td /></tr>)}</tbody><tfoot><tr><td colSpan={6}>CORRECTED TOTAL:</td><td className="numeric">{money.format(adjustmentPreview.adjustment.adjustedTotal)}</td></tr></tfoot></table>
          <p className="amount-words">{amountInWords(adjustmentPreview.adjustment.adjustedTotal)}</p><div className="printed-adjustment-detail"><strong>Adjustment detail</strong><span>{adjustmentPreview.adjustment.reason} · {adjustmentPreview.adjustment.notes}</span><span>Original total: {money.format(adjustmentPreview.adjustment.previousTotal)} · Difference: {money.format(adjustmentPreview.adjustment.difference)}</span></div><p className="document-terms invoice-terms">{INVOICE_TERMS}</p>
        </article>
      </section></div>}

      {socPreview && <div className="modal-backdrop invoice-preview-backdrop"><section className="sale-modal invoice-preview-modal">
        <div className="invoice-toolbar"><div><p className="eyebrow">Vista previa</p><h2>Sales Order Confirmation {socPreview.pickupNumber}</h2></div><div><button type="button" className="secondary-button" onClick={() => setSocPreview(null)}>Cerrar</button><button type="button" className="primary-button" onClick={() => window.print()}>Imprimir PDF</button></div></div>
        {socPreview.canceledAt && <div className="canceled-record-notice"><strong>Venta cancelada</strong><span>{socPreview.canceledBy} · {socPreview.cancellationReason}</span></div>}<article className="print-document commercial-document soc-document">
          <div className="document-top"><div className="document-company"><img src="/norwest-logo.jpg" alt="Norwest Produce" width="390" height="142" /><div><strong>{companyForm.legalName}</strong><span>{companyForm.street}</span><span>{[companyForm.city, companyForm.state, companyForm.postalCode].filter(Boolean).join(", ")}</span></div></div><div className="document-title-block soc-title"><h3>SALES CONFIRMATION</h3><dl><dt>ORDER #:</dt><dd>{socPreview.pickupNumber}</dd><dt>DATE:</dt><dd>{formatDocumentDate(socPreview.saleDate)}</dd></dl></div></div>
          <div className="document-parties three-columns"><section><h4>CUSTOMER:</h4><strong>{socPreview.customer}</strong>{partnerAddress(documentCustomer).map((line) => <span key={line}>{line}</span>)}</section><section><h4>SHIP TO:</h4><strong>{socPreview.shipTo || socPreview.warehouse}</strong><span>{documentWarehouse?.address || "Destination address pending"}</span></section><section><h4>WAREHOUSE:</h4><strong>{documentWarehouse?.name || socPreview.warehouse}</strong>{documentWarehouse && <><span>{documentWarehouse.address}</span><span>PH: {formatPhone(documentWarehouse.phone)}</span></>}</section></div>
          <dl className="soc-order-meta"><div><dt>P.O. Date</dt><dd>{formatDocumentDate(socPreview.saleDate)}</dd></div><div><dt>P.O. #</dt><dd>{socPreview.purchaseOrder || "N/A"}</dd></div><div><dt>P.U. #</dt><dd>{socPreview.pickupNumber}</dd></div><div><dt>Buyer</dt><dd>{documentCustomer?.contactName || "Pending"}</dd></div><div><dt>Ship Terms</dt><dd>{socPreview.shipTo || socPreview.warehouse}</dd></div><div><dt>Payment Terms</dt><dd>21 Days</dd></div></dl>
          <table className="document-items"><thead><tr><th>Description</th><th>Size</th><th>Label</th><th>Unit</th><th className="numeric">Qty</th><th className="numeric">Unit Price</th><th className="numeric">Total</th></tr></thead><tbody>{documentItems.map((item, index) => <tr key={index}><td>{item.product}</td><td>{item.size || "—"}</td><td>{item.label || "—"}</td><td>{item.presentation || "—"}</td><td className="numeric">{number.format(item.quantity)}</td><td className="numeric">{money.format(item.unitPrice)}</td><td className="numeric">{money.format(item.quantity * item.unitPrice)}</td></tr>)}{Array.from({ length: Math.max(0, 5 - documentItems.length) }).map((_, index) => <tr className="empty-item-row" key={`empty-${index}`}><td /><td /><td /><td /><td /><td /><td /></tr>)}</tbody><tfoot><tr><td colSpan={6}>TOTAL:</td><td className="numeric">{money.format(documentTotal)}</td></tr></tfoot></table>
          <p className="amount-words">{amountInWords(documentTotal)}</p>
          <p className="document-terms soc-terms">{SALES_ORDER_TERMS}</p>
        </article>
      </section></div>}
    </main>
  );
}
