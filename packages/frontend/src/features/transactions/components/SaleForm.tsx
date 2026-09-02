import { useEffect, useRef, useState, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { ApiError } from '@/lib/api';
import { useCreateSaleMutation, useAccountsByContactQuery } from '../hooks/useTransactions';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contact = { id: string; name: string; role: string; phone?: string | null };
type Item = { id: string; name: string; sellingPrice: string; sku?: string | null; currentStock?: number };
type Service = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

function to2dp(v: string | number | Decimal): string {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

type CartItem = {
  itemId: string;
  name: string;
  sku?: string | null;
  availableStock: number;
  quantity: string;
  unitPrice: string;
};

type CartService = {
  serviceId: string;
  name: string;
  amount: string;
};

export function SaleForm({ open, onClose }: Props) {
  const createMut = useCreateSaleMutation();

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
    enabled: open,
  });
  const { data: items } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: () => api.get<Item[]>('/inventory/items'),
    enabled: open,
  });
  const { data: services } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
    enabled: open,
  });

  // Right column — contact & account
  const [contactQuery, setContactQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [contactHighlight, setContactHighlight] = useState(0);
  const [contactListOpen, setContactListOpen] = useState(false);

  // Center — cart
  const [itemQuery, setItemQuery] = useState('');
  const [itemHighlight, setItemHighlight] = useState(0);
  const [itemListOpen, setItemListOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState('');
  const [serviceHighlight, setServiceHighlight] = useState(0);
  const [serviceListOpen, setServiceListOpen] = useState(false);
  const [serviceSearchActive, setServiceSearchActive] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartServices, setCartServices] = useState<CartService[]>([]);

  // Left — payment
  const [amountPaidNow, setAmountPaidNow] = useState('');
  const [note, setNote] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const contactInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const serviceInputRef = useRef<HTMLInputElement>(null);
  const canSubmitRef = useRef(false);

  const { data: accounts } = useAccountsByContactQuery(selectedContact?.id ?? '');

  const customerAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.role === 'CUSTOMER'),
    [accounts],
  );

  // Auto-focus contact search on mount
  useEffect(() => {
    if (open) {
      // defer to next tick so input is mounted
      setTimeout(() => contactInputRef.current?.focus(), 50);
    }
  }, [open]);

  // Auto-select single account when loaded
  useEffect(() => {
    if (selectedContact && customerAccounts.length === 1 && !selectedAccountId) {
      setSelectedAccountId(customerAccounts[0].id);
    }
  }, [selectedContact, customerAccounts, selectedAccountId]);

  // Global shortcuts F2 -> item search, F9 -> submit if enabled
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        itemInputRef.current?.focus();
      }
      if (e.key === 'F9') {
        e.preventDefault();
        if (canSubmitRef.current) {
          const form = document.getElementById('sale-pos-form') as HTMLFormElement | null;
          form?.requestSubmit();
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Derived filters
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts.filter((c) => c.role === 'CUSTOMER' || c.role === 'BOTH');
    return contacts.filter((c) => {
      if (c.role !== 'CUSTOMER' && c.role !== 'BOTH') return false;
      const name = (c.name ?? '').toLowerCase();
      const phone = (c.phone ?? '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [contacts, contactQuery]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const q = itemQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const name = (it.name ?? '').toLowerCase();
      const sku = (it.sku ?? '').toLowerCase();
      return name.includes(q) || sku.includes(q);
    });
  }, [items, itemQuery]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => (s.name ?? '').toLowerCase().includes(q));
  }, [services, serviceQuery]);

  // Cart totals via decimal.js exclusively
  const lineTotals: string[] = useMemo(() => {
    const out: string[] = [];
    for (const r of cartItems) {
      const qty = r.quantity.trim();
      const price = r.unitPrice.trim();
      if (!qty || !price) {
        out.push('0.00');
        continue;
      }
      // only compute when both valid; otherwise 0.00 for display
      if (!/^\d+$/.test(qty) || !DECIMAL_RE.test(price)) {
        out.push('0.00');
        continue;
      }
      try {
        const t = new Decimal(price).times(new Decimal(qty)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
        out.push(t);
      } catch {
        out.push('0.00');
      }
    }
    return out;
  }, [cartItems]);

  const serviceTotals: string[] = useMemo(() => {
    return cartServices.map((s) => {
      const a = s.amount.trim();
      if (!a || !DECIMAL_RE.test(a)) return '0.00';
      try {
        return new Decimal(a).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      } catch {
        return '0.00';
      }
    });
  }, [cartServices]);

  const cartTotal: string = useMemo(() => {
    let sum = new Decimal(0);
    for (const t of lineTotals) {
      try {
        sum = sum.plus(new Decimal(t));
      } catch {}
    }
    for (const t of serviceTotals) {
      try {
        sum = sum.plus(new Decimal(t));
      } catch {}
    }
    return sum.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }, [lineTotals, serviceTotals]);

  const remaining: string | null = useMemo(() => {
    const v = amountPaidNow.trim();
    if (!v) return null;
    if (!DECIMAL_RE.test(v)) return null;
    try {
      const total = new Decimal(cartTotal);
      const paid = new Decimal(v);
      return total.minus(paid).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    } catch {
      return null;
    }
  }, [amountPaidNow, cartTotal]);

  const totalLinesCount = cartItems.length + cartServices.length;

  // Validation
  const hasValidationError = useMemo(() => {
    // amountPaidNow regex when non-empty
    if (amountPaidNow.trim() && !DECIMAL_RE.test(amountPaidNow.trim())) return true;
    for (const r of cartItems) {
      const qtyStr = r.quantity.trim();
      if (!/^\d+$/.test(qtyStr)) return true;
      const qty = Number(qtyStr);
      if (!Number.isInteger(qty) || qty < 1) return true;
      if (qty > r.availableStock) return true;
      if (!DECIMAL_RE.test(r.unitPrice.trim())) return true;
    }
    for (const s of cartServices) {
      if (!DECIMAL_RE.test(s.amount.trim())) return true;
      // also must be >0
      try {
        if (new Decimal(s.amount.trim()).lte(0)) return true;
      } catch {
        return true;
      }
    }
    return false;
  }, [cartItems, cartServices, amountPaidNow]);

  const isSubmitDisabled =
    !selectedAccountId ||
    totalLinesCount === 0 ||
    hasValidationError ||
    createMut.isPending;

  canSubmitRef.current = !isSubmitDisabled;

  function resetAll() {
    setContactQuery('');
    setSelectedContact(null);
    setSelectedAccountId('');
    setContactHighlight(0);
    setContactListOpen(false);
    setItemQuery('');
    setItemHighlight(0);
    setItemListOpen(false);
    setServiceQuery('');
    setServiceHighlight(0);
    setServiceListOpen(false);
    setServiceSearchActive(false);
    setCartItems([]);
    setCartServices([]);
    setAmountPaidNow('');
    setNote('');
    setApiError(null);
  }

  // When open prop changes to true, reset
  useEffect(() => {
    if (open) resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSelectContact(c: Contact) {
    setSelectedContact(c);
    setContactQuery('');
    setContactListOpen(false);
    setContactHighlight(0);
    setSelectedAccountId('');
    // focus item search after contact selected if account will be auto-selected
    setTimeout(() => itemInputRef.current?.focus(), 100);
  }

  function handleAddItem(item: Item) {
    const stock = typeof item.currentStock === 'number' ? item.currentStock : 999999;
    const existingIdx = cartItems.findIndex((r) => r.itemId === item.id);
    if (existingIdx >= 0) {
      setCartItems((prev) =>
        prev.map((r, i) => {
          if (i !== existingIdx) return r;
          const curQty = Number(r.quantity) || 0;
          const nextQty = Math.min(curQty + 1, stock);
          return { ...r, quantity: String(nextQty) };
        }),
      );
    } else {
      setCartItems((prev) => [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku ?? null,
          availableStock: stock,
          quantity: '1',
          unitPrice: to2dp(item.sellingPrice ?? '0.00'),
        },
      ]);
    }
    setItemQuery('');
    setItemListOpen(false);
    setItemHighlight(0);
    // keep focus on item input for rapid entry
    setTimeout(() => itemInputRef.current?.focus(), 0);
  }

  function handleAddService(svc: Service) {
    setCartServices((prev) => [...prev, { serviceId: svc.id, name: svc.name, amount: '' }]);
    setServiceQuery('');
    setServiceListOpen(false);
    setServiceHighlight(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (isSubmitDisabled) return;

    const accountId = selectedAccountId;
    if (!accountId) {
      setApiError('يجب اختيار حساب العميل');
      return;
    }

    // Build payload contract exactly — no contactId, type hardcoded in mutation
    const itemLines =
      cartItems.length > 0
        ? cartItems.map((r) => ({
            itemId: r.itemId,
            quantity: Number(r.quantity),
            unitPrice: to2dp(r.unitPrice.trim()),
          }))
        : undefined;

    const serviceLines =
      cartServices.length > 0
        ? cartServices.map((s) => ({
            serviceId: s.serviceId,
            amount: to2dp(s.amount.trim()),
          }))
        : undefined;

    const amount = cartTotal;
    const trimmedPaid = amountPaidNow.trim();
    const amountPaidNowPayload = trimmedPaid ? to2dp(trimmedPaid) : undefined;
    const notePayload = note.trim() || undefined;

    try {
      await createMut.mutateAsync({
        accountId,
        amount,
        amountPaidNow: amountPaidNowPayload,
        note: notePayload,
        itemLines,
        serviceLines,
      });
      // onSuccess: full reset ready for next sale
      resetAll();
      // keep dialog open for next sale per spec (do not call onClose automatically)
      // invalidate handled inside mutation
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setApiError(msg);
    }
  }

  if (!open) return null;

  const isSubmitting = createMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" dir="rtl" onClick={onClose}>
      {/* Header bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 text-slate-100" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">نقطة البيع — تسجيل بيع جديد</h2>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-400 sm:inline">F2 بحث صنف · F9 تسجيل</span>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Three-column shell */}
      <div
        className="flex w-full flex-1 overflow-hidden"
        dir="rtl"
        style={{ display: 'flex', flexDirection: 'row-reverse', height: 'calc(100vh - 48px)', overflow: 'hidden', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left column — Payment & Submit (320px) — visually left in RTL row-reverse means last DOM, but row-reverse puts first DOM on right */}
        {/* To keep logical order Right/Center/Left with row-reverse, we place Right first, Center second, Left third */}
        {/* Right column — Contact & Account (280px) */}
        <div className="flex w-[280px] shrink-0 flex-col border-l border-slate-800 bg-white overflow-y-auto">
          <div className="p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-700">العميل والحساب</h3>

            {!selectedContact ? (
              <div className="relative">
                <input
                  ref={contactInputRef}
                  type="text"
                  value={contactQuery}
                  onChange={(e) => {
                    setContactQuery(e.target.value);
                    setContactListOpen(true);
                    setContactHighlight(0);
                  }}
                  onFocus={() => setContactListOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (!contactListOpen) setContactListOpen(true);
                      else setContactHighlight((h) => Math.min(h + 1, Math.max(filteredContacts.length - 1, 0)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setContactHighlight((h) => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const target = filteredContacts[contactHighlight];
                      if (target) handleSelectContact(target);
                    } else if (e.key === 'Escape') {
                      setContactQuery('');
                      setContactListOpen(false);
                    }
                  }}
                  placeholder="ابحث عن عميل..."
                  autoFocus
                  className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                    false ? 'border-red-500' : 'border-gray-300 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
                  }`}
                />
                {contactListOpen && (
                  <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow">
                    {filteredContacts.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">لا نتائج</p>
                    ) : (
                      filteredContacts.map((c, idx) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectContact(c)}
                          className={`flex w-full flex-col items-start px-3 py-2 text-right text-sm ${
                            idx === contactHighlight ? 'bg-blue-100 font-semibold' : 'bg-white hover:bg-blue-50'
                          }`}
                        >
                          <span className="text-slate-900">{c.name}</span>
                          <span className="text-xs text-slate-500" dir="ltr">
                            {c.phone ?? '—'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{selectedContact.name}</p>
                  <p className="text-xs text-slate-500" dir="ltr">
                    {selectedContact.phone ?? '—'}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">الحساب</label>
                  {customerAccounts.length === 0 ? (
                    <p className="text-xs text-red-500">لا يوجد حساب عميل لهذا العميل</p>
                  ) : (
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">اختر الحساب</option>
                      {customerAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {(a as unknown as { label?: string }).label ?? a.id.slice(0, 8)} — {to2dp(a.currentBalance)} دج
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <button type="button" onClick={resetAll} className="text-xs font-medium text-red-500 hover:text-red-600">
                  مسح
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center column — Cart (flex-grow min 400px) */}
        <div className="flex min-w-[400px] flex-1 flex-col overflow-hidden bg-gray-50">
          <div className="flex-1 overflow-y-auto p-3">
            {/* Item search */}
            <div className="relative mb-3">
              <input
                ref={itemInputRef}
                type="text"
                value={itemQuery}
                onChange={(e) => {
                  setItemQuery(e.target.value);
                  setItemListOpen(true);
                  setItemHighlight(0);
                }}
                onFocus={() => {
                  if (selectedAccountId) setItemListOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!itemListOpen) setItemListOpen(true);
                    else setItemHighlight((h) => Math.min(h + 1, Math.max(filteredItems.length - 1, 0)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setItemHighlight((h) => Math.max(h - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const target = filteredItems[itemHighlight];
                    if (target && selectedAccountId) handleAddItem(target);
                  } else if (e.key === 'Escape') {
                    setItemListOpen(false);
                  }
                }}
                placeholder="ابحث عن صنف..."
                disabled={!selectedAccountId}
                className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  itemListOpen && filteredItems.length > 0 ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-300 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
                }`}
              />
              {itemListOpen && selectedAccountId && itemQuery.trim() && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow">
                  {filteredItems.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">لا نتائج</p>
                  ) : (
                    filteredItems.slice(0, 20).map((it, idx) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => handleAddItem(it)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-right text-sm ${
                          idx === itemHighlight ? 'bg-blue-100 font-semibold' : 'bg-white hover:bg-blue-50'
                        }`}
                      >
                        <span className="text-slate-900">{it.name}</span>
                        <span className="flex items-center gap-2 text-xs text-slate-500">
                          <span>متوفر {typeof it.currentStock === 'number' ? it.currentStock : '—'}</span>
                          <span>·</span>
                          <span>{to2dp(it.sellingPrice ?? '0.00')} دج</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              {!selectedAccountId && <p className="mt-1 text-xs text-slate-400">اختر العميل والحساب أولاً</p>}
            </div>

            {/* Cart — item lines table */}
            {cartItems.length === 0 ? (
              <p className="mb-4 rounded-md border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-xs text-slate-400">السلة فارغة — ابحث عن صنف لإضافته</p>
            ) : (
              <div className="mb-4 overflow-hidden rounded-md border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-xs text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-right">#</th>
                      <th className="px-2 py-2 text-right">اسم الصنف</th>
                      <th className="px-2 py-2 text-right">الكمية</th>
                      <th className="px-2 py-2 text-right">سعر الوحدة</th>
                      <th className="px-2 py-2 text-right">الإجمالي</th>
                      <th className="px-2 py-2 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartItems.map((row, idx) => {
                      const qtyNum = Number(row.quantity);
                      const stockInvalid = !/^\d+$/.test(row.quantity.trim()) || !Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > row.availableStock;
                      const priceInvalid = !DECIMAL_RE.test(row.unitPrice.trim());
                      const rowInvalid = stockInvalid || priceInvalid;
                      return (
                        <tr key={row.itemId + '-' + idx} className={`${rowInvalid ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}`}>
                          <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-1.5 text-slate-900">
                            <div className="flex flex-col">
                              <span>{row.name}</span>
                              {row.sku && <span className="text-xs text-slate-400">{row.sku}</span>}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={row.quantity}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCartItems((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: v } : r)));
                              }}
                              className={`w-20 rounded-md border px-2 py-1 text-sm text-slate-900 focus:outline-none ${
                                stockInvalid ? 'border-red-500' : 'border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
                              }`}
                              dir="ltr"
                            />
                            <p className="text-xs text-slate-400">متوفر {row.availableStock}</p>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.unitPrice}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCartItems((prev) => prev.map((r, i) => (i === idx ? { ...r, unitPrice: v } : r)));
                              }}
                              className={`w-24 rounded-md border px-2 py-1 text-sm text-slate-900 focus:outline-none ${
                                priceInvalid ? 'border-red-500' : 'border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
                              }`}
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-slate-900" dir="ltr">
                            {lineTotals[idx] ?? '0.00'}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => setCartItems((prev) => prev.filter((_, i) => i !== idx))}
                              className="rounded p-1 text-red-500 hover:bg-gray-100"
                              aria-label="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Service lines block */}
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-700">الخدمات</h4>
              <button
                type="button"
                onClick={() => {
                  if (!selectedAccountId) return;
                  setServiceSearchActive(true);
                  setServiceListOpen(true);
                  setTimeout(() => serviceInputRef.current?.focus(), 0);
                }}
                disabled={!selectedAccountId}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + إضافة خدمة
              </button>
            </div>

            {serviceSearchActive && (
              <div className="relative mb-2">
                <input
                  ref={serviceInputRef}
                  type="text"
                  value={serviceQuery}
                  onChange={(e) => {
                    setServiceQuery(e.target.value);
                    setServiceListOpen(true);
                    setServiceHighlight(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setServiceHighlight((h) => Math.min(h + 1, Math.max(filteredServices.length - 1, 0)));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setServiceHighlight((h) => Math.max(h - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const target = filteredServices[serviceHighlight];
                      if (target) handleAddService(target);
                    } else if (e.key === 'Escape') {
                      setServiceSearchActive(false);
                      setServiceListOpen(false);
                    }
                  }}
                  placeholder="ابحث عن خدمة..."
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:border-blue-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {serviceListOpen && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow">
                    {filteredServices.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">لا نتائج</p>
                    ) : (
                      filteredServices.slice(0, 20).map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleAddService(s)}
                          className={`w-full px-3 py-2 text-right text-sm ${idx === serviceHighlight ? 'bg-blue-100 font-semibold' : 'bg-white hover:bg-blue-50'}`}
                        >
                          {s.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {cartServices.length === 0 ? (
              <p className="mb-2 text-xs text-slate-400">لا خدمات مضافة</p>
            ) : (
              <div className="mb-4 overflow-hidden rounded-md border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-xs text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-right">اسم الخدمة</th>
                      <th className="px-2 py-2 text-right">المبلغ</th>
                      <th className="px-2 py-2 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartServices.map((s, idx) => {
                      const invalid = !DECIMAL_RE.test(s.amount.trim());
                      return (
                        <tr key={s.serviceId + '-' + idx} className={`${invalid ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}`}>
                          <td className="px-2 py-1.5 text-slate-900">{s.name}</td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={s.amount}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCartServices((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: v } : r)));
                              }}
                              placeholder="0.00"
                              className={`w-28 rounded-md border px-2 py-1 text-sm text-slate-900 focus:outline-none ${invalid ? 'border-red-500' : 'border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'}`}
                              dir="ltr"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => setCartServices((prev) => prev.filter((_, i) => i !== idx))}
                              className="rounded p-1 text-red-500 hover:bg-gray-100"
                              aria-label="حذف"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cart totals bar — sticky bottom of center column */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">عدد الأصناف: {totalLinesCount}</span>
              <span className="text-lg font-bold text-slate-900">إجمالي الفاتورة: {cartTotal} دج</span>
            </div>
          </div>
        </div>

        {/* Left column — Payment & Submit (320px) */}
        <div className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-white">
          <form id="sale-pos-form" onSubmit={handleSubmit} className="flex flex-1 flex-col p-3" noValidate>
            <h3 className="mb-3 text-xs font-semibold text-slate-700">الدفع</h3>

            <div className="mb-3">
              <label htmlFor="sale-paid" className="mb-1 block text-xs font-medium text-slate-600">
                المبلغ المستلم الآن
              </label>
              <input
                id="sale-paid"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountPaidNow}
                onChange={(e) => setAmountPaidNow(e.target.value)}
                dir="ltr"
                className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                  amountPaidNow.trim() && !DECIMAL_RE.test(amountPaidNow.trim())
                    ? 'border-red-500'
                    : 'border-gray-300 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
                }`}
              />
              {amountPaidNow.trim() && !DECIMAL_RE.test(amountPaidNow.trim()) && (
                <p className="mt-1 text-xs text-red-500">المبلغ يجب أن يكون رقمًا بصيغة عشرية صحيحة</p>
              )}
              {remaining !== null && (
                <p className="mt-1 text-xs text-slate-500">المتبقي: {remaining} دج</p>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="sale-note" className="mb-1 block text-xs font-medium text-slate-600">
                ملاحظة
              </label>
              <textarea
                id="sale-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="ملاحظة اختيارية"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:border-blue-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="mt-auto">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                    جارٍ التسجيل...
                  </>
                ) : (
                  'تسجيل البيع'
                )}
              </button>
              {apiError && (
                <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
                  {apiError}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">F9 للتسجيل عند الجاهزية</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
