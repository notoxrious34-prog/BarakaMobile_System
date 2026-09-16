/**
 * DIRECTIVE-016 Stage 7.2 — transfer-float DTO (v3.0 Flexy engine).
 *
 * Moves liquidity between CASH (10000), BANK (10200) and WALLET (10100).
 * `sourceWalletId`/`targetWalletId` are required exactly when the
 * matching leg is WALLET. Amounts are decimal strings (Rule ③).
 */
export interface TransferFloatDto {
  sourceAccountType: 'CASH' | 'BANK' | 'WALLET';
  sourceWalletId?: string;
  targetAccountType: 'CASH' | 'BANK' | 'WALLET';
  targetWalletId?: string;
  amount: string;
  reason: string;
  actorUserId: string;
}
