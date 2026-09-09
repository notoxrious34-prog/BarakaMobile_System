import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  WatchdogSummaryResponse,
  RepairAlertsResponse,
  WarrantyAlertsResponse,
  WatchdogSettings,
  RepairFaultType,
} from '@/types/watchdog';

const KEYS = {
  summary: ['watchdog', 'summary'],
  repairs: (filter: string) => ['watchdog', 'repairs', filter],
  warranties: (filter: string) => ['watchdog', 'warranties', filter],
  settings: ['watchdog', 'settings'],
  faultTypes: ['repair', 'fault-types'],
} as const;

/** Bell badge + widget — silent 60s polling, no loader flicker (placeholderData). */
export function useWatchdogSummary() {
  return useQuery<WatchdogSummaryResponse>({
    queryKey: KEYS.summary,
    queryFn: () => api.get<WatchdogSummaryResponse>('/watchdog/summary'),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useRepairAlerts(filter: string) {
  return useQuery<RepairAlertsResponse>({
    queryKey: KEYS.repairs(filter),
    queryFn: () => api.get<RepairAlertsResponse>(`/watchdog/repairs?filter=${encodeURIComponent(filter)}&limit=50`),
    placeholderData: (prev) => prev,
  });
}

export function useWarrantyAlerts(filter: string) {
  return useQuery<WarrantyAlertsResponse>({
    queryKey: KEYS.warranties(filter),
    queryFn: () => api.get<WarrantyAlertsResponse>(`/watchdog/warranties?filter=${encodeURIComponent(filter)}&limit=50`),
    placeholderData: (prev) => prev,
  });
}

export function useWatchdogSettings() {
  return useQuery<WatchdogSettings>({
    queryKey: KEYS.settings,
    queryFn: () => api.get<WatchdogSettings>('/watchdog/settings'),
  });
}

export function useUpdateWatchdogSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { repairGraceDays: number; warrantyAlertDays: number }) =>
      api.put<WatchdogSettings>('/watchdog/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchdog'] });
    },
  });
}

export function useRepairFaultTypes() {
  return useQuery<RepairFaultType[]>({
    queryKey: KEYS.faultTypes,
    queryFn: () => api.get<RepairFaultType[]>('/repair/fault-types'),
  });
}
