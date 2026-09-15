import type { Money } from '../../../core/money';

/**
 * DIRECTIVE-014 Stage 6.2 — delivery DTOs (v3.0 workshop engine).
 *
 * `RepairPaymentInput` mirrors the POS split-payment shape
 * (`CASH` / `DIGITAL_WALLET` / `BANK_TRANSFER` + amount); `walletId` is
 * reserved for provider settlement in a later stage. Amounts are decimal
 * strings or Money (Rule ②/③).
 */
export interface RepairPaymentInput {
  paymentMethod: 'CASH' | 'DIGITAL_WALLET' | 'BANK_TRANSFER';
  amount: string | Money;
  walletId?: string;
}

export interface DeliverRepairOrderDto {
  repairOrderId: string;
  payments: RepairPaymentInput[];
  discountAmount?: string | Money;
  actorUserId?: string;
}
