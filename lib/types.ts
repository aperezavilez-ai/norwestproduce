export type Sale = {
  id?: number;
  sourceRow?: number;
  organizationCode?: string;
  operationType: "DIRECT_RESALE" | "IMPORTED_INVENTORY";
  supplier?: string | null;
  inventoryLotId?: number | null;
  saleDate: string;
  customer: string;
  sellerName?: string | null;
  purchaseOrder: string | null;
  warehouse: string;
  pickupNumber: string;
  boxes: number;
  product: string;
  presentation?: string | null;
  size: string | null;
  label: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  profit: number | null;
  shipDate: string | null;
  shipTo?: string | null;
  pickupDate: string | null;
  total: number | null;
  dueDate: string | null;
  loadStatus: string | null;
  statusUpdatedAt?: string | null;
  pasReviewDays?: number | null;
  pasReviewDueDate?: string | null;
  usdaInspectionStatus?: string | null;
  usdaInspectionObjectKey?: string | null;
  usdaInspectionFileName?: string | null;
  usdaInspectionContentType?: string | null;
  usdaInspectionUploadedAt?: string | null;
  paymentStatus: string | null;
  invoiceNumber: string | null;
  invoiceItems?: string | null;
  originalInvoiceItems?: string | null;
  invoiceAdjustments?: string | null;
  bolObjectKey?: string | null;
  bolFileName?: string | null;
  bolContentType?: string | null;
  bolUploadedAt?: string | null;
  canceledAt?: string | null;
  canceledBy?: "CLIENTE CANCELÓ" | "NW CANCELÓ" | null;
  cancellationReason?: string | null;
  cancellationDetail?: string | null;
};

export type InvoiceAdjustment = {
  number: string;
  createdAt: string;
  reason: "CAMBIO DE PRECIO" | "CALIDAD" | "RECHAZO PARCIAL" | "PRODUCTO ELIMINADO" | "CARGA POR ERROR" | "OTRO";
  notes: string;
  internalNotes?: string;
  previousItems: InvoiceItem[];
  adjustedItems: InvoiceItem[];
  previousTotal: number;
  adjustedTotal: number;
  difference: number;
  documentType: "NOTA DE CREDITO" | "NOTA DE DEBITO" | "SIN CAMBIO";
};

export type InvoiceItem = {
  inventoryLotId?: number;
  product: string;
  presentation: string;
  size: string;
  label: string;
  quantity: number;
  unitPrice: number;
  purchasePrice?: number;
};

export type NewSale = Omit<Sale, "id" | "sourceRow" | "organizationCode" | "profit" | "total">;

export type InventoryLot = {
  id: number;
  organizationCode: string;
  receivedDate: string;
  loadDate?: string | null;
  supplier: string | null;
  warehouse: string;
  pickupNumber: string | null;
  product: string;
  presentation: string | null;
  size: string | null;
  label: string | null;
  totalBoxes: number;
  boxesPerPallet: number | null;
  palletsPerLoad: number | null;
  availableBoxes: number;
  unitCost: number | null;
  purchasePrice: number | null;
  freightCost: number;
  mexicoCustomsCost: number;
  usCustomsCost: number;
  overweightCost: number;
  redLightCost: number;
  redLightUsCost?: number;
  coldStorage: string | null;
  coldStorageCost: number;
  additionalExpenses: string;
  attachments?: string;
  costAttachments?: string;
  costCurrencies: string;
  exchangeRate: number | null;
  totalImportCost: number | null;
  receivedConfirmedAt?: string | null;
};

export type ColdStorage = {
  id: number;
  organizationCode: string;
  name: string;
  address: string;
  phone: string;
  stateCode?: string;
  stateName?: string;
  city?: string;
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string | null;
  postalCode?: string;
};

export type Product = {
  id: number;
  organizationCode: string;
  name: string;
  alias: string;
  presentation: string | null;
  size: string | null;
  label: string | null;
  boxesPerPallet?: number | null;
};

export type PartnerType = "SUPPLIER" | "CUSTOMER";

export type BusinessPartner = {
  id: number;
  organizationCode: string;
  partnerType: PartnerType;
  name: string;
  pacaNumber: string;
  taxId: string;
  blueBookNumber: string;
  dunsNumber: string;
  street: string;
  exteriorNumber: string;
  interiorNumber: string | null;
  stateCode: string;
  stateName: string;
  city: string;
  postalCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerOfficePhone?: string;
  buyerOfficeExtension?: string;
  buyerMobilePhone?: string;
  assignedSeller: string | null;
  profitPercentage: number;
  createdAt?: string;
};

export type NewBusinessPartner = Omit<BusinessPartner, "id" | "organizationCode" | "createdAt">;

export type CompanySettings = {
  id: number;
  organizationCode: string;
  legalName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  blueBookNumber: string;
  pacaNumber: string;
  dunsNumber: string;
  taxId: string;
  norwestProfitPercentage: number;
};

export type UserAccount = {
  id: number;
  organizationCode: string;
  fullName: string;
  alias: string;
  email: string;
  permissions: string;
  active: boolean;
  createdAt?: string;
};

export type SellerLiquidation = {
  id: number;
  organizationCode: string;
  sellerName: string;
  liquidationDate: string;
  amount: number;
  notes: string | null;
  createdAt?: string;
};
