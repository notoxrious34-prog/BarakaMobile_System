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
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-600">
              <th className="px-4 py-3 text-right font-semibold">اسم الخدمة</th>
              <th className="px-4 py-3 text-right font-semibold">المورد</th>
              <th className="px-4 py-3 text-right font-semibold">نوع التسعير</th>
              <th className="px-4 py-3 text-right font-semibold">القيمة</th>
              <th className="px-4 py-3 text-right font-semibold">الحالة</th>
              <th className="px-4 py-3 text-center font-semibold">الإجراءات</th>
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
                  className={`border-t border-zinc-100 ${isInactive ? 'bg-zinc-50 opacity-60' : 'bg-white hover:bg-zinc-50'}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">{svc.name}</td>
                  <td className="px-4 py-3 text-zinc-700">{svc.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-700">{PRICING_LABEL[svc.pricingType] ?? svc.pricingType}</td>
                  <td className="px-4 py-3" dir="ltr">
                    {hasValue ? (
                      <PricingBadge pricingType={svc.pricingType} value={value} />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {svc.isActive ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                        نشط
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/20">
                        غير نشط
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(svc)}
                        aria-label={`تعديل ${svc.name}`}
                        title="تعديل"
                        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {svc.isActive && (
                        <button
                          type="button"
                          onClick={() => onDeactivate(svc.id)}
                          aria-label={`تعطيل ${svc.name}`}
                          title="تعطيل"
                          className="rounded-md p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
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
