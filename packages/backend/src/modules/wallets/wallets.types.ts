/**
 * DIRECTIVE-016 Stage 7.2 — wallet domain types (v3.0 Flexy engine).
 *
 * Operators, account types and media are plain strings at rest (matching
 * the Prisma String columns); these const objects are the single source
 * of truth for every legal value.
 */

export const WALLET_OPERATOR = {
  MOBILIS: 'MOBILIS',
  DJEZZY: 'DJEZZY',
  OOREDOO: 'OOREDOO',
  OTHER: 'OTHER',
} as const;

export type WalletOperator = (typeof WALLET_OPERATOR)[keyof typeof WALLET_OPERATOR];

export const ACCOUNT_LIQUIDITY_TYPE = {
  CASH: 'CASH',
  BANK: 'BANK',
  WALLET: 'WALLET',
} as const;

export type AccountLiquidityType = (typeof ACCOUNT_LIQUIDITY_TYPE)[keyof typeof ACCOUNT_LIQUIDITY_TYPE];

export const TOPUP_PAYMENT_MEDIUM = {
  CASH: 'CASH',
  ON_ACCOUNT: 'ON_ACCOUNT',
} as const;

export type TopUpPaymentMedium = (typeof TOPUP_PAYMENT_MEDIUM)[keyof typeof TOPUP_PAYMENT_MEDIUM];

export const DIGITAL_SERVICE_TYPE = {
  FLEXY: 'FLEXY',
  BILL_PAYMENT: 'BILL_PAYMENT',
  OTHER: 'OTHER',
} as const;

export type DigitalServiceType = (typeof DIGITAL_SERVICE_TYPE)[keyof typeof DIGITAL_SERVICE_TYPE];

/** Money snapshot of a float wallet position (all values 2dp strings). */
export interface WalletFloatSnapshot {
  balance: string;
  minBalanceAlert: string;
  belowAlert: boolean;
}
