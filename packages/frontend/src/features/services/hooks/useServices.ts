import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PricingType = 'FIXED' | 'COMMISSION';

export type Service = {
  id: string;
  name: string;
  description?: string | null;
  supplierId: string;
  pricingType: PricingType;
  fixedProfit: string | null;
  // Backend field is commissionPct; brief says commissionRate — support both for compatibility
  commissionPct: string | null;
  commissionRate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  supplier?: {
    id: string;
    name: string;
    role?: string;
  };
};

export type ContactForSupplier = {
  id: string;
  name: string;
  role: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  isActive: boolean;
};

type CreateServicePayload = {
  name: string;
  supplierId: string;
  pricingType: PricingType;
  fixedProfit?: string;
  commissionPct?: string;
  // alias for brief compatibility (will be mapped to commissionPct)
  commissionRate?: string;
};

type UpdateServicePayload = {
  name?: string;
  pricingType?: PricingType;
  fixedProfit?: string;
  commissionPct?: string;
  commissionRate?: string;
};

function normalizeCommissionPayload(payload: Record<string, unknown>) {
  // Map commissionRate -> commissionPct if present
  if ('commissionRate' in payload && !('commissionPct' in payload)) {
    payload.commissionPct = payload.commissionRate;
    delete payload.commissionRate;
  } else if ('commissionRate' in payload) {
    delete payload.commissionRate;
  }
  return payload;
}

export function useServicesQuery() {
  return useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
  });
}

export function useContactsForSupplierQuery() {
  return useQuery<ContactForSupplier[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<ContactForSupplier[]>('/contacts'),
    select: (contacts) => contacts.filter((c) => c.role === 'SUPPLIER' || c.role === 'BOTH'),
  });
}

export function useCreateServiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServicePayload) => {
      const body = normalizeCommissionPayload({ ...payload } as Record<string, unknown>);
      return api.post<Service>('/services', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useUpdateServiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateServicePayload }) => {
      const body = normalizeCommissionPayload({ ...payload } as Record<string, unknown>);
      return api.patch<Service>(`/services/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useDeactivateServiceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/services/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
}
