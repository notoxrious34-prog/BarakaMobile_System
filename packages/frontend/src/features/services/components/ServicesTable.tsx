import { Pencil, Trash2 } from 'lucide-react';
import type { Service } from '../hooks/useServices';
import { PricingBadge } from './PricingBadge';

type Props = {
  services: Service[];
  onEdit: (service: Service) => void;
  onDeactivate: (id: string) => void;
};

const PRICING_LABEL: Record<string, string> = {
  FIXED: 'ربح ثابت',
  COMMISSION: 'عمولة',
};

function getCommissionValue(s: Service): string {
  return (s.commissionPct ?? s.commissionRate ?? '') as string;
}

function getValueCell(s: Service) {
  if (s.pricingType === 'FIXED') {
    return s.fixedProfit ?? '—';
  }
  return getCommissionValue(s) ?? '—';
}

export function ServicesTable({ services, onEdit, onDeactivate }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60 backdrop-blur-md">
      <div className="overflow-x-auto scrollbar-premium">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-navy-border/40 text-slate-400">
              <th className="px-3 py-2.5 text-right font-semibold">اسم الخدمة</th>
              <th className="px-3 py-2.5 text-right font-semibold">المورد</th>
              <th className="px-3 py-2.5 text-right font-semibold">نوع التسعير</th>
              <th className="px-3 py-2.5 text-right font-semibold">القيمة</th>
              <th className="px-3 py-2.5 text-right font-semibold">الحالة</th>
              <th className="px-3 py-2.5 text-center font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => {
              const isInactive = !svc.isActive;
              const value = getValueCell(svc);
              const hasValue = value !== '—' && value !== '';
              return (
                <tr
                  key={svc.id}
                  className={`border-t border-navy-border/30 ${isInactive ? 'opacity-50' : 'hover:bg-navy-800/40'}`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-100">{svc.name}</td>
                  <td className="px-3 py-2.5 text-slate-300">{svc.supplier?.name ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-300">
                      {PRICING_LABEL[svc.pricingType] ?? svc.pricingType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" dir="ltr">
                    {hasValue ? (
                      <PricingBadge pricingType={svc.pricingType} value={value} />
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {svc.isActive ? (
                      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                        نشط
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-navy-700/60 bg-navy-950/60 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                        غير نشط
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(svc)}
                        aria-label={`تعديل ${svc.name}`}
                        title="تعديل"
                        className="rounded-md p-2 text-slate-400 hover:bg-navy-800/60 hover:text-slate-100"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {svc.isActive && (
                        <button
                          type="button"
                          onClick={() => onDeactivate(svc.id)}
                          aria-label={`تعطيل ${svc.name}`}
                          title="تعطيل"
                          className="rounded-md p-2 text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
