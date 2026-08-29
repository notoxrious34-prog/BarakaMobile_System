import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type Item = {
  id: string;
  name: string;
  sku: string | null;
  costPrice: string;
  sellingPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  currentStock?: number;
  description?: string | null;
  unit?: string;
  minStock?: number;
};

export type StockMovement = {
  id: string;
  itemId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  note: string | null;
  createdAt: string;
  reference?: string | null;
};

type CreateItemPayload = {
  name: string;
  sku?: string;
  costPrice: string;
  sellingPrice: string;
};

type UpdateItemPayload = {
  name?: string;
  sku?: string;
  costPrice?: string;
  sellingPrice?: string;
};

type CreateMovementPayload = {
  itemId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  note?: string;
};

export function useItemsQuery() {
  return useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: () => api.get<Item[]>('/inventory/items'),
  });
}

export function useItemStockQuery(itemId: string) {
  return useQuery<{ itemId: string; currentStock: number }>({
    queryKey: ['item-stock', itemId],
    queryFn: async () => {
      // Backend does not expose /items/:id/stock; the single-item endpoint
      // returns the item with currentStock. Adapt here to keep the hook
      // contract while staying compatible with the actual API.
      try {
        const res = await api.get<{ currentStock: number; id: string }>(
          `/inventory/items/${itemId}`,
        );
        return { itemId, currentStock: res.currentStock ?? 0 };
      } catch {
        // Fallback: try dedicated stock endpoint if it ever exists
        const stock = await api.get<{ itemId: string; currentStock: number }>(
          `/inventory/items/${itemId}/stock`,
        );
        return stock;
      }
    },
    enabled: !!itemId && itemId.length > 0,
  });
}

export function useCreateItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateItemPayload) => api.post<Item>('/inventory/items', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateItemPayload }) =>
      api.patch<Item>(`/inventory/items/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useDeactivateItemMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/inventory/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useCreateMovementMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMovementPayload) =>
      api.post<StockMovement>('/inventory/movements', payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['item-stock', variables.itemId] });
    },
  });
}
