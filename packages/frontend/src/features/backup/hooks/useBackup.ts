import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BakStatus, BakBackupItem, BakCreateResult, BakRestoreResult, BakSettings, BakVerifyResult } from '@/types/backup';

const KEYS = {
  status: ['backup', 'status'],
  list: ['backup', 'list'],
  settings: ['backup', 'settings'],
} as const;

/** Status pill — silent 60s polling, no loader flicker. */
export function useBackupStatus() {
  return useQuery<BakStatus>({
    queryKey: KEYS.status,
    queryFn: () => api.get<BakStatus>('/backup/status'),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useBackupHistory() {
  return useQuery<BakBackupItem[]>({
    queryKey: KEYS.list,
    queryFn: () => api.get<BakBackupItem[]>('/backup/list'),
    placeholderData: (prev) => prev,
  });
}

export function useBackupSettings() {
  return useQuery<BakSettings>({
    queryKey: KEYS.settings,
    queryFn: () => api.get<BakSettings>('/backup/settings'),
  });
}

export function useManualBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BakCreateResult>('/backup/create'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup'] });
    },
  });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.post<BakRestoreResult>('/backup/restore', { path }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup'] });
    },
  });
}

/** Restore from an uploaded external .bak file (multipart). */
export function useUploadRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file, file.name);
      return api.post<BakRestoreResult>('/backup/restore', form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup'] });
    },
  });
}

/** Standalone verification: multipart file or stored { path }. No writes. */
export function useVerifyBackup() {
  return useMutation({
    mutationFn: (input: File | string) => {
      if (typeof input === 'string') return api.post<BakVerifyResult>('/backup/verify', { path: input });
      const form = new FormData();
      form.append('file', input, input.name);
      return api.post<BakVerifyResult>('/backup/verify', form);
    },
  });
}

/** Delete a stored .bak (ADMIN-gated server-side). */
export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => api.delete<{ success: boolean; filename: string }>(`/backup/${encodeURIComponent(filename)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup'] });
    },
  });
}

export function useUpdateBackupSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { autoEnabled?: boolean; intervalHours?: number; retentionCount?: number; destinationDir?: string }) =>
      api.put<BakSettings>('/backup/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup'] });
    },
  });
}

/**
 * Folder override: native picker when the desktop shell exposes one,
 * otherwise the caller falls back to manual text entry.
 */
export function useSelectBackupFolder(): () => Promise<string | null> {
  return async () => {
    const w = window as unknown as {
      electronAPI?: { selectBackupFolder?: () => Promise<{ canceled: boolean; filePath: string | null }> };
      electron?: { selectBackupFolder?: () => Promise<{ canceled: boolean; filePath: string | null }> };
    };
    const pick = w.electronAPI?.selectBackupFolder ?? w.electron?.selectBackupFolder;
    if (!pick) return null;
    try {
      const res = await pick();
      return res.canceled ? null : res.filePath;
    } catch {
      return null;
    }
  };
}
