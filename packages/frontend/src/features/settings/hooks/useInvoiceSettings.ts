import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useInvoiceSettings() {
  return useQuery<Record<string, string>>({
    queryKey: ['settings', 'invoice'],
    queryFn: () =>
      api.get<Record<string, string>>(
        '/settings/bulk?keys=business_name,business_phone,business_address,currency_symbol,invoice_footer_note',
      ),
    staleTime: 300000,
  });
}
