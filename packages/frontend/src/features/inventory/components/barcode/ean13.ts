// EAN-13 encoder: digit patterns + first-digit parity map. Returns module bit-string with guards.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010101'];
const R = ['1001110', '1100110', '1101100', '1000010', '1011100', '1001000', '1010010', '1101010', '1101000', '1001000'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function isEan13Encodable(raw: string): boolean {
  return /^\d{12,13}$/.test(raw.trim());
}

function checksum12(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(d12[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Encode 12 digits (checksum appended) or 13 digits (checksum validated). Throws on invalid input. */
export function encodeEan13(raw: string): { bits: string; digits: string } {
  const t = raw.trim();
  if (!isEan13Encodable(t)) throw new Error('EAN-13 needs 12 or 13 digits');
  const digits = t.length === 12 ? t + String(checksum12(t)) : t;
  if (t.length === 13 && Number(t[12]) !== checksum12(t.slice(0, 12))) {
    throw new Error('EAN-13 checksum mismatch');
  }
  const first = Number(digits[0]);
  const parity = PARITY[first]!;
  let bits = '101';
  for (let i = 1; i <= 6; i++) {
    const d = Number(digits[i]);
    bits += (parity[i - 1] === 'L' ? L[d] : G[d])!;
  }
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[Number(digits[i])]!;
  bits += '101';
  return { bits, digits };
}
