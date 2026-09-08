import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { Pencil, Trash2 } from 'lucide-react';
import {
  deleteExpenseCategory,
  fetchExpenseCategories,
  patchExpenseCategory,
  postExpenseCategory,
} from '@/features/cash/api/cashApi';

type Props = { open: boolean; onClose: () => void };

export function ExpenseCategoriesModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const categoriesQ = useQuery({ queryKey: ['cash', 'expense-categories'], queryFn: fetchExpenseCategories, enabled: open });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['cash', 'expense-categories'] });
    qc.invalidateQueries({ queryKey: ['expense-categories'] });
  };

  const createMut = useMutation({
    mutationFn: () => postExpenseCategory({ name: name.trim() }),
    onSuccess: () => { setName(''); setError(null); refresh(); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر إنشاء الفئة'),
  });
  const updateMut = useMutation({
    mutationFn: (args: { id: string; data: { name?: string; isActive?: boolean } }) => patchExpenseCategory(args.id, args.data),
    onSuccess: () => { setEditingId(null); setError(null); refresh(); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر تحديث الفئة'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر حذف الفئة'),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="إدارة بنود المصروفات">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="text-sm font-extrabold text-slate-100">إدارة بنود المصروفات</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06]" aria-label="إغلاق">✕</button>
        </div>
        <div className="scrollbar-premium flex-1 space-y-2 overflow-y-auto p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="بند جديد…"
              className="flex-1 rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/50"
            />
            <button
              type="button"
              disabled={name.trim().length < 2 || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-500 disabled:opacity-40"
            >
              إضافة
            </button>
          </div>
          {error && <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">{error}</p>}
          {(categoriesQ.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-navy-border/30 bg-white/[0.02] px-3 py-2">
              {editingId === c.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 text-xs text-slate-100 outline-none"
                  />
                  <button type="button" onClick={() => updateMut.mutate({ id: c.id, data: { name: editName.trim() } })} className="text-xs font-bold text-emerald-400">حفظ</button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate-400">إلغاء</button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-200">
                    {c.name}
                    {c.isSystem && <span className="ms-1 rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">نظام</span>}
                    {c.isActive === false && <span className="ms-1 text-[10px] text-slate-500">(موقوف)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateMut.mutate({ id: c.id, data: { isActive: !(c.isActive ?? true) } })}
                    className="text-[11px] text-slate-400 hover:text-slate-200"
                    title={c.isActive === false ? 'تفعيل' : 'إيقاف'}
                  >
                    {c.isActive === false ? 'تفعيل' : 'إيقاف'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                    className="rounded-md p-1 text-slate-400 hover:bg-white/[0.06]"
                    aria-label={`تعديل ${c.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!c.isSystem && (
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`حذف البند "${c.name}"؟`)) deleteMut.mutate(c.id); }}
                      className="rounded-md p-1 text-rose-400 hover:bg-rose-500/10"
                      aria-label={`حذف ${c.name}`}
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
