import { api } from '@/lib/api';

export type StockCountSession = {
  id: string;
  sessionNumber: string;
  name: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scope: 'FULL_STORE' | 'CATEGORY';
  categoryId: string | null;
  notes: string | null;
  startedAt: string;
  completedAt: string | null;
  totalItemsExpected: number;
  totalItemsCounted: number;
  totalDiscrepancyQty: number;
  totalFinancialVariance: string;
  createdAt: string;
  _count?: { items: number };
};

export type StockCountItemRow = {
  id: string;
  sessionId: string;
  inventoryItemId: string;
  expectedQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
  unitCost: string;
  varianceValue: string;
  notes: string | null;
  reconciled: boolean;
  inventoryItem: { id: string; name: string; sku: string | null; unit: string };
};

export type StockCountDetail = Omit<StockCountSession, '_count'> & { items: StockCountItemRow[] };

export async function listStockCounts(): Promise<StockCountSession[]> {
  return api.get<StockCountSession[]>('/inventory/stock-counts');
}

export async function getStockCount(id: string): Promise<StockCountDetail> {
  return api.get<StockCountDetail>(`/inventory/stock-counts/${id}`);
}

export async function createStockCount(payload: { name: string; notes?: string }): Promise<StockCountDetail> {
  return api.post<StockCountDetail>('/inventory/stock-counts', payload);
}

export async function scanStockCount(
  id: string,
  payload: { sku?: string; inventoryItemId?: string; quantityDelta?: number; exactQuantity?: number },
): Promise<StockCountItemRow> {
  return api.post<StockCountItemRow>(`/inventory/stock-counts/${id}/scan`, payload);
}

export async function reconcileStockCount(id: string): Promise<StockCountSession> {
  return api.post<StockCountSession>(`/inventory/stock-counts/${id}/reconcile`, {});
}

export async function cancelStockCount(id: string): Promise<StockCountSession> {
  return api.post<StockCountSession>(`/inventory/stock-counts/${id}/cancel`, {});
}
