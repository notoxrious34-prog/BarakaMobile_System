import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Printer, Minus, Plus, X } from 'lucide-react';
import type { Item } from '../../hooks/useInventory';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { BarcodeSvg } from './BarcodeSvg';
import { LABEL_PRESETS, LABEL_PRESET_LIST, type LabelPreset } from './label-templates';

export type LabelQueueEntry = {
  item: Item;
  quantity: number;
  imei?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialQueue: LabelQueueEntry[];
};

/** Decimal price: 2dp + thousands separators (string grouping only, no float). */
function formatPrice(v: string | undefined | null): string {
  try {
    const fixed = new Decimal(v ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    const parts = fixed.split('.');
    return `${(parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${parts[1] ?? '00'}`;
  } catch {
    return '0.00';
  }
}

function clampQty(n: number): number {
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 999);
}

function barcodeValue(item: Item): string {
  const sku = (item.sku ?? '').trim();
  return sku !== '' ? sku : item.id;
}

export function BarcodePrintModal({ open, onClose, initialQueue }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const storeName = settingsData?.business_name?.trim() || '';
  const currency = settingsData?.currency_symbol ?? 'د.ج';

  const [presetId, setPresetId] = useState<string>('STANDARD_50X25');
  const preset: LabelPreset = LABEL_PRESETS[presetId] ?? LABEL_PRESETS.STANDARD_50X25!;
  const [queue, setQueue] = useState<LabelQueueEntry[]>(initialQueue);
  const [showStore, setShowStore] = useState(preset.showStoreNameDefault);
  const [showPrice, setShowPrice] = useState(preset.showPriceDefault);
  const [showSku, setShowSku] = useState(preset.showSkuDefault);
  const [showImei, setShowImei] = useState(true);
  const [applyAllQty, setApplyAllQty] = useState('1');

  useEffect(() => {
    if (open) {
      setQueue(initialQueue.map((e) => ({ ...e, quantity: clampQty(e.quantity) })));
      const p = LABEL_PRESETS[presetId] ?? LABEL_PRESETS.STANDARD_50X25!;
      setShowStore(p.showStoreNameDefault);
      setShowPrice(p.showPriceDefault);
      setShowSku(p.showSkuDefault);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  useEffect(() => {
    const p = LABEL_PRESETS[presetId] ?? LABEL_PRESETS.STANDARD_50X25!;
    setShowStore(p.showStoreNameDefault);
    setShowPrice(p.showPriceDefault);
    setShowSku(p.showSkuDefault);
  }, [presetId]);

  const totalLabels = useMemo(() => queue.reduce((acc, e) => acc + e.quantity, 0), [queue]);

  const setQty = (itemId: string, qty: number) =>
    setQueue((q) => q.map((e) => (e.item.id === itemId ? { ...e, quantity: clampQty(qty) } : e)));
  const setImei = (itemId: string, imei: string) =>
    setQueue((q) => q.map((e) => (e.item.id === itemId ? { ...e, imei } : e)));
  const removeRow = (itemId: string) => setQueue((q) => q.filter((e) => e.item.id !== itemId));

  const doPrint = () => {
    document.body.classList.add('printing-barcode');
    window.print();
    window.setTimeout(() => document.body.classList.remove('printing-barcode'), 500);
  };

  if (!open) return null;

  const labels: { key: string; item: Item; imei?: string }[] = [];
  for (const e of queue) {
    for (let k = 0; k < e.quantity; k++) labels.push({ key: `${e.item.id}-${k}`, item: e.item, imei: e.imei?.trim() || undefined });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="طباعة ملصقات الباركود">
      {/* Dynamic @page: exact label dimensions, zero margin */}
      <style>{`@page { size: ${preset.widthMm}mm ${preset.heightMm}mm; margin: 0; }`}</style>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="text-sm font-extrabold text-slate-100">طباعة ملصقات الباركود — إجمالي الملصقات: <bdi className="font-mono">{totalLabels}</bdi> ملصق</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06]" aria-label="إغلاق">✕</button>
        </div>

        <div className="scrollbar-premium flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-slate-300">مقاس الملصق</label>
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50">
                {LABEL_PRESET_LIST.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">{preset.description}</p>
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showStore} onChange={(e) => setShowStore(e.target.checked)} className="accent-cyan-500" /> عرض اسم المحل{storeName ? ` (${storeName})` : ''}</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} className="accent-cyan-500" /> عرض السعر</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} className="accent-cyan-500" /> عرض رمز المادة (SKU)</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showImei} onChange={(e) => setShowImei(e.target.checked)} className="accent-cyan-500" /> عرض الرقم التسلسلي / IMEI</label>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">المواد والكميات</span>
              <input type="text" inputMode="numeric" value={applyAllQty} onChange={(e) => setApplyAllQty(e.target.value)} className="w-14 rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 text-center font-mono text-xs text-slate-100 outline-none" dir="ltr" aria-label="كمية موحدة" />
              <button type="button" onClick={() => { const v = clampQty(Number(applyAllQty)); setQueue((q) => q.map((e) => ({ ...e, quantity: v }))); }} className="rounded-lg border border-navy-border/40 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500/40">تطبيق على الكل</button>
            </div>
            {queue.length === 0 && <p className="text-xs text-slate-500">لا توجد مواد — أغلق وأعد التحديد.</p>}
            {queue.map((e) => (
              <div key={e.item.id} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-navy-border/30 bg-white/[0.02] px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-200">{e.item.name}</span>
                <input type="text" value={e.imei ?? ''} onChange={(ev) => setImei(e.item.id, ev.target.value)} placeholder="IMEI / تسلسلي…" dir="ltr" className="w-32 rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 font-mono text-[11px] text-slate-200 outline-none focus:border-cyan-500/50" />
                <div className="flex items-center gap-1" dir="ltr">
                  <button type="button" onClick={() => setQty(e.item.id, e.quantity - 1)} className="rounded-md border border-navy-border/40 p-1 text-slate-300 hover:border-cyan-500/40" aria-label="إنقاص"><Minus className="h-3 w-3" /></button>
                  <input type="text" inputMode="numeric" value={String(e.quantity)} onChange={(e2) => { const v = Number(e2.target.value); if (Number.isInteger(v)) setQty(e.item.id, v); }} className="w-10 rounded-md border border-navy-border/40 bg-navy-950/60 py-0.5 text-center font-mono text-xs text-slate-100 outline-none" aria-label="الكمية" />
                  <button type="button" onClick={() => setQty(e.item.id, e.quantity + 1)} className="rounded-md border border-navy-border/40 p-1 text-slate-300 hover:border-cyan-500/40" aria-label="زيادة"><Plus className="h-3 w-3" /></button>
                </div>
                <button type="button" onClick={() => removeRow(e.item.id)} className="rounded-md p-1 text-rose-400 hover:bg-rose-500/10" aria-label="إزالة"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          {queue.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-slate-300">معاينة حية (نسبة الأبعاد الحقيقية {preset.widthMm}×{preset.heightMm} مم)</p>
              <div className="flex flex-wrap gap-2">
                {queue.slice(0, 4).map((e) => (
                  <LabelPreview key={e.item.id} item={e.item} imei={e.imei} preset={preset} storeName={storeName} currency={currency} showStore={showStore} showPrice={showPrice} showSku={showSku} showImei={showImei} />
                ))}
                {queue.length > 4 && <span className="text-xs text-slate-500">+ {queue.length - 4} مواد أخرى…</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-navy-border/30 p-4">
          <button type="button" disabled={queue.length === 0} onClick={doPrint} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-cyan-500 disabled:opacity-40">
            <Printer className="h-4 w-4" /> طباعة الملصقات ({totalLabels})
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm text-slate-300">إغلاق</button>
        </div>
      </div>

      {/* Isolated print sheet: one .barcode-label-item per copy */}
      <div id="barcode-label-sheet" className="hidden print:block" aria-hidden="true">
        {labels.map((l) => (
          <div key={l.key} className="barcode-label-item" style={{ width: `${preset.widthMm}mm`, height: `${preset.heightMm}mm` }}>
            {showStore && storeName !== '' && <div style={{ fontSize: preset.fontSize.title, fontWeight: 800, color: '#000' }}>{storeName}</div>}
            <div style={{ fontSize: preset.fontSize.title, fontWeight: 700, color: '#000', textAlign: 'center' }}>{l.item.name}</div>
            <BarcodeSvg value={barcodeValue(l.item)} height={Math.max(20, preset.heightMm * 3.2)} moduleWidth={preset.widthMm <= 30 ? 1 : 2} displayValue={showSku} />
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              {showPrice && <span style={{ fontSize: preset.fontSize.price, fontWeight: 800, color: '#000' }}><span dir="ltr">{formatPrice(l.item.sellingPrice)}</span> {currency}</span>}
              {showImei && l.imei && <span dir="ltr" style={{ fontSize: preset.fontSize.barcodeDigits, color: '#000', fontFamily: 'monospace' }}>{l.imei}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type PreviewProps = {
  item: Item; imei?: string; preset: LabelPreset; storeName: string; currency: string;
  showStore: boolean; showPrice: boolean; showSku: boolean; showImei: boolean;
};

function LabelPreview({ item, imei, preset, storeName, currency, showStore, showPrice, showSku, showImei }: PreviewProps) {
  const aspect = preset.widthMm / preset.heightMm;
  return (
    <div dir="rtl" className="flex flex-col items-center justify-between overflow-hidden rounded-md border border-slate-600 bg-white p-1" style={{ width: `${Math.min(220, 120 * aspect)}px`, aspectRatio: `${aspect}` }}>
      {showStore && storeName !== '' && <div className="truncate font-extrabold text-black" style={{ fontSize: '10px' }}>{storeName}</div>}
      <div className="truncate font-bold text-black" style={{ fontSize: '10px' }}>{item.name}</div>
      <BarcodeSvg value={barcodeValue(item)} height={28} moduleWidth={1} displayValue={showSku} digitsClassName="text-black" />
      <div className="flex w-full items-center justify-between">
        {showPrice && <span className="font-extrabold text-black" style={{ fontSize: '11px' }}><span dir="ltr">{formatPrice(item.sellingPrice)}</span> {currency}</span>}
        {showImei && imei?.trim() && <span dir="ltr" className="font-mono text-black" style={{ fontSize: '8px' }}>{imei.trim()}</span>}
      </div>
    </div>
  );
}
