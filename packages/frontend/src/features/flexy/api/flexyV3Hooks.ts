import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flexyV3Api } from '@/api/v3/workshop';
import type { FloatTransferPayload, TopUpPayload } from '@/api/v3/types';

/**
 * DIRECTIVE-023 Stage 10.4 — v3 flexy react-query bindings.
 *
 * Wallet directory query plus top-up / float-transfer mutations with
 * `['v3-flexy-wallets']` invalidation so balances refresh the moment a
 * top-up or transfer commits. Double-submit guarded by `isPending`.
 */
export function useV3WalletsQuery() {
  return useQuery({
    queryKey: ['v3-flexy-wallets'],
    queryFn: () => flexyV3Api.listWallets(),
  });
}

export function useV3FlexyActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['v3-flexy-wallets'] });
  };
  const topUp = useMutation({
    mutationFn: (payload: TopUpPayload) => flexyV3Api.topUp(payload),
    onSuccess: invalidate,
  });
  const transferFloat = useMutation({
    mutationFn: (payload: FloatTransferPayload) => flexyV3Api.transferFloat(payload),
    onSuccess: invalidate,
  });
  return { topUp, transferFloat };
}
