import Decimal from 'decimal.js';
import { BrandMark } from '@/components/layout/BrandMark';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import type { ExpenseItem } from '@/features/cash/types';

function fmt(v: string | null | undefined): string {
  try {
    const fixed = new Decimal(v ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    const parts = fixed.split('.');
    return `${(parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${parts[1] ?? '00'}`;
  } catch {
    return '0.00';
  }
}

const SOURCE_LABEL: Record<string, string> = {
  REGISTER_CASH: 'صندوق الكاشير',
  SAFE_VAULT: 'الخزينة الرئيسية',
  EXTERNAL_ACCOUNT: 'حساب بنكي / بطاقة',
};

type Props = {
  expense: ExpenseItem;
  cashierName?: string;
  /** Screen preview inside a modal (default false = print-only, hidden on screen). */
  preview?: boolean;
};

/** Thermal 80/58mm expense voucher — screen-hidden, print-only via #expense-voucher-receipt. */
export function ExpenseVoucher({ expense, cashierName, preview = false }: Props) {
  const { data: settings } = useInvoiceSettings();
  const currency = settings?.currency_symbol ?? 'د.ج';
  const when = expense.expenseDate ?? expense.date ?? expense.createdAt;

  return (
    <div id={preview ? undefined : 'expense-voucher-receipt'} className={preview ? 'rounded-xl bg-white p-3' : 'hidden print:block'} aria-hidden={preview ? undefined : true}>
      <div style={{ textAlign: 'center', color: '#000', background: '#fff' }}>
        <BrandMark className="h-8 w-8" />
        {settings?.business_name && <div style={{ fontWeight: 800 }}>{settings.business_name}</div>}
        {settings?.business_phone && <div dir="ltr" style={{ fontSize: '11px' }}>{settings.business_phone}</div>}
        <div style={{ fontWeight: 800, margin: '4px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0' }}>
          سند صرف نثريات ومصروفات (EXPENSE VOUCHER)
        </div>
        <table style={{ width: '100%', fontSize: '12px', color: '#000' }}>
          <tbody>
            <tr><td>رقم السند</td><td dir="ltr" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{expense.expenseNumber ?? expense.id.slice(0, 8)}</td></tr>
            <tr><td>التاريخ</td><td dir="ltr">{new Date(when).toLocaleString('ar-DZ')}</td></tr>
            <tr><td>البند</td><td style={{ fontWeight: 700 }}>{expense.category?.name ?? '—'}</td></tr>
            <tr><td>طريقة الدفع</td><td>{SOURCE_LABEL[expense.paymentSource ?? 'REGISTER_CASH']}</td></tr>
            {expense.recipientName && <tr><td>المستلم</td><td style={{ fontWeight: 700 }}>{expense.recipientName}</td></tr>}
            {expense.invoiceReference && <tr><td>مرجع خارجي</td><td dir="ltr" style={{ fontFamily: 'monospace' }}>{expense.invoiceReference}</td></tr>}
            {cashierName && <tr><td>الكاشير</td><td>{cashierName}</td></tr>}
          </tbody>
        </table>
        <div style={{ border: '2px solid #000', margin: '6px 0', padding: '6px', fontWeight: 800, fontSize: '16px' }}>
          <span dir="ltr" style={{ fontFamily: 'monospace' }}>{fmt(expense.amount)}</span> {currency}
        </div>
        {expense.description && <div style={{ fontSize: '12px' }}>البيان: {expense.description}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '14px', fontSize: '11px' }}>
          <span>توقيع المستلم: ـــــــــ</span>
          <span>توقيع الكاشير: ـــــــــ</span>
        </div>
      </div>
    </div>
  );
}
