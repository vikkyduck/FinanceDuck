// ─────────────────────────────────────────────────────────────────────────────
// Серверный Format-сервис. Зеркало src/lib/format.ts для PDF/HTML/XLSX-отчётов
// и любого серверного рендеринга. Node 20+ имеет Intl нативно.
//
// Зачем дублировать вместо общего пакета: фронт и сервер собираются разными
// бандлерами (Vite vs esbuild --bundle), и общий импорт привнёс бы конфликт
// модульных систем. Зеркало — простой компромисс: один файл здесь, один там,
// API и поведение совпадают.
// ─────────────────────────────────────────────────────────────────────────────

const LOCALE = "ru-RU";

const moneyFmtInteger = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const moneyFmtTwo = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFmtInteger = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const numberFmtTwo = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFmtShort = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit", month: "2-digit", year: "numeric",
});
const dateFmtLong = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric", month: "long", year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});

type MoneyInput = number | string | null | undefined;
type DateInput = Date | string | number | null | undefined;

const toFiniteNumber = (v: MoneyInput): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

const toDate = (v: DateInput): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export interface FormatMoneyOptions {
  decimals?: boolean;
  bare?: boolean;
}

export function formatMoney(value: MoneyInput, options: FormatMoneyOptions = {}): string {
  const { decimals = false, bare = false } = options;
  const n = toFiniteNumber(value);
  if (bare) {
    return (decimals ? numberFmtTwo : numberFmtInteger).format(n);
  }
  return (decimals ? moneyFmtTwo : moneyFmtInteger).format(n);
}

export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFmtShort.format(d) : "—";
}

export function formatDateLong(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFmtLong.format(d) : "—";
}

export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}

export function formatNumber(value: MoneyInput, decimals: boolean = false): string {
  return formatMoney(value, { decimals, bare: true });
}
