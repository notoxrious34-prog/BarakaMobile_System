import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, LayoutDashboard, ShoppingCart, Wrench, Users, Package, Wallet, BarChart3, Settings, Plus, FilePlus, CreditCard, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PRICING_LABEL } from '@/lib/labels';

type SearchResponse = {
  query: string;
  contacts: Array<{ id: string; name: string; phone: string | null; role: string }>;
  items: Array<{ id: string; name: string; sku: string | null; sellingPrice: string }>;
  services: Array<{ id: string; name: string; pricingType: string }>;
  totalCount: number;
};

type PaletteItem = {
  id: string;
  label: string;
  subLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  category: 'nav' | 'action' | 'result';
  badge?: string;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const trimmed = query.trim();

  const searchQ = useQuery<SearchResponse>({
    queryKey: ['search', 'palette', trimmed],
    queryFn: () => api.get<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}&limit=6`),
    enabled: trimmed.length >= 1 && open,
    staleTime: 10000,
  });

  const navItems: PaletteItem[] = useMemo(
    () => [
      { id: 'nav-dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, category: 'nav', action: () => { navigate('/'); onClose(); } },
      { id: 'nav-pos', label: 'نقطة البيع', icon: ShoppingCart, category: 'nav', action: () => { navigate('/pos'); onClose(); } },
      { id: 'nav-repairs', label: 'الصيانة', icon: Wrench, category: 'nav', action: () => { navigate('/repairs'); onClose(); } },
      { id: 'nav-contacts', label: 'جهات الاتصال', icon: Users, category: 'nav', action: () => { navigate('/admin/contacts'); onClose(); } },
      { id: 'nav-catalog', label: 'الكتالوج', icon: Package, category: 'nav', action: () => { navigate('/admin/catalog'); onClose(); } },
      { id: 'nav-finance', label: 'المالية', icon: Wallet, category: 'nav', action: () => { navigate('/admin/finance'); onClose(); } },
      { id: 'nav-reports', label: 'التقارير', icon: BarChart3, category: 'nav', action: () => { navigate('/admin/reports'); onClose(); } },
      { id: 'nav-settings', label: 'الإعدادات', icon: Settings, category: 'nav', action: () => { navigate('/settings'); onClose(); } },
    ],
    [navigate, onClose],
  );

  const actionItems: PaletteItem[] = useMemo(
    () => [
      { id: 'act-sale', label: 'تسجيل بيع جديد', subLabel: 'فتح نقطة البيع', icon: Plus, category: 'action', action: () => { navigate('/pos'); onClose(); } },
      { id: 'act-repair', label: 'فتح تذكرة صيانة', subLabel: 'إنشاء تذكرة إصلاح', icon: FilePlus, category: 'action', action: () => { navigate('/repairs'); onClose(); } },
      { id: 'act-cash', label: 'تسجيل حركة نقدية / مصاريف', subLabel: 'المالية — الصندوق والمصاريف', icon: CreditCard, category: 'action', action: () => { navigate('/admin/finance'); onClose(); } },
    ],
    [navigate, onClose],
  );

  const searchItems: PaletteItem[] = useMemo(() => {
    if (!searchQ.data || trimmed.length === 0) return [];
    const out: PaletteItem[] = [];
    for (const c of searchQ.data.contacts.slice(0, 6)) {
      out.push({
        id: `res-contact-${c.id}`,
        label: c.name,
        subLabel: c.phone ?? undefined,
        icon: Users,
        category: 'result',
        badge: 'عميل',
        action: () => { navigate('/admin/contacts'); onClose(); },
      });
    }
    for (const it of searchQ.data.items.slice(0, 6)) {
      out.push({
        id: `res-item-${it.id}`,
        label: it.name,
        subLabel: it.sku ?? undefined,
        icon: Package,
        category: 'result',
        badge: 'منتج',
        action: () => { navigate('/admin/catalog'); onClose(); },
      });
    }
    for (const s of searchQ.data.services.slice(0, 6)) {
      out.push({
        id: `res-service-${s.id}`,
        label: s.name,
        subLabel: PRICING_LABEL[s.pricingType] ?? s.pricingType,
        icon: Wrench,
        category: 'result',
        badge: 'خدمة',
        action: () => { navigate('/admin/catalog'); onClose(); },
      });
    }
    return out.slice(0, 6);
  }, [searchQ.data, trimmed, navigate, onClose]);

  const hasQuery = trimmed.length > 0;

  const sections: Array<{ title: string; items: PaletteItem[] }> = useMemo(() => {
    if (hasQuery) {
      if (searchItems.length > 0) return [{ title: 'نتائج البحث المباشرة', items: searchItems }];
      if (searchQ.isLoading) return [{ title: 'نتائج البحث المباشرة', items: [] }];
      return [{ title: 'نتائج البحث المباشرة', items: [] }];
    }
    return [
      { title: 'التنقل السريع', items: navItems },
      { title: 'الإجراءات السريعة', items: actionItems },
    ];
  }, [hasQuery, searchItems, searchQ.isLoading, navItems, actionItems]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // B1: reset selection to 0 when palette opens and whenever content changes (query or results identity)
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open]);
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, searchQ.data]);
  // Clamp on every render — prevents stale index after list shrinks
  const clampedIndex = flatItems.length === 0 ? 0 : Math.min(selectedIndex, flatItems.length - 1);
  const effectiveIndex = clampedIndex;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (flatItems.length === 0 ? 0 : (Math.min(i, flatItems.length - 1) + 1) % flatItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (flatItems.length === 0 ? 0 : (Math.min(i, flatItems.length - 1) - 1 + flatItems.length) % flatItems.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cur = flatItems[effectiveIndex];
        if (cur) cur.action();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, flatItems, effectiveIndex]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-navy-950/80 backdrop-blur-sm flex items-start justify-center pt-20 p-4 motion-reduce:animate-none animate-fade-in-up"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="لوحة الأوامر"
    >
      <div className="w-full max-w-xl bg-navy-900 border border-navy-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-border/30">
          <Search className="h-5 w-5 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن العملاء، المنتجات، الخدمات، التذاكر… أو اكتب أمراً"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            aria-label="بحث لوحة الأوامر"
          />
          {searchQ.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
          <span className="hidden sm:inline-flex items-center rounded border border-navy-border/30 bg-navy-800 px-1.5 py-0.5 text-xs font-mono text-slate-400">Esc</span>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-4 scrollbar-premium">
          {hasQuery && searchQ.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> جاري البحث...
            </div>
          )}
          {hasQuery && !searchQ.isLoading && searchItems.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">لا توجد نتائج لـ «{trimmed}»</div>
          )}
          {!hasQuery || searchItems.length > 0 ? (
            sections.map((section) => (
              <div key={section.title}>
                <div className="px-2 py-1 text-xs font-semibold tracking-wide text-slate-400">{section.title}</div>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const globalIdx = flatItems.findIndex((f) => f.id === item.id);
                    const isSelected = globalIdx === effectiveIndex;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={item.action}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm transition-colors border ${
                            isSelected
                              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
                              : 'bg-transparent border-transparent text-slate-200 hover:bg-white/[0.04] hover:border-navy-border/30'
                          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30`}
                        >
                          <item.icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} aria-hidden="true" />
                          <span className="flex-1 truncate font-medium">{item.label}</span>
                          {item.subLabel && <span className="hidden sm:inline text-xs text-slate-500 truncate">{item.subLabel}</span>}
                          {item.badge && (
                            <span className="shrink-0 rounded-full border border-navy-border/30 bg-navy-800 px-2 py-0.5 text-xs text-slate-300">{item.badge}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-navy-border/30 bg-navy-800/40 px-3 py-2 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className="hidden sm:inline">↑↓ للتنقل</span>
            <span className="hidden sm:inline">↵ للاختيار</span>
            <span>Esc للإغلاق</span>
          </span>
          <span className="font-mono">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
