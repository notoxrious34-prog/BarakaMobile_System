/**
 * DIRECTIVE-020 Stage 10.1 — v3 repairs / shifts / flexy domain SDKs.
 */
import { v3Api, type MutatingRequestOptions, type V3Client } from './client';
import type {
  AddPartPayload,
  CloseShiftPayload,
  CreateRepairPayload,
  DeliverRepairPayload,
  FloatTransferPayload,
  FloatTransferResult,
  OpenShiftPayload,
  RepairDeliveryResult,
  RepairDetails,
  RepairOrder,
  RepairOrderPart,
  ShiftCashMovement,
  ShiftDetails,
  ShiftMovementPayload,
  TopUpPayload,
  TopUpResult,
  UpdateRepairStatusPayload,
  WalletDetails,
} from './types';

export function createRepairsV3Api(client: V3Client = v3Api) {
  return {
    createRepair(payload: CreateRepairPayload, opts?: MutatingRequestOptions): Promise<RepairOrder> {
      return client.post<RepairOrder>('/v3/repairs', payload, opts);
    },
    updateStatus(id: string, payload: UpdateRepairStatusPayload, opts?: MutatingRequestOptions): Promise<RepairOrder> {
      return client.patch<RepairOrder>(`/v3/repairs/${encodeURIComponent(id)}/status`, payload, opts);
    },
    addPart(id: string, payload: AddPartPayload, opts?: MutatingRequestOptions): Promise<RepairOrderPart> {
      return client.post<RepairOrderPart>(`/v3/repairs/${encodeURIComponent(id)}/parts`, payload, opts);
    },
    deliverRepair(id: string, payload: DeliverRepairPayload, opts?: MutatingRequestOptions): Promise<RepairDeliveryResult> {
      return client.post<RepairDeliveryResult>(`/v3/repairs/${encodeURIComponent(id)}/deliver`, payload, opts);
    },
    getRepairById(id: string): Promise<RepairDetails> {
      return client.get<RepairDetails>(`/v3/repairs/${encodeURIComponent(id)}`);
    },
  };
}

export const repairsV3Api = createRepairsV3Api();

export function createShiftsV3Api(client: V3Client = v3Api) {
  return {
    openShift(payload: OpenShiftPayload, opts?: MutatingRequestOptions): Promise<ShiftDetails['shift']> {
      return client.post<ShiftDetails['shift']>('/v3/shifts/open', payload, opts);
    },
    closeShift(id: string, payload: CloseShiftPayload, opts?: MutatingRequestOptions): Promise<ShiftDetails['shift']> {
      return client.post<ShiftDetails['shift']>(`/v3/shifts/${encodeURIComponent(id)}/close`, payload, opts);
    },
    recordCashIn(id: string, payload: ShiftMovementPayload, opts?: MutatingRequestOptions): Promise<ShiftCashMovement> {
      return client.post<ShiftCashMovement>(`/v3/shifts/${encodeURIComponent(id)}/cash-in`, payload, opts);
    },
    recordCashOut(id: string, payload: ShiftMovementPayload, opts?: MutatingRequestOptions): Promise<ShiftCashMovement> {
      return client.post<ShiftCashMovement>(`/v3/shifts/${encodeURIComponent(id)}/cash-out`, payload, opts);
    },
    getActiveShift(registerId: string): Promise<ShiftDetails | null> {
      return client.get<ShiftDetails | null>(`/v3/shifts/active/${encodeURIComponent(registerId)}`);
    },
    getShiftById(id: string): Promise<ShiftDetails> {
      return client.get<ShiftDetails>(`/v3/shifts/${encodeURIComponent(id)}`);
    },
  };
}

export const shiftsV3Api = createShiftsV3Api();

export function createFlexyV3Api(client: V3Client = v3Api) {
  return {
    topUp(payload: TopUpPayload, opts?: MutatingRequestOptions): Promise<TopUpResult> {
      return client.post<TopUpResult>('/v3/flexy/topup', payload, opts);
    },
    transferFloat(payload: FloatTransferPayload, opts?: MutatingRequestOptions): Promise<FloatTransferResult> {
      return client.post<FloatTransferResult>('/v3/flexy/float-transfer', payload, opts);
    },
    listWallets(): Promise<WalletDetails[]> {
      return client.get<WalletDetails[]>('/v3/flexy/wallets');
    },
  };
}

export const flexyV3Api = createFlexyV3Api();
