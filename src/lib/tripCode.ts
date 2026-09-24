const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeTripCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export const DEMO_CODE = 'PITSTP';
