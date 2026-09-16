import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shiftsV3Api } from '@/api/v3/workshop';
import type { CloseShiftPayload, OpenShiftPayload, ShiftMovementPayload } from '@/api/v3/types';

/**
 * DIRECTIVE-021 Stage 10.2 — v3 shift react-query bindings.
 *
 * Server truth for the drawer: active-shift polling by register, atomic
 * open/close/cash-in/cash-out mutations with `['v3-shift', registerId]`
 * invalidation. Errors propagate as `V3ApiError` for `summarizeV3SaleError`
 * style UI mapping.
 */
export function shiftQueryKey(registerId: string | null) {
  return ['v3-shift', registerId ?? 'none'];
}

export function useActiveShiftQuery(registerId: string | null) {
  return useQuery({
    queryKey: shiftQueryKey(registerId),
    queryFn: () => shiftsV3Api.getActiveShift(registerId as string),
    enabled: registerId !== null,
    refetchInterval: 30_000,
  });
}

function useInvalidateShift() {
  const qc = useQueryClient();
  return (registerId: string | null) => {
    void qc.invalidateQueries({ queryKey: shiftQueryKey(registerId) });
  };
}

export function useOpenShiftMutation(registerId: string | null) {
  const invalidate = useInvalidateShift();
  return useMutation({
    mutationFn: (payload: OpenShiftPayload) => shiftsV3Api.openShift(payload),
    onSuccess: () => invalidate(registerId),
  });
}

export function useCloseShiftMutation(registerId: string | null) {
  const invalidate = useInvalidateShift();
  return useMutation({
    mutationFn: ({ shiftId, payload }: { shiftId: string; payload: CloseShiftPayload }) =>
      shiftsV3Api.closeShift(shiftId, payload),
    onSuccess: () => invalidate(registerId),
  });
}

export function useShiftCashMutation(registerId: string | null, direction: 'in' | 'out') {
  const invalidate = useInvalidateShift();
  return useMutation({
    mutationFn: ({ shiftId, payload }: { shiftId: string; payload: ShiftMovementPayload }) =>
      direction === 'in' ? shiftsV3Api.recordCashIn(shiftId, payload) : shiftsV3Api.recordCashOut(shiftId, payload),
    onSuccess: () => invalidate(registerId),
  });
}
