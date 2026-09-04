import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ContactRole = 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
export type AccountRole = 'SUPPLIER' | 'CUSTOMER';

export type Account = {
  id: string;
  contactId: string;
  role: AccountRole;
  currentBalance: string;
  openingBalance: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Contact = {
  id: string;
  name: string;
  phone: string | null;
  role: ContactRole;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  accounts: Account[];
};

type CreateContactPayload = {
  name: string;
  phone: string;
  role: ContactRole;
};

type UpdateContactPayload = {
  name?: string;
  phone?: string;
};

export function useContactsQuery() {
  return useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
  });
}

export function useCreateContactMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateContactPayload) => api.post<Contact>('/contacts', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContactMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateContactPayload }) =>
      api.patch<Contact>(`/contacts/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeactivateContactMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: boolean }>(`/contacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
