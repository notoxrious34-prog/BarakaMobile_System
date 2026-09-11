import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type RepairPartItem = {
  id: string;
  ticketId: string;
  inventoryItemId: string;
  quantity: number;
  unitCostPrice: string;
  unitPrice: string;
  totalCost: string;
  totalPrice: string;
  stockMovementId?: string | null;
  createdAt: string;
  inventoryItem?: { id: string; name: string; sku: string | null };
};

export type RepairTicket = {
  id: string;
  ticketNumber: string;
  contactId: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  problemDescription: string;
  status: string;
  repairType: string;
  technicianName?: string | null;
  estimatedCost: string;
  actualCost: string;
  externalCost: string;
  depositAmount: string;
  depositPaid: boolean;
  laborCost?: string;
  partsCost?: string;
  partsTotal?: string;
  discountAmount?: string;
  paidAmount?: string;
  completedAt?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  physicalCondition?: string | null;
  hasPasscode: boolean;
  accessories?: string | null;
  receivedAt: string;
  deliveredAt?: string | null;
  createdAt: string;
  contact?: { id: string; name: string };
  parts?: RepairPartItem[];
};

export type RepairMetrics = {
  active: number;
  ready: number;
  deliveredToday: number;
  monthRevenue: string;
  monthPartsCost: string;
  monthNetProfit: string;
  consumedPartsQty: number;
};

export type CreateRepairTicketDto = {
  contactId: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  problemDescription: string;
  repairType?: string;
  technicianName?: string;
  repairFaultTypeId?: string;
  estimatedCompletionDate?: string;
  estimatedCost?: string;
  depositAmount?: string;
  notes?: string;
  physicalCondition?: string;
  hasPasscode?: boolean;
  accessories?: string;
};

export type RepairSummary = {
  received: number;
  diagnosing: number;
  inRepair: number;
  ready: number;
  inWorkshopTotal: number;
  openTotal: number;
};

export type UpdateRepairStatusDto = {
  status: string;
  actualCost?: string;
  notes?: string;
};

/** AD-70 canonical aggregation (TB-132) — sole source for all repair counts. */
export function useRepairSummary() {
  return useQuery<RepairSummary>({
    queryKey: ['repairs', 'summary'],
    queryFn: () => api.get<RepairSummary>('/repair/summary'),
    staleTime: 30_000,
  });
}

export function useRepairsQuery(filters?: { status?: string; contactId?: string; repairType?: string; search?: string }) {
  return useQuery<RepairTicket[]>({
    queryKey: ['repairs', filters ?? null],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filters?.status) p.set('status', filters.status);
      if (filters?.contactId) p.set('contactId', filters.contactId);
      if (filters?.repairType) p.set('repairType', filters.repairType);
      if (filters?.search) p.set('search', filters.search);
      const qs = p.toString();
      return api.get<RepairTicket[]>(`/repair${qs ? `?${qs}` : ''}`);
    },
  });
}

export function useRepairMetricsQuery() {
  return useQuery<RepairMetrics>({ queryKey: ['repairs', 'metrics'], queryFn: () => api.get<RepairMetrics>('/repair/metrics') });
}

function invalidateRepair(id?: string) {
  return (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: ['repairs'] });
    if (id) qc.invalidateQueries({ queryKey: ['repair', id] });
    else qc.invalidateQueries({ queryKey: ['repair'] });
    // DIRECTIVE-004: part/financial/status writes move stock, cash and
    // dashboard counters — refresh every consumer (['repairs'] prefix
    // already covers ['repairs','metrics'] and ['repairs','summary']).
    qc.invalidateQueries({ queryKey: ['items'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['cash-balance'] });
    qc.invalidateQueries({ queryKey: ['transactions'] });
  };
}

export function useAddPartMutation(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { inventoryItemId: string; quantity: number; unitPrice?: string }) =>
      api.post<RepairTicket>(`/repair/${ticketId}/parts`, body),
    onSuccess: () => invalidateRepair(ticketId)(qc),
  });
}

export function useRemovePartMutation(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partId: string) => api.delete<RepairTicket>(`/repair/${ticketId}/parts/${partId}`),
    onSuccess: () => invalidateRepair(ticketId)(qc),
  });
}

export function useUpdateFinancialsMutation(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { laborCost?: string; discountAmount?: string }) =>
      api.patch<RepairTicket>(`/repair/${ticketId}/financials`, body),
    onSuccess: () => invalidateRepair(ticketId)(qc),
  });
}

export function useRepairOneQuery(id: string) {
  return useQuery<RepairTicket>({
    queryKey: ['repair', id],
    queryFn: () => api.get<RepairTicket>(`/repair/${id}`),
    enabled: !!id,
  });
}

export function useCreateRepairMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRepairTicketDto) => api.post<RepairTicket>('/repair', body),
    onSuccess: (created) => {
      // DIRECTIVE-004: new tickets move dashboard workshop counters.
      invalidateRepair(created?.id)(qc);
    },
  });
}

export function useUpdateStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateRepairStatusDto) => api.patch<RepairTicket>(`/repair/${id}/status`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repairs'] });
      qc.invalidateQueries({ queryKey: ['repair'] });
      // DIRECTIVE-004: status moves cash (deposits on deliver) and dashboard
      // workshop counters — refresh consumers.
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useRecordExternalCostMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, externalCost, note }: { id: string; externalCost: string; note?: string }) =>
      api.post<RepairTicket>(`/repair/${id}/external-cost`, { externalCost, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repairs'] });
      qc.invalidateQueries({ queryKey: ['repair'] });
      // DIRECTIVE-004: external spend moves cash — refresh consumers.
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
