export type InventoryAllocation = { inventoryLotId: number; quantity: number };

export function groupInventoryAllocations(allocations: InventoryAllocation[]) {
  const grouped = new Map<number, number>();
  for (const allocation of allocations) {
    grouped.set(allocation.inventoryLotId, (grouped.get(allocation.inventoryLotId) || 0) + allocation.quantity);
  }
  return [...grouped].map(([inventoryLotId, quantity]) => ({ inventoryLotId, quantity }));
}

export function inventoryAllocationDelta(previous: InventoryAllocation[], next: InventoryAllocation[]) {
  const previousByLot = new Map(groupInventoryAllocations(previous).map((item) => [item.inventoryLotId, item.quantity]));
  const nextByLot = new Map(groupInventoryAllocations(next).map((item) => [item.inventoryLotId, item.quantity]));
  const lotIds = new Set([...previousByLot.keys(), ...nextByLot.keys()]);
  const reserve: InventoryAllocation[] = [];
  const release: InventoryAllocation[] = [];

  for (const inventoryLotId of lotIds) {
    const difference = (nextByLot.get(inventoryLotId) || 0) - (previousByLot.get(inventoryLotId) || 0);
    if (difference > 0) reserve.push({ inventoryLotId, quantity: difference });
    if (difference < 0) release.push({ inventoryLotId, quantity: -difference });
  }

  return { reserve, release };
}
