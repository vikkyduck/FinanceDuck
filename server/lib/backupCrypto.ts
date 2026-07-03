/**
 * Шифрование файлов бэкапа (AES-256-GCM).
 *
 * Бэкап-сервис раньше писал весь дамп БД (клиенты, телефоны, токены и т.п.)
 * открытым JSON на диск. Теперь содержимое шифруется. Ключ выводится из того
 * же серверного секрета ACCESS_CODE_SECRET (отдельная метка ":backup").
 *
 * Формат файла — JSON-конверт: { format, alg, createdAt, type, iv, tag,
 * ciphertext }. createdAt/type лежат открыто, поэтому список бэкапов читается
 * без ключа; сами данные — внутри ciphertext.
 *
 * Graceful degradation: нет секрета → шифрование выключено, пишем как раньше
 * (открытый JSON). Старые открытые бэкапы всегда читаемы (обратная совместимость).
 */
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";

const SECRET = process.env.ACCESS_CODE_SECRET ?? "";
export const backupCryptoEnabled = SECRET.length >= 16;
const key = backupCryptoEnabled ? createHash("sha256").update(SECRET + ":backup").digest() : Buffer.alloc(32);

export interface EncBackupEnvelope {
  format: "enc1";
  alg: "aes-256-gcm";
  createdAt: string;
  type: "auto" | "manual";
  iv: string;
  tag: string;
  ciphertext: string;
}

export function isEncryptedEnvelope(o: any): o is EncBackupEnvelope {
  return !!o && o.format === "enc1" && typeof o.ciphertext === "string";
}

export function encryptBackup(
  plaintext: string,
  meta: { createdAt: string; type: "auto" | "manual" },
): EncBackupEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    format: "enc1",
    alg: "aes-256-gcm",
    createdAt: meta.createdAt,
    type: meta.type,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ct.toString("base64"),
  };
}

/** Расшифровка конверта обратно в исходную JSON-строку бэкапа. */
export function decryptBackup(env: EncBackupEnvelope): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(env.ciphertext, "base64")), decipher.final()]).toString("utf8");
}
