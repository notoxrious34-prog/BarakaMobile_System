import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { useSearch } from '@/features/search/hooks/useSearch';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

const ROLE_LABEL: Record<string, string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

const PRICING_LABEL: Record<string, string> = {
  FIXED: 'ربح ثابت',
  COMMISSION: 'عمولة',
};

export function GlobalSearch() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Outside click to close
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const handleSelect = (path: string) => {
    navigate(path);
    setInputValue('');
    setDebouncedQuery('');
    setIsOpen(false);
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
    <div ref={containerRef} className="relative w-full max-w-md">
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
          className="w-full rounded-md border border-slate-700 bg-slate-800/60 py-2 pr-10 pl-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
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
                              <span className="text-slate-400">{contact.phone}</span>
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
                              <span className="text-slate-400">{item.sku}</span>
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
  );
}
