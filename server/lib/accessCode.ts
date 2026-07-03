/**
 * Access-code protection at rest ("сейф с ключом").
 *
 * Коды доступа больше не лежат открытым текстом. Из одного серверного
 * секрета ACCESS_CODE_SECRET выводятся два ключа:
 *   • hmacKey — детерминированный «отпечаток» (HMAC) для поиска кода при
 *     входе по равенству, без раскрытия самого кода;
 *   • aesKey  — обратимое шифрование (AES-256-GCM), чтобы админ мог
 *     ПОСМОТРЕТЬ код в таблице (для пересылки/детекции утечки).
 *
 * Утечка БД/бэкапа без секрета бесполезна: там только отпечаток + шифр.
 *
 * ГЛАВНОЕ ПРО БЕЗОПАСНОСТЬ ВЫКАТКИ: если секрет не задан, крипта ВЫКЛЮЧЕНА и
 * всё работает ровно как раньше (открытый текст). Это позволяет выкатить код
 * заранее, а включить защиту потом — установкой секрета и рестартом. Никакого
 * риска локаута.
 */
import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const SECRET = process.env.ACCESS_CODE_SECRET ?? "";
export const accessCodeCryptoEnabled = SECRET.length >= 16;

// Производные 32-байтовые ключи из одного секрета.
const aesKey  = accessCodeCryptoEnabled ? createHash("sha256").update(SECRET + ":aes").digest()  : Buffer.alloc(32);
const hmacKey = accessCodeCryptoEnabled ? createHash("sha256").update(SECRET + ":hmac").digest() : Buffer.alloc(32);

const HMAC_PREFIX = "hmac1:";
const ENC_PREFIX  = "enc1:";

/** Детерминированный отпечаток для поиска кода при входе. */
export function lookupHash(code: string): string {
  return HMAC_PREFIX + createHmac("sha256", hmacKey).update(code.trim()).digest("hex");
}

/** Похоже ли хранимое значение на отпечаток (т.е. строка уже «в сейфе»). */
export function isLookupHash(v: string | null | undefined): boolean {
  return typeof v === "string" && v.startsWith(HMAC_PREFIX);
}

/** Обратимое шифрование кода для показа админу. */
export function encryptCode(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const ct  = Buffer.concat([cipher.update(code.trim(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Расшифровка. Возвращает null, если значение не шифр или ключ не подходит. */
export function decryptCode(enc: string | null | undefined): string | null {
  if (!enc || !enc.startsWith(ENC_PREFIX)) return null;
  try {
    const [, ivB64, tagB64, ctB64] = enc.split(":");
    const decipher = createDecipheriv("aes-256-gcm", aesKey, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Код для показа в UI. Приоритет:
 *   1) расшифрованный codeEnc (мигрированная строка);
 *   2) открытый code (легаси, ещё не мигрирован);
 *   3) «—», если code уже отпечаток, но расшифровать нечем (потерян секрет).
 */
export function codeForDisplay(row: { code: string; codeEnc?: string | null }): string {
  const dec = decryptCode(row.codeEnc);
  if (dec !== null) return dec;
  if (isLookupHash(row.code)) return "—";
  return row.code;
}
