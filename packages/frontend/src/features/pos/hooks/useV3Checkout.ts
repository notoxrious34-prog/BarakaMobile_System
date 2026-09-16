import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { salesV3Api } from '@/api/v3/commercial';
import type { SaleResult } from '@/api/v3/types';
import { buildV3SalePayload, summarizeV3SaleError, type CheckoutInput } from '../utils/buildV3Sale';

/**
 * DIRECTIVE-021 Stage 10.2 — v3 POS checkout mutation.
 *
 * Wraps `salesV3Api.createSale` with payload mapping, double-submit
 * protection (`isPending` — the button disables while mutating) and the
 * SDK's automatic `x-idempotency-key`. Failures surface as friendly
 * Arabic messages (credit-limit 422, stock 422, …) for banner display.
 */
export function useV3Checkout() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: CheckoutInput): Promise<SaleResult> => salesV3Api.createSale(buildV3SalePayload(input)),
    onMutate: () => setErrorMessage(null),
    onError: (error: unknown) => setErrorMessage(summarizeV3SaleError(error)),
  });
  return {
    submit: (input: CheckoutInput) => mutation.mutateAsync(input),
    isSubmitting: mutation.isPending,
    errorMessage,
    clearError: () => setErrorMessage(null),
    data: mutation.data ?? null,
  };
}
