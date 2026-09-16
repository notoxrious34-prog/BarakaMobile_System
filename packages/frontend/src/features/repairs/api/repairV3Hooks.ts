import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repairsV3Api } from '@/api/v3/workshop';
import type {
  AddPartPayload,
  CreateRepairPayload,
  DeliverRepairPayload,
  UpdateRepairStatusPayload,
} from '@/api/v3/types';

/**
 * DIRECTIVE-022 Stage 10.3 — v3 repair react-query bindings.
 *
 * Order detail query plus atomic actions (status advance, part consume,
 * delivery, intake). `['v3-repair', id]` invalidation keeps the workbench
 * — parts list, WIP total, financial balance — fresh after every write.
 */
export function v3RepairKey(id: string | null) {
  return ['v3-repair', id ?? 'none'];
}

export function useV3RepairOrder(id: string | null) {
  return useQuery({
    queryKey: v3RepairKey(id),
    queryFn: () => repairsV3Api.getRepairById(id as string),
    enabled: id !== null,
  });
}

export function useV3CreateRepairMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRepairPayload) => repairsV3Api.createRepair(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['v3-repair'] });
    },
  });
}

export function useV3RepairActions(id: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: v3RepairKey(id) });
  };
  const status = useMutation({
    mutationFn: (payload: UpdateRepairStatusPayload) => repairsV3Api.updateStatus(id, payload),
    onSuccess: invalidate,
  });
  const addPart = useMutation({
    mutationFn: (payload: AddPartPayload) => repairsV3Api.addPart(id, payload),
    onSuccess: invalidate,
  });
  const deliver = useMutation({
    mutationFn: (payload: DeliverRepairPayload) => repairsV3Api.deliverRepair(id, payload),
    onSuccess: invalidate,
  });
  return { status, addPart, deliver };
}
