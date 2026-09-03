import { useEffect, useRef, useState } from 'react';
import {
  useContactsQuery,
  useCreateContactMutation,
  type Contact,
} from '@/features/contacts/hooks/useContacts';

export const WALKIN_NAME = 'عميل نقدي';
const LS_KEY = 'pos.walkinAccountId';

function pickCustomerAccount(c: Contact): string | null {
  const acc = (c.accounts ?? []).find((a) => a.role === 'CUSTOMER');
  return acc ? acc.id : null;
}

/**
 * Walk-in (cash) customer account provisioning — frontend only.
 * Order: localStorage cache → find existing contact by exact name →
 * create CUSTOMER contact (phone optional server-side), then cache.
 */
export function useWalkinAccount() {
  const [accountId, setAccountId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);
  const contactsQ = useContactsQuery();
  const createMut = useCreateContactMutation();

  useEffect(() => {
    if (accountId || !contactsQ.data || runningRef.current) return;
    runningRef.current = true;
    (async () => {
      try {
        const existing = contactsQ.data.find((c) => c.name === WALKIN_NAME);
        if (existing) {
          const acc = pickCustomerAccount(existing);
          if (acc) {
            setAccountId(acc);
            try {
              localStorage.setItem(LS_KEY, acc);
            } catch {
              /* non-fatal */
            }
            return;
          }
        }
        const created = await createMut.mutateAsync({
          name: WALKIN_NAME,
          phone: '',
          role: 'CUSTOMER',
        });
        const acc = pickCustomerAccount(created);
        if (!acc) throw new Error('تعذر إنشاء حساب العميل النقدي');
        setAccountId(acc);
        try {
          localStorage.setItem(LS_KEY, acc);
        } catch {
          /* non-fatal */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر تجهيز العميل النقدي');
        runningRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, contactsQ.data]);

  return {
    accountId,
    isResolving: accountId === null && error === null,
    error,
  };
}
