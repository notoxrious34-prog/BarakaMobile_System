/**
 * DIRECTIVE-016 Stage 7.2 — fund-wallet DTO (v3.0 Flexy engine).
 *
 * Moves till/bank liquidity into the 10100 float: Dr 10100 / Cr 10000
 * (CASH) or Cr 10200 (BANK). Amounts are decimal strings (Rule ③).
 */
export interface FundWalletDto {
  walletId: string;
  amount: string;
  sourceAccount: 'CASH' | 'BANK';
  notes?: string;
  actorUserId: string;
}
