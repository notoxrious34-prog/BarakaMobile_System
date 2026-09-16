/**
 * DIRECTIVE-016 Stage 7.2 — process-topup DTO (v3.0 Flexy engine).
 *
 * `costAmount` defaults to `faceAmount` (zero wholesale discount);
 * `feeAmount` defaults to "0.00". `partyId` is required for ON_ACCOUNT
 * and rejected for CASH. Amounts are decimal strings or Money (Rule ②/③).
 */
export interface ProcessTopUpDto {
  walletId: string;
  targetPhoneNumber: string;
  faceAmount: string;
  costAmount?: string;
  feeAmount?: string;
  paymentMethod: 'CASH' | 'ON_ACCOUNT';
  partyId?: string;
  actorUserId: string;
}
