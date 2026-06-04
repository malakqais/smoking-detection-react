export function normalizeTotpInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

export function isValidTotpCode(value) {
  return /^\d{6}$/.test(normalizeTotpInput(value));
}
