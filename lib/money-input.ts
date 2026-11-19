export function moneyInputDigits(value: string): string | null {
  const digits = value.replace(/,/g, "").trim();
  return /^\d*$/.test(digits) ? digits.replace(/^0+(?=\d)/, "") : null;
}

export function formatMoneyInput(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function moneyInputCaret(value: string, digitsToRight: number): number {
  let position = value.length, remaining = digitsToRight;
  while (position > 0 && remaining > 0) { position--; if (/\d/.test(value[position])) remaining--; }
  return position;
}
