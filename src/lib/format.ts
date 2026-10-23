// ─────────────────────────────────────────────────────────────────────────────
// Единый Format-сервис. Все деньги/даты/времена в кабинете идут отсюда.
// Цель: одно число выглядит ИДЕНТИЧНО на любом экране, любом устройстве,
// в любой роли. Если нужен особый формат — добавляй опцию сюда, а не
// расставляй toLocaleString по компонентам.
//
// Принципы:
//   • Любой невалидный вход (null/undefined/NaN) → стандартный плейсхолдер
//     ("—" для дат, 0 ₽ для денег). Никаких «NaN ₽» и «Invalid Date».
//   • Деньги: рубль ₽ через РАЗРЫВНЫЙ обычный пробел перед знаком ₽
//     (Intl ставит NBSP — это визуально такой же пробел, без переноса).
//     Полученное значение всегда содержит финальный "₽".
//   • Даты: ru-RU локаль. Короткая — 25.11.2025. Длинная — 25 ноября 2025.
// ─────────────────────────────────────────────────────────────────────────────

const LOCALE = "ru-RU";

// Целевой формат денег — стандартный локализованный currency-format.
// Возвращает строку вида "12 345 ₽" с неразрывными пробелами (U+00A0)
// между разрядами и перед знаком валюты — это значит, что число никогда
// не разорвётся на две строки на узких экранах.
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
// Bare-вариант (без знака ₽) — для случаев, где валюта рисуется отдельно.
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
  /** Показывать ли копейки. По умолчанию false (округление до рубля). */
  decimals?: boolean;
  /** Если true — без символа ₽. По умолчанию ₽ показывается. */
  bare?: boolean;
}

/**
 * formatMoney(12345)         → "12 345 ₽"
 * formatMoney(12345.67, {decimals:true}) → "12 345,67 ₽"
 * formatMoney(null)          → "0 ₽"
 * formatMoney(12345, {bare:true}) → "12 345"
 */
export function formatMoney(value: MoneyInput, options: FormatMoneyOptions = {}): string {
  const { decimals = false, bare = false } = options;
  const n = toFiniteNumber(value);
  if (bare) {
    return (decimals ? numberFmtTwo : numberFmtInteger).format(n);
  }
  return (decimals ? moneyFmtTwo : moneyFmtInteger).format(n);
}

/** "25.11.2025"; невалид → "—". */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFmtShort.format(d) : "—";
}

/** "25 ноября 2025"; невалид → "—". */
export function formatDateLong(value: DateInput): string {
  const d = toDate(value);
  return d ? dateFmtLong.format(d) : "—";
}

/** "25.11.2025, 14:30"; невалид → "—". */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}

/** Сегодняшняя дата по часам пользователя: "2026-10-23" для полей type="date". */
export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Чистое число без валюты. Для случаев, где валюта не нужна. */
export function formatNumber(value: MoneyInput, decimals: boolean = false): string {
  return formatMoney(value, { decimals, bare: true });
}

/**
 * Русская плюрализация по числу: pluralizeRu(n, [одна, две-четыре, пять]).
 * pluralizeRu(1,f)→f[0], (2..4)→f[1], (5..20,0)→f[2], с учётом mod10/mod100
 * (21→f[0], 22→f[1], 25→f[2]). Единый хелпер — раньше копировался по файлам.
 */
export function pluralizeRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

// Алиасы для совместимости с legacy-импортами из invoiceCalculations.ts —
// чтобы не править 50 файлов в одну итерацию: legacy продолжает работать
// и под капотом использует этот же сервис.
export const formatCurrency = (amount: number): string => formatMoney(amount);
