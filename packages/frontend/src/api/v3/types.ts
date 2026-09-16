/**
 * DIRECTIVE-020 Stage 10.1 — v3 gateway type contracts (frontend SDK).
 *
 * Exact TypeScript mirrors of the Stage 9 backend DTOs and response
 * envelopes. Money travels as decimal strings end to end (Rules ②/③) —
 * this file performs no arithmetic; anything needing math uses
 * `decimal.js` (already a frontend dependency) at the call site.
 */

export interface V3ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: V3ApiErrorBody };

/* ------------------------------ commercial ------------------------------ */

export interface SaleLinePayload {
  itemId: string;
  serialId?: string;
  quantity: number;
  unitPrice: string;
}

export interface PaymentSplitPayload {
  paymentMethod: 'CASH' | 'DIGITAL_WALLET' | 'BANK_TRANSFER';
  amount: string;
}

export interface SalePayload {
  partyId?: string;
  lines: SaleLinePayload[];
  discountAmount?: string;
  payments: PaymentSplitPayload[];
}

export interface DocumentLine {
  id: string;
  itemId: string;
  serialId: string | null;
  quantity: number;
  unitCost: string;
  unitPrice: string;
  lineTotal: string;
  serial?: SerializedDevice | null;
}

export interface SerializedDevice {
  id: string;
  imei1: string;
  imei2: string | null;
  itemId: string;
}

export interface PaymentAllocation {
  id: string;
  paymentMethod: string;
  amount: string;
  walletId: string | null;
}

export interface BusinessDocument {
  id: string;
  documentNumber: string;
  type: string;
  partyId: string | null;
  status: string;
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  debit: string;
  credit: string;
  memo: string | null;
  partyId: string | null;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  postingDate: string;
  documentType: string;
  documentId: string | null;
  description: string;
  status: string;
  lines: JournalLine[];
}

export interface SaleResult {
  document: BusinessDocument;
  lines: DocumentLine[];
  payments: PaymentAllocation[];
  journalEntryId: string;
  journalNumber: string;
}

export type SaleDetails = SaleResult & {
  journalEntry: JournalEntry | null;
};

export interface PurchaseSerialPayload {
  imei1: string;
  imei2?: string;
  warrantyMonths?: number;
}

export interface PurchaseLinePayload {
  itemId: string;
  quantity: number;
  unitCost: string;
  serials?: PurchaseSerialPayload[];
}

export interface PurchasePayload {
  partyId: string;
  lines: PurchaseLinePayload[];
  discountAmount?: string;
  payments: PaymentSplitPayload[];
}

export type PurchaseResult = SaleResult;
export type PurchaseDetails = SaleDetails;

export interface ReturnLinePayload {
  documentLineId: string;
  quantity: number;
  condition: 'RESTOCKED_INVENTORY' | 'DEFECTIVE_QUARANTINE';
}

export interface ReturnPayload {
  originalDocumentId: string;
  lines: ReturnLinePayload[];
  refundMethod: 'CASH' | 'BANK_TRANSFER' | 'CUSTOMER_CREDIT_REDUCTION';
  reason: string;
}

export interface ReturnResult {
  returnDocument: BusinessDocument;
  lines: DocumentLine[];
  journalEntryId: string;
  journalNumber: string;
}

export interface ReturnDetails {
  document: BusinessDocument;
  lines: DocumentLine[];
  journalEntry: JournalEntry | null;
}

/* ------------------------------- repairs -------------------------------- */

export interface CreateRepairPayload {
  partyId: string;
  deviceType: string;
  brand: string;
  model: string;
  serialOrImei?: string;
  reportedIssue: string;
}

export type RepairStatusTarget =
  | 'DIAGNOSING'
  | 'QUOTED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'IN_REPAIR'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface UpdateRepairStatusPayload {
  status: RepairStatusTarget;
  technicianId?: string;
  notes?: string;
  diagnosisNotes?: string;
  laborPrice?: string;
  estimatedCost?: string;
}

export interface AddPartPayload {
  itemId: string;
  quantity: number;
  unitPrice: string;
}

export interface DeliverRepairPayload {
  payments: PaymentSplitPayload[];
  discountAmount?: string;
}

export interface RepairOrderPart {
  id: string;
  itemId: string;
  quantity: number;
  unitCost: string;
  totalCost: string;
  unitPrice: string;
  totalPrice: string;
  status: string;
}

export interface RepairOrder {
  id: string;
  orderNumber: string;
  partyId: string;
  deviceType: string;
  brand: string;
  model: string;
  serialOrImei: string | null;
  reportedIssue: string;
  status: string;
  laborPrice: string;
  partsPriceTotal: string;
  discountAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
}

export interface RepairDetails extends RepairOrder {
  parts: RepairOrderPart[];
}

export interface RepairDeliveryResult {
  order: RepairOrder;
  document: BusinessDocument;
  journalEntryId: string;
  journalNumber: string;
}

/* -------------------------------- shifts -------------------------------- */

export interface OpenShiftPayload {
  registerId: string;
  openingCash: string;
  notes?: string;
}

export interface CloseShiftPayload {
  actualCash: string;
  notes?: string;
}

export interface ShiftMovementPayload {
  amount: string;
  reason: string;
}

export interface CashShift {
  id: string;
  shiftNumber: string;
  registerId: string;
  cashierUserId: string;
  status: string;
  openingCash: string;
  totalCashIn: string;
  totalCashOut: string;
  totalSalesCash: string;
  expectedCash: string;
  actualCash: string | null;
  differenceAmount: string;
  discrepancyJournalId: string | null;
}

export interface ShiftCashMovement {
  id: string;
  shiftId: string;
  movementType: string;
  amount: string;
  reason: string;
  actorUserId: string;
  journalEntryId: string | null;
}

export interface ShiftTotals {
  openingCash: string;
  totalCashIn: string;
  totalCashOut: string;
  totalSalesCash: string;
  expectedCash: string;
  actualCash: string | null;
  differenceAmount: string;
}

export interface ShiftDetails {
  shift: CashShift;
  register: { id: string; name: string };
  movements: ShiftCashMovement[];
  totals: ShiftTotals;
}

/* ----------------------------- wallets/flexy ---------------------------- */

export interface WalletDetails {
  id: string;
  name: string;
  operator: string;
  phoneNumber: string | null;
  balance: string;
  minBalanceAlert: string;
  isActive: boolean;
}

export interface TopUpPayload {
  walletId: string;
  targetPhoneNumber: string;
  faceAmount: string;
  costAmount?: string;
  feeAmount?: string;
  paymentMethod: 'CASH' | 'ON_ACCOUNT';
  partyId?: string;
}

export interface TopUpResult {
  transaction: {
    id: string;
    transactionNumber: string;
    walletId: string;
    targetPhoneNumber: string;
    faceAmount: string;
    costAmount: string;
    feeAmount: string;
    collectedAmount: string;
    marginAmount: string;
    paymentMethod: string;
  };
  wallet: WalletDetails;
  journalEntryId: string;
  journalNumber: string;
}

export interface FloatTransferPayload {
  sourceAccountType: 'CASH' | 'BANK' | 'WALLET';
  sourceWalletId?: string;
  targetAccountType: 'CASH' | 'BANK' | 'WALLET';
  targetWalletId?: string;
  amount: string;
  reason: string;
}

export interface FloatTransferResult {
  record: {
    id: string;
    transferNumber: string;
    sourceAccountType: string;
    targetAccountType: string;
    amount: string;
  };
  journalEntryId: string;
  journalNumber: string;
}

/* ------------------------- accounting/statements ------------------------ */

export interface ChartOfAccountsItem {
  accountCode: string;
  name: string;
  type: string;
  normalBalance: string;
  isControl: boolean;
  isActive: boolean;
  totalDebit: string;
  totalCredit: string;
  netBalance: string;
}

export interface TrialBalanceAccount {
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  totalDebit: string;
  totalCredit: string;
  netBalance: string;
}

export interface TrialBalanceReport {
  asOfDate: string;
  accounts: TrialBalanceAccount[];
  totalDebits: string;
  totalCredits: string;
  isBalanced: boolean;
  imbalanceAmount: string;
}

export interface StatementLine {
  accountCode: string;
  accountName: string;
  balance: string;
}

export interface IncomeStatementReport {
  periodId: string | null;
  periodName: string | null;
  startDate: string;
  endDate: string;
  revenues: StatementLine[];
  totalRevenue: string;
  cogs: StatementLine[];
  totalCogs: string;
  grossProfit: string;
  expenses: StatementLine[];
  totalExpenses: string;
  netIncome: string;
}

export interface BalanceSheetReport {
  asOfDate: string;
  periodId: string | null;
  periodName: string | null;
  assets: StatementLine[];
  totalAssets: string;
  liabilities: StatementLine[];
  totalLiabilities: string;
  equity: StatementLine[];
  retainedEarnings: string;
  currentNetIncome: string;
  totalEquity: string;
  balanced: boolean;
}

export interface FiscalPeriod {
  id: string;
  periodName: string;
  status: string;
}

export interface ClosePeriodResult {
  periodId: string;
  periodName: string;
  status: string;
  closedAt: string;
  hadNominalActivity: boolean;
  netIncome: string;
  closingJournalEntryId: string | null;
  closingJournalNumber: string | null;
}
