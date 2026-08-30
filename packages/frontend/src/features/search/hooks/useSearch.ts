import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SearchResponse = {
  query: string;
  contacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    role: string;
  }>;
  items: Array<{
    id: string;
    name: string;
    sku: string | null;
    sellingPrice: string;
    costPrice: string;
  }>;
  services: Array<{
    id: string;
    name: string;
    pricingType: string;
    fixedProfit: string | null;
    commissionPct: string | null;
  }>;
  totalCount: number;
};

export function useSearch(query: string) {
  return useQuery<SearchResponse>({
    queryKey: ['search', query],
    queryFn: () => api.get<SearchResponse>(`/search?q=${encodeURIComponent(query)}&limit=5`),
    enabled: query.trim().length >= 1,
    staleTime: 10000,
  });
}
