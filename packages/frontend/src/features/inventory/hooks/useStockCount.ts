import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import {
  listStockCounts,
  getStockCount,
  createStockCount,
  scanStockCount,
  reconcileStockCount,
  cancelStockCount,
  type StockCountDetail,
} from '@/features/inventory/api/stockCountApi';

export function useStockCountsQuery() {
  return useQuery({ queryKey: ['stock-counts'], queryFn: listStockCounts });
}

export function useStockCountQuery(id: string | null) {
  return useQuery({
    queryKey: ['stock-count', id],
    queryFn: () => getStockCount(id!),
    enabled: !!id,
  });
}

export function useCreateStockCountMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createStockCount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-counts'] }),
  });
}

export function useScanStockCountMutation(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { sku?: string; inventoryItemId?: string; quantityDelta?: number; exactQuantity?: number }) =>
      scanStockCount(sessionId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-count', sessionId] });
      qc.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}

export function useReconcileStockCountMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reconcileStockCount(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['stock-count', id] });
      qc.invalidateQueries({ queryKey: ['stock-counts'] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useCancelStockCountMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelStockCount(id),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['stock-count', id] });
      qc.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });
}

export type VarianceFilter = 'ALL' | 'DIFF' | 'DEFICIT' | 'SURPLUS' | 'MATCHED';

export function useVarianceFilter(items: StockCountDetail['items'] | undefined) {
  const [filter, setFilter] = useState<VarianceFilter>('ALL');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (q !== '') {
        const hay = `${r.inventoryItem.name} ${(r.inventoryItem.sku ?? '').toLowerCase()}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      switch (filter) {
        case 'ALL': return true;
        case 'DIFF': return r.differenceQuantity !== 0;
        case 'DEFICIT': return r.differenceQuantity < 0;
        case 'SURPLUS': return r.differenceQuantity > 0;
        case 'MATCHED': return r.differenceQuantity === 0;
      }
    });
  }, [items, filter, search]);
  return { filter, setFilter, search, setSearch, filtered };
}

export function netVariance(items: StockCountDetail['items'] | undefined): string {
  try {
    let acc = new Decimal(0);
    for (const r of items ?? []) acc = acc.plus(new Decimal(r.varianceValue));
    return acc.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

// Scanner HUD beep via WebAudio (no assets, no deps).
export function useScanBeep() {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => () => { ctxRef.current?.close().catch(() => undefined); }, []);
  return (ok: boolean) => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctxRef.current ??= new AC();
      const ctx = ctxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.08;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      /* audio unavailable — visual flash still applies */
    }
  };
}
