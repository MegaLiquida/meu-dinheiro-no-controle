export function isoDateFromParts(year: number, month: number, day: number) {
  const safeDay = Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, safeDay)).toISOString().slice(0, 10);
}

export function addMonthsKeepingDay(dateIso: string, months: number, dueDay?: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const day = dueDay ?? date.getUTCDate();
  return isoDateFromParts(date.getUTCFullYear(), date.getUTCMonth() + months, day);
}

export function splitCents(totalCents: number, count: number) {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = isoDateFromParts(year, monthNumber - 1, new Date(Date.UTC(year, monthNumber, 0)).getUTCDate());
  return { start, end };
}
