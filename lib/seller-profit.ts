export type SellerIdentity = {
  fullName: string;
  alias?: string | null;
};

export type SellerProfitAllocationInput = {
  saleProfit: number;
  norwestProfitPercentage: number;
  assignedSeller?: string | null;
  assignedSellerPercentage?: number | null;
  sellers?: SellerIdentity[];
};

export type SellerProfitAllocation = {
  sellerName: string;
  amount: number;
};

const FALLBACK_SELLERS = {
  RR: "Ricardo Ruelas",
  GM: "GM",
} as const;

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function sellerNameFromAlias(code: keyof typeof FALLBACK_SELLERS, sellers: SellerIdentity[] = []) {
  const seller = sellers.find((item) => {
    const alias = String(item.alias || "").trim().toLocaleUpperCase();
    const fullName = String(item.fullName || "").trim().toLocaleUpperCase();
    return alias === code || fullName === code;
  });
  return seller?.fullName || FALLBACK_SELLERS[code];
}

export function normalizeSellerName(value: string | null | undefined, sellers: SellerIdentity[] = []) {
  const name = String(value || "").trim();
  if (!name) return "Sin vendedor";

  const upper = name.toLocaleUpperCase();
  const aliasUser = sellers.find((seller) => String(seller.alias || "").trim().toLocaleUpperCase() === upper);
  if (aliasUser) return aliasUser.fullName;
  if (upper === "RR") return sellerNameFromAlias("RR", sellers);
  if (upper === "GM") return sellerNameFromAlias("GM", sellers);
  return name;
}

export function calculateSellerProfitPool(saleProfit: number, norwestProfitPercentage: number) {
  const norwest = clampPercentage(Number(norwestProfitPercentage || 16));
  return Math.max(0, Number(saleProfit || 0) * ((100 - norwest) / 100));
}

export function calculateSellerProfitAllocations(input: SellerProfitAllocationInput): SellerProfitAllocation[] {
  const sellers = input.sellers || [];
  const distributableProfit = calculateSellerProfitPool(input.saleProfit, input.norwestProfitPercentage);
  const assignedPercentage = clampPercentage(Number(input.assignedSellerPercentage || 0));
  const rrGmPercentage = (100 - assignedPercentage) / 2;

  const allocations: SellerProfitAllocation[] = [
    {
      sellerName: normalizeSellerName(input.assignedSeller, sellers),
      amount: distributableProfit * (assignedPercentage / 100),
    },
    {
      sellerName: normalizeSellerName("RR", sellers),
      amount: distributableProfit * (rrGmPercentage / 100),
    },
    {
      sellerName: normalizeSellerName("GM", sellers),
      amount: distributableProfit * (rrGmPercentage / 100),
    },
  ];

  const grouped = new Map<string, number>();
  allocations.forEach((allocation) => {
    grouped.set(allocation.sellerName, (grouped.get(allocation.sellerName) || 0) + allocation.amount);
  });

  return Array.from(grouped.entries()).map(([sellerName, amount]) => ({ sellerName, amount }));
}
