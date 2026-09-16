/**
 * DIRECTIVE-020 Stage 10.1 — v3 commercial domain SDKs (sales, purchases,
 * returns). Each factory binds the shared route set to a `V3Client` so
 * screens use the default `v3Api` while tests inject a stubbed transport.
 */
import { v3Api, type MutatingRequestOptions, type V3Client } from './client';
import type {
  PurchaseDetails,
  PurchasePayload,
  PurchaseResult,
  ReturnDetails,
  ReturnPayload,
  ReturnResult,
  SaleDetails,
  SalePayload,
  SaleResult,
} from './types';

export function createSalesV3Api(client: V3Client = v3Api) {
  return {
    createSale(payload: SalePayload, opts?: MutatingRequestOptions): Promise<SaleResult> {
      return client.post<SaleResult>('/v3/sales', payload, opts);
    },
    getSaleById(id: string): Promise<SaleDetails> {
      return client.get<SaleDetails>(`/v3/sales/${encodeURIComponent(id)}`);
    },
  };
}

export const salesV3Api = createSalesV3Api();

export function createPurchasesV3Api(client: V3Client = v3Api) {
  return {
    createPurchase(payload: PurchasePayload, opts?: MutatingRequestOptions): Promise<PurchaseResult> {
      return client.post<PurchaseResult>('/v3/purchases', payload, opts);
    },
    getPurchaseById(id: string): Promise<PurchaseDetails> {
      return client.get<PurchaseDetails>(`/v3/purchases/${encodeURIComponent(id)}`);
    },
  };
}

export const purchasesV3Api = createPurchasesV3Api();

export function createReturnsV3Api(client: V3Client = v3Api) {
  return {
    createSalesReturn(payload: ReturnPayload, opts?: MutatingRequestOptions): Promise<ReturnResult> {
      return client.post<ReturnResult>('/v3/returns/sales', payload, opts);
    },
    getReturnById(id: string): Promise<ReturnDetails> {
      return client.get<ReturnDetails>(`/v3/returns/${encodeURIComponent(id)}`);
    },
  };
}

export const returnsV3Api = createReturnsV3Api();
