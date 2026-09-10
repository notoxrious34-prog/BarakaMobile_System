/** Shared settings form contract + luxury card primitives (TB-139). */

export type FormState = {
  business_name: string;
  business_phone: string;
  business_address: string;
  business_rc: string;
  business_nif: string;
  business_nis: string;
  business_art: string;
  currency_symbol: string;
  low_stock_threshold: string;
  invoice_footer_note: string;
};

export const INPUT_CLS =
  'w-full rounded-xl border border-navy-700/80 bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/80 transition-all';
export const LABEL_CLS = 'text-sm font-semibold text-slate-300';
export const CARD_CLS =
  'rounded-2xl border border-navy-800/80 bg-navy-900/60 p-6 backdrop-blur-md shadow-lg shadow-navy-950/30';
