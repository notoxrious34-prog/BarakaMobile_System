/**
 * DIRECTIVE-016 Stage 7.2 — create-wallet DTO (v3.0 Flexy engine).
 *
 * `openingBalance` seeds the monitored float as master data (no journal:
 * there is no source leg at provisioning time — the first `fundWallet`
 * call posts the inaugural Dr 10100 leg). Plain interface: the service
 * layer is the single validation authority.
 */
export interface CreateWalletDto {
  name: string;
  operator: string;
  phoneNumber?: string;
  openingBalance?: string;
  minBalanceAlert?: string;
  actorUserId?: string;
}
