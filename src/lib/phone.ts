const PHONE_KEY = 'rally.phone';

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

/** India-first E.164. 10-digit local numbers become +91. */
export function normalizePhone(value: string) {
  const digits = digitsOnly(value);
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (value.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return '';
}

export function formatPhone(value: string) {
  const normalized = normalizePhone(value);
  if (normalized.startsWith('+91') && normalized.length === 13) {
    return `+91 ${normalized.slice(3, 8)} ${normalized.slice(8)}`;
  }
  return normalized;
}
