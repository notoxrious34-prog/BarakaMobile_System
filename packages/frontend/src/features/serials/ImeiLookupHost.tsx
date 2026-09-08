import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImeiLookupModal } from './ImeiLookupModal';
import { WarrantyClaimModal } from './WarrantyClaimModal';

/**
 * Global IMEI HUD host: F9 opens the lookup from anywhere.
 * (Ctrl+Shift+I intentionally NOT bound — Chromium reserves it for devtools.)
 */
export function ImeiLookupHost() {
  const [open, setOpen] = useState(false);
  const [claimDeviceId, setClaimDeviceId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F9') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openRepair = useCallback(
    (prefill: { contactId?: string; imei: string }) => {
      try {
        window.sessionStorage.setItem('bm_repair_prefill', JSON.stringify(prefill));
      } catch {
        /* referral lost — repairs still opens */
      }
      setOpen(false);
      navigate('/repairs');
    },
    [navigate],
  );

  if (!open && !claimDeviceId) return null;
  return (
    <>
      {open && (
        <ImeiLookupModal
          open={open}
          onClose={() => setOpen(false)}
          onRepairTicket={openRepair}
          onWarrantyClaim={(id) => {
            setOpen(false);
            setClaimDeviceId(id);
          }}
        />
      )}
      {claimDeviceId && <WarrantyClaimModal deviceId={claimDeviceId} onClose={() => setClaimDeviceId(null)} />}
    </>
  );
}
