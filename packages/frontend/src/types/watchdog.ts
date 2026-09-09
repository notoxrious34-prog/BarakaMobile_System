/** Watchdog / Alert Center contracts — mirrors GET /api/watchdog/* + /api/repair/fault-types (TB-126/127). */

export type WatchdogSummaryResponse = {
  criticalCount: number;
  delayedCount: number;
  expiringWarrantiesCount: number;
  expiredWarrantiesCount: number;
};

export type RepairAlertItem = {
  id: string;
  ticketNumber: string;
  customerName: string;
  deviceName: string;
  faultType: string;
  expectedDate: string;
  daysOverdue: number;
  severity: 'DELAYED' | 'CRITICAL';
};

export type WarrantyAlertItem = {
  id: string;
  imei: string;
  productName: string;
  customerName: string;
  saleDate: string;
  warrantyEndDate: string;
  daysRemaining: number;
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
};

export type WatchdogSettings = {
  repairGraceDays: number;
  warrantyAlertDays: number;
  updatedAt?: string;
};

export type RepairFaultType = {
  id: string;
  faultTypeName: string;
  defaultDays: number;
};

export type RepairAlertsResponse = {
  items: RepairAlertItem[];
  total: number;
};

export type WarrantyAlertsResponse = {
  items: WarrantyAlertItem[];
  total: number;
};
