import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, X } from 'lucide-react';
import { useSearch } from '@/features/search/hooks/useSearch';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { PRICING_LABEL } from '../../lib/labels';

const ROLE_LABEL: Record<string, string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

export function GlobalSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOverlayOpen, setMobileOverlayOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  const trimmedInput = inputValue.trim();

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(inputValue);
      if (inputValue.trim().length >= 1) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data, isLoading, isFetching, isError } = useSearch(debouncedQuery);

  const showSpinner = (isLoading || isFetching) && trimmedInput.length >= 1;

  // Outside click to close desktop dropdown
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 640) {
          setMobileOverlayOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 100);
        } else {
          const el = containerRef.current?.querySelector('input') as HTMLInputElement | null;
          el?.focus();
        }
      }
      if (e.key === 'Escape' && mobileOverlayOpen) {
        setMobileOverlayOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOverlayOpen]);

  // Body scroll lock for mobile overlay
  useEffect(() => {
    if (mobileOverlayOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      setTimeout(() => mobileInputRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOverlayOpen]);

  const handleSelect = (path: string) => {
    navigate(path);
    setInputValue('');
    setDebouncedQuery('');
    setIsOpen(false);
    setMobileOverlayOpen(false);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.trim().length === 0) {
      setIsOpen(false);
    }
  };

  const handleFocus = () => {
    if (trimmedInput.length >= 1 && data) {
      setIsOpen(true);
    }
  };

  return (
    <>
      {/* Hidden trigger for AppShell mobile search button */}
      <button id="mobile-search-trigger" type="button" className="hidden" onClick={() => setMobileOverlayOpen(true)} aria-hidden="true" tabIndex={-1} />

      {/* Desktop inline search - hidden below sm */}
      <div ref={containerRef} className="relative w-full max-w-md hidden sm:block">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            {showSpinner ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            )}
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            placeholder="ابحث عن جهة اتصال، صنف، خدمة..."
            className="w-full rounded-md border border-slate-700 bg-slate-800/60 py-2 pr-10 pl-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            aria-label="بحث شامل"
          />
        </div>

        {isOpen && trimmedInput.length >= 1 && (
          <div className="absolute z-50 mt-2 max-h-96 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 shadow-xl">
            {isError ? (
              <div className="px-4 py-6 text-center text-sm text-rose-400">حدث خطأ، حاول مرة أخرى</div>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>جاري البحث...</span>
              </div>
            ) : data && data.totalCount === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                لا توجد نتائج لـ «{data.query}»
              </div>
            ) : data ? (
              <div className="divide-y divide-slate-800">
                {data.contacts.length > 0 && (
                  <div className="py-2">
                    <div className="px-4 py-1 text-xs font-semibold text-slate-400">
                      جهات الاتصال ({data.contacts.length})
                    </div>
                    <ul>
                      {data.contacts.map((contact) => (
                        <li key={contact.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect('/contacts')}
                            className="flex w-full items-center gap-2 px-4 py-2 text-right text-sm text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                          >
                            <span className="font-medium text-slate-100">{contact.name}</span>
                            <span className="text-slate-500">—</span>
                            <span className="text-slate-400">{ROLE_LABEL[contact.role] ?? contact.role}</span>
                            {contact.phone && (
                              <>
                                <span className="text-slate-500">—</span>
                                <span className="font-mono text-slate-400" dir="ltr">{contact.phone}</span>
                              </>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.items.length > 0 && (
                  <div className="py-2">
                    <div className="px-4 py-1 text-xs font-semibold text-slate-400">
                      المخزون ({data.items.length})
                    </div>
                    <ul>
                      {data.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect('/inventory')}
                            className="flex w-full items-center gap-2 px-4 py-2 text-right text-sm text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                          >
                            <span className="font-medium text-slate-100">{item.name}</span>
                            {item.sku && (
                              <>
                                <span className="text-slate-500">—</span>
                                <span className="font-mono text-slate-400" dir="ltr">{item.sku}</span>
                              </>
                            )}
                            <span className="text-slate-500">—</span>
                            <span className="font-mono text-slate-300">{item.sellingPrice} {currencySymbol}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.services.length > 0 && (
                  <div className="py-2">
                    <div className="px-4 py-1 text-xs font-semibold text-slate-400">
                      الخدمات ({data.services.length})
                    </div>
                    <ul>
                      {data.services.map((service) => (
                        <li key={service.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect('/services')}
                            className="flex w-full items-center gap-2 px-4 py-2 text-right text-sm text-slate-200 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                          >
                            <span className="font-medium text-slate-100">{service.name}</span>
                            <span className="text-slate-500">—</span>
                            <span className="text-slate-400">
                              {PRICING_LABEL[service.pricingType] ?? service.pricingType}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Mobile overlay - visible below sm via trigger */}
      {mobileOverlayOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 sm:hidden" dir="rtl">
          <div className="flex h-14 items-center gap-2 border-b border-slate-800 bg-slate-900 px-3">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <input
                ref={mobileInputRef}
                type="text"
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="ابحث عن جهة اتصال، صنف، خدمة..."
                className="w-full rounded-md border border-slate-700 bg-slate-800/60 py-2 pr-10 pl-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                aria-label="بحث شامل"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileOverlayOpen(false)}
              aria-label="إغلاق البحث"
              className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 min-h-11 min-w-11"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-950 p-2">
            {trimmedInput.length < 1 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">اكتب للبحث في جهات الاتصال والمخزون والخدمات</div>
            ) : isError ? (
              <div className="px-4 py-6 text-center text-sm text-rose-400">حدث خطأ، حاول مرة أخرى</div>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>جاري البحث...</span>
              </div>
            ) : data && data.totalCount === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">لا توجد نتائج لـ «{data.query}»</div>
            ) : data ? (
              <div className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-slate-900">
                {data.contacts.length > 0 && (
                  <div className="py-2">
                    <div className="px-4 py-1 text-xs font-semibold text-slate-400">جهات الاتصال ({data.contacts.length})</div>
                    <ul>
                      {data.contacts.map((contact) => (
                        <li key={contact.id}>
                          <button type="button" onClick={() => handleSelect('/contacts')} className="flex w-full items-center gap-2 px-4 py-2.5 text-right text-sm text-slate-200 hover:bg-slate-800 min-h-11">
                            <span className="font-medium text-slate-100">{contact.name}</span>
                            <span className="text-slate-500">—</span>
                            <span className="text-slate-400">{ROLE_LABEL[contact.role] ?? contact.role}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.items.length > 0 && (
                  <div className="py-2">
                    <div className="px-4 py-1 text-xs font-semibold text-slate-400">المخزون ({data.items.length})</div>
                    <ul>
                      {data.items.map((item) => (
                        <li key={item.id}>
                          <button type="button" onClick={() => handleSelect('/inventory')} className="flex w-full items-center gap-2 px-4 py-2.5 text-right text-sm text-slate-200 hover:bg-slate-800 min-h-11">
                            <span className="font-medium text-slate-100">{item.name}</span>
                            <span className="font-mono text-slate-300" dir="ltr">{item.sellingPrice} {currencySymbol}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.services.length > 0 && (
                  <div className="py-2">
                    <div className="px-4 py-1 text-xs font-semibold text-slate-400">الخدمات ({data.services.length})</div>
                    <ul>
                      {data.services.map((service) => (
                        <li key={service.id}>
                          <button type="button" onClick={() => handleSelect('/services')} className="flex w-full items-center gap-2 px-4 py-2.5 text-right text-sm text-slate-200 hover:bg-slate-800 min-h-11">
                            <span className="font-medium text-slate-100">{service.name}</span>
                            <span className="text-slate-400">{PRICING_LABEL[service.pricingType] ?? service.pricingType}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
