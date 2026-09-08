import { api } from '@/lib/api';

export type DeviceStatus = 'IN_STOCK' | 'SOLD' | 'UNDER_REPAIR' | 'WARRANTY_CLAIMED' | 'RETURNED' | 'DEFECTIVE';

export type DeviceSerial = {
  id: string;
  imei1: string;
  imei2: string | null;
  itemId: string;
  status: DeviceStatus;
  supplierContactId: string | null;
  purchaseInvoiceRef: string | null;
  purchaseCost: string | null;
  saleInvoiceId: string | null;
  saleDate: string | null;
  customerContactId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  warrantyMonths: number;
  warrantyExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
  item?: { id: string; name: string; sku: string | null };
};

export type DeviceEvent = {
  id: string;
  eventType: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string;
  createdAt: string;
};

export type WarrantyClaim = {
  id: string;
  claimNumber: string;
  deviceSerialId: string;
  customerName: string;
  customerPhone: string;
  reportedIssue: string;
  technicianVerdict: string | null;
  actionTaken: string | null;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  device?: { id: string; imei1: string; item?: { name: string } };
};

export type LookupResult = {
  device: DeviceSerial & { item?: { id: string; name: string; sku: string | null }; events: DeviceEvent[]; claims: WarrantyClaim[] };
  supplier: { id: string; name: string; phone: string | null } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  isUnderWarranty: boolean;
  remainingDays: number;
  timeline: DeviceEvent[];
  relatedRepairs: { id: string; ticketNumber: string; status: string; deviceBrand: string; deviceModel: string; createdAt: string }[];
};

export type SerialsMetrics = {
  inStock: number;
  underRepair: number;
  activeClaims: number;
  underWarranty: number;
};

export async function lookupImei(code: string): Promise<LookupResult> {
  return api.get<LookupResult>(`/serials/lookup/${encodeURIComponent(code.trim())}`);
}

export async function listSerials(params?: { status?: string; itemId?: string; search?: string }): Promise<{ items: DeviceSerial[]; total: number }> {
  const p = new URLSearchParams();
  if (params?.status) p.set('status', params.status);
  if (params?.itemId) p.set('itemId', params.itemId);
  if (params?.search) p.set('search', params.search);
  const qs = p.toString();
  return api.get(`/serials${qs ? `?${qs}` : ''}`);
}

export async function registerSerial(payload: {
  imei1: string;
  imei2?: string;
  itemId: string;
  supplierContactId?: string;
  purchaseInvoiceRef?: string;
  purchaseCost?: string;
  warrantyMonths?: number;
  notes?: string;
}): Promise<DeviceSerial> {
  return api.post<DeviceSerial>('/serials', payload);
}

export async function attachSale(id: string, payload: {
  saleInvoiceId: string;
  customerContactId?: string;
  customerName?: string;
  customerPhone?: string;
  warrantyMonths?: number;
}): Promise<DeviceSerial> {
  return api.post<DeviceSerial>(`/serials/${id}/attach-sale`, payload);
}

export async function setDeviceStatus(id: string, status: DeviceStatus, description?: string): Promise<DeviceSerial> {
  return api.put<DeviceSerial>(`/serials/${id}/status`, { status, description });
}

export async function createClaim(payload: {
  deviceSerialId?: string;
  imei?: string;
  customerName: string;
  customerPhone: string;
  reportedIssue: string;
}): Promise<WarrantyClaim> {
  return api.post<WarrantyClaim>('/serials/warranty-claims', payload);
}

export async function resolveClaim(id: string, payload: { verdict: string; actionTaken?: string }): Promise<WarrantyClaim> {
  return api.put<WarrantyClaim>(`/serials/warranty-claims/${id}/resolve`, payload);
}

export async function listClaims(activeOnly = false): Promise<WarrantyClaim[]> {
  return api.get<WarrantyClaim[]>(`/serials/warranty-claims${activeOnly ? '?activeOnly=true' : ''}`);
}

export async function fetchSerialsMetrics(): Promise<SerialsMetrics> {
  return api.get<SerialsMetrics>('/serials/metrics');
}
