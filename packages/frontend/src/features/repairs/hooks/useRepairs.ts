import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
  invoiceNumber?: string | null;
  notes?: string | null;
  physicalCondition?: string | null;
  hasPasscode: boolean;
  accessories?: string | null;
  receivedAt: string;
  deliveredAt?: string | null;
  createdAt: string;
  contact?: { id: string; name: string };
};

export type CreateRepairTicketDto = {
  contactId: string;
  deviceType: string;
  deviceBrand: string;
  deviceModel: string;
  problemDescription: string;
  repairType?: string;
  technicianName?: string;
  estimatedCost?: string;
  depositAmount?: string;
  notes?: string;
  physicalCondition?: string;
  hasPasscode?: boolean;
  accessories?: string;
};

export type UpdateRepairStatusDto = {
  status: string;
  actualCost?: string;
  notes?: string;
};

export function useRepairsQuery(filters?: { status?: string; contactId?: string; repairType?: string }) {
  return useQuery<RepairTicket[]>({
    queryKey: ['repairs', filters ?? null],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filters?.status) p.set('status', filters.status);
      if (filters?.contactId) p.set('contactId', filters.contactId);
      if (filters?.repairType) p.set('repairType', filters.repairType);
      const qs = p.toString();
      return api.get<RepairTicket[]>(`/repair${qs ? `?${qs}` : ''}`);
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repairs'] });
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
    },
  });
}
