import { useState } from 'react';
import { Smartphone, ArrowLeftRight, Zap } from 'lucide-react';
import { useV3WalletsQuery } from '../api/flexyV3Hooks';
import type { WalletDetails } from '@/api/v3/types';
import { V3FlexyTopUpModal } from './V3FlexyTopUpModal';
import { V3FloatTransferModal } from './V3FloatTransferModal';

/**
 * DIRECTIVE-023 Stage 10.4 — flexy wallet directory.
 *
 * Live float cards (10100 per wallet) with provider labels and
 * low-balance badges, plus entry points to the top-up and
 * float-transfer modals.
 */

const OPERATOR_LABEL: Record<string, string> = {
  MOBILIS: 'موبيليس',
  DJEZZY: 'جازي',
  OOREDOO: 'أوريدو',
  OTHER: 'أخرى',
};

function isLow(wallet: WalletDetails): boolean {
  try {
    return Number(wallet.balance) <= Number(wallet.minBalanceAlert);
  } catch {
    return false;
  }
}

export function V3WalletCards() {
  const wallets = useV3WalletsQuery();
  const [topUpWallet, setTopUpWallet] = useState<WalletDetails | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  if (wallets.isLoading) return <div className="p-6 text-slate-400">جارٍ تحميل المحافظ…</div>;
  if (wallets.isError || !wallets.data) return <div className="p-6 text-rose-300">تعذّر تحميل المحافظ.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">محافظ التعبئة (10100)</h2>
        <button
          onClick={() => setTransferOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-navy-border/40 px-4 py-2 text-sm font-bold text-slate-200"
        >
          <ArrowLeftRight className="h-4 w-4" />
          تحويل عائم
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {wallets.data.map((wallet) => (
          <div key={wallet.id} className="flex flex-col gap-2 rounded-2xl border border-navy-border/40 bg-navy-900/60 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold">
                <Smartphone className="h-4 w-4 text-cyan-300" />
                {wallet.name}
              </span>
              {isLow(wallet) && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                  رصيد منخفض
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>{OPERATOR_LABEL[wallet.operator] ?? wallet.operator}</span>
              <span dir="ltr" className="font-mono">{wallet.phoneNumber ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span dir="ltr" className="font-mono text-xl font-bold">{wallet.balance} د.ج</span>
              <button
                onClick={() => setTopUpWallet(wallet)}
                className="flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-bold text-white"
              >
                <Zap className="h-4 w-4" />
                تعبئة
              </button>
            </div>
          </div>
        ))}
      </div>
      {topUpWallet && <V3FlexyTopUpModal wallet={topUpWallet} onClose={() => setTopUpWallet(null)} />}
      {transferOpen && <V3FloatTransferModal wallets={wallets.data} onClose={() => setTransferOpen(false)} />}
    </div>
  );
}
