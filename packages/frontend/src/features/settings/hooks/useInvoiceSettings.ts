import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface InvoiceSettings {
  business_name?: string;
  business_phone?: string;
  business_address?: string;
  business_rc?: string;
  business_nif?: string;
  business_nis?: string;
  business_art?: string;
  currency_symbol?: string;
  invoice_footer_note?: string;
}

const KEYS = [
  'business_name',
  'business_phone',
  'business_address',
  'business_rc',
  'business_nif',
  'business_nis',
  'business_art',
  'currency_symbol',
  'invoice_footer_note',
];

export function useInvoiceSettings() {
  return useQuery<InvoiceSettings>({
    queryKey: ['settings', 'invoice'],
    queryFn: () => api.get<InvoiceSettings>(`/settings/bulk?keys=${KEYS.join(',')}`),
    // TASK-BRIEF-001: near-static reference data — 10min stale, 15min gc
    // (useUpdateSettings invalidates on save, so edits stay instant).
    staleTime: 600000,
    gcTime: 900000,
  });
}
