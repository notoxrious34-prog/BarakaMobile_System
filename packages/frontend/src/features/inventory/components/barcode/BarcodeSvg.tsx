import { useMemo } from 'react';
import { encodeCode128B } from './code128';
import { encodeEan13, isEan13Encodable } from './ean13';

type Props = {
  value: string;
  format?: 'AUTO' | 'CODE128' | 'EAN13';
  height?: number;
  moduleWidth?: number;
  displayValue?: boolean;
  digitsClassName?: string;
};

/**
 * Vector barcode renderer: pure #000 bars on #fff, crispEdges (no anti-alias blur),
 * safe at 203/300 DPI thermal printing.
 */
export function BarcodeSvg({ value, format = 'AUTO', height = 44, moduleWidth = 2, displayValue = true, digitsClassName }: Props) {
  const { bits, human } = useMemo(() => {
    const v = (value ?? '').trim() || '?';
    if ((format === 'EAN13' || format === 'AUTO') && isEan13Encodable(v)) {
      try {
        const r = encodeEan13(v);
        return { bits: r.bits, human: r.digits };
      } catch {
        /* fall through to Code128 */
      }
    }
    return { bits: encodeCode128B(v), human: v };
  }, [value, format]);

  const width = bits.length * moduleWidth;
  const bars: React.ReactNode[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      bars.push(<rect key={i} x={i * moduleWidth} y={0} width={(j - i) * moduleWidth} height={height} fill="#000" />);
      i = j;
    } else {
      i++;
    }
  }

  return (
    <div dir="ltr" className="inline-flex flex-col items-center leading-none">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`barcode ${human}`}
        style={{ background: '#fff', display: 'block', maxWidth: '100%' }}
      >
        <rect x={0} y={0} width={width} height={height} fill="#fff" />
        {bars}
      </svg>
      {displayValue && (
        <span className={digitsClassName} style={{ color: '#000', background: '#fff', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
          {human}
        </span>
      )}
    </div>
  );
}
