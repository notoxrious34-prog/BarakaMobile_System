import { X, Loader2 } from 'lucide-react';
import { useTransaction } from '../hooks/useTransaction';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { InvoicePrintView } from './InvoicePrintView';

type Props = {
  transactionId: string | null;
  onClose: () => void;
};

export function InvoicePrintModal({ transactionId, onClose }: Props) {
  const { data: transaction, isLoading: txLoading, isError: txError } = useTransaction(transactionId);
  const { data: settings, isLoading: settingsLoading } = useInvoiceSettings();

  if (!transactionId) return null;

  const isLoading = txLoading || settingsLoading;
  const isError = txError || !transaction;

  const handlePrint = () => {
    window.print();
    setTimeout(() => {
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="فاتورة"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">الفاتورة</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" aria-hidden="true" />
              <p className="text-sm text-zinc-500">جاري تحميل الفاتورة...</p>
            </div>
          ) : isError || !transaction || !settings ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <p className="text-sm text-red-600">تعذر تحميل الفاتورة</p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                إغلاق
              </button>
            </div>
          ) : (
            <>
              <InvoicePrintView transaction={transaction} settings={settings} />
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-200 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-zinc-200 bg-white px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  طباعة
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
