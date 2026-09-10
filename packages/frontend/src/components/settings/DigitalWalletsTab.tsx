import { useState } from 'react';
import { useWalletsQuery } from '@/features/wallets/hooks/useWallets';
import { WalletServicesPanel } from '@/features/wallets/components/WalletServicesPanel';
import { CARD_CLS, LABEL_CLS } from './settingsUi';

/**
 * Tab 2 — Wallets & Digital Services (TB-139). Verbatim migration of
 * WalletSettingsSection. No logic changes (Decimal rules live in hooks).
 */
export function DigitalWalletsTab() {
  const { data: wallets } = useWalletsQuery(true);
  const active = (wallets ?? []).filter((w) => w.isActive);
  const [walletId, setWalletId] = useState('');
  const selected = walletId || active.find((w) => w.type === 'FLEXY')?.id || active[0]?.id || null;
  return (
    <section className={CARD_CLS} aria-label="المحافظ والخدمات الرقمية">
      <h2 className="mb-1 text-sm font-bold text-slate-100">المحافظ والخدمات الرقمية</h2>
      <p className="mb-4 text-xs text-slate-400">عمولات الشبكات، الخدمات المفعّلة، وحد تنبيه الرصيد</p>
      <div className="mb-3 max-w-xs space-y-1.5">
        <label htmlFor="settings-wallet" className={LABEL_CLS}>
          المحفظة
        </label>
        <select
          id="settings-wallet"
          value={selected ?? ''}
          onChange={(e) => setWalletId(e.target.value)}
          className="w-full rounded-xl border border-navy-700/80 bg-navy-950/80 px-3 py-2 text-sm text-slate-100"
        >
          {active.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <WalletServicesPanel walletId={selected} />
    </section>
  );
}
