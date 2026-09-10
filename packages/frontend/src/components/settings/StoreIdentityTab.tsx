import { ReceiptPreview } from '@/features/settings/components/ReceiptPreview';
import { CARD_CLS, INPUT_CLS, LABEL_CLS, type FormState } from './settingsUi';

type Props = {
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
};

/**
 * Tab 1 — Store & Identity (TB-139). Verbatim migration of the identity,
 * fiscal, system/currency and footer sections + live receipt preview.
 * No logic changes.
 */
export function StoreIdentityTab({ form, onChange }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
      <div className="space-y-6">
        {/* Section 1 — بيانات المتجر والهوية */}
        <section className={CARD_CLS} aria-label="بيانات المتجر والهوية">
          <h2 className="mb-1 text-sm font-bold text-slate-100">بيانات المتجر والهوية</h2>
          <p className="mb-4 text-xs text-slate-400">تظهر هذه البيانات في ترويسة كل فاتورة وإيصال</p>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <label htmlFor="business_name" className={LABEL_CLS}>
                اسم المحل <span className="text-rose-400">*</span>
              </label>
              <input
                id="business_name"
                type="text"
                required
                value={form.business_name}
                onChange={(e) => onChange('business_name', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: BarakaMobile"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="business_phone" className={LABEL_CLS}>
                رقم الهاتف
              </label>
              <input
                id="business_phone"
                type="text"
                value={form.business_phone}
                onChange={(e) => onChange('business_phone', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: 0555123456"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="business_address" className={LABEL_CLS}>
                العنوان
              </label>
              <textarea
                id="business_address"
                rows={3}
                value={form.business_address}
                onChange={(e) => onChange('business_address', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: الجزائر العاصمة"
              />
            </div>
          </div>
        </section>

        {/* Section 1B — البيانات القانونية والجبائية (للفواتير الرسمية) */}
        <section className={CARD_CLS} aria-label="البيانات القانونية والجبائية">
          <h2 className="mb-1 text-sm font-bold text-slate-100">البيانات القانونية والجبائية (للفواتير الرسمية)</h2>
          <p className="mb-4 text-xs text-slate-400">السجل التجاري، رقم التعريف الجبائي، المادة الجبائية ورقم التعريف الإحصائي (تظهر في الفاتورة الرسمية)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="business_rc" className={LABEL_CLS}>
                رقم السجل التجاري (RC)
              </label>
              <input
                id="business_rc"
                type="text"
                value={form.business_rc}
                onChange={(e) => onChange('business_rc', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: 16/00-1234567A26"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="business_nif" className={LABEL_CLS}>
                رقم التعريف الجبائي (NIF)
              </label>
              <input
                id="business_nif"
                type="text"
                value={form.business_nif}
                onChange={(e) => onChange('business_nif', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: 123456789012345"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="business_nis" className={LABEL_CLS}>
                رقم التعريف الإحصائي (NIS)
              </label>
              <input
                id="business_nis"
                type="text"
                value={form.business_nis}
                onChange={(e) => onChange('business_nis', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: 123456789012345"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="business_art" className={LABEL_CLS}>
                رقم المادة الجبائية (Article d'imposition)
              </label>
              <input
                id="business_art"
                type="text"
                value={form.business_art}
                onChange={(e) => onChange('business_art', e.target.value)}
                className={INPUT_CLS}
                placeholder="مثال: 12345678"
                dir="ltr"
              />
            </div>
          </div>
        </section>

        {/* Section 2 — إعدادات النظام والعملة والحدود */}
        <section className={CARD_CLS} aria-label="إعدادات النظام والعملة والحدود">
          <h2 className="mb-1 text-sm font-bold text-slate-100">إعدادات النظام والعملة والحدود</h2>
          <p className="mb-4 text-xs text-slate-400">رمز العملة يظهر في كل الشاشات والتقارير</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="currency_symbol" className={LABEL_CLS}>
                رمز العملة <span className="text-rose-400">*</span>
              </label>
              <input
                id="currency_symbol"
                type="text"
                required
                value={form.currency_symbol}
                onChange={(e) => onChange('currency_symbol', e.target.value)}
                className={INPUT_CLS}
                placeholder="د.ج"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="low_stock_threshold" className={LABEL_CLS}>
                حد تنبيه المخزون المنخفض
              </label>
              <input
                id="low_stock_threshold"
                type="number"
                min={1}
                step={1}
                value={form.low_stock_threshold}
                onChange={(e) => onChange('low_stock_threshold', e.target.value)}
                className={INPUT_CLS}
              />
              <p className="text-xs text-slate-400">يؤثر على تنبيهات التقارير فقط — لا يغيّر حد الصنف الفعلي</p>
            </div>
          </div>
        </section>

        {/* Section 3 — تذييل الفواتير والملاحظات */}
        <section className={CARD_CLS} aria-label="تذييل الفواتير والملاحظات">
          <h2 className="mb-1 text-sm font-bold text-slate-100">تذييل الفواتير والملاحظات</h2>
          <p className="mb-4 text-xs text-slate-400">تظهر أسفل كل إيصال مطبوع — جرّبها فوراً في المعاينة</p>
          <div className="space-y-1.5">
            <label htmlFor="invoice_footer_note" className={LABEL_CLS}>
              ملاحظة أسفل الفاتورة
            </label>
            <textarea
              id="invoice_footer_note"
              rows={3}
              value={form.invoice_footer_note}
              onChange={(e) => onChange('invoice_footer_note', e.target.value)}
              className={INPUT_CLS}
              placeholder="مثال: شكراً لزيارتكم"
            />
          </div>
        </section>
      </div>

      {/* Preview column — sticky on desktop, stacked on mobile */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <ReceiptPreview
          businessName={form.business_name}
          businessPhone={form.business_phone}
          businessAddress={form.business_address}
          currencySymbol={form.currency_symbol || 'د.ج'}
          footerNote={form.invoice_footer_note}
        />
      </div>
    </div>
  );
}
