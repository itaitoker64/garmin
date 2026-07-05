import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.SESSION_ENC_KEY;
  if (!secret) {
    throw new Error("SESSION_ENC_KEY environment variable is not set");
  }
  // Accept either a 32-byte base64 key or an arbitrary passphrase (hashed to 32 bytes).
  try {
    const decoded = Buffer.from(secret, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to hashing
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// Cookies are capped around 4KB each. A dumped Garmin token can exceed
// that, so we shard the encrypted payload across a small, fixed set of
// numbered cookies and reassemble it on read.
const COOKIE_BASE = "gcoach_session";
const CHUNK_SIZE = 3500;
const MAX_CHUNKS = 6;

export function cookieNamesForChunks(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${COOKIE_BASE}.${i}`);
}

export function chunkForCookies(encrypted: string): { name: string; value: string }[] {
  const chunks: string[] = [];
  for (let i = 0; i < encrypted.length; i += CHUNK_SIZE) {
    chunks.push(encrypted.slice(i, i + CHUNK_SIZE));
  }
  if (chunks.length > MAX_CHUNKS) {
    throw new Error("Session token too large to store in cookies");
  }
  return chunks.map((value, i) => ({ name: `${COOKIE_BASE}.${i}`, value }));
}

export function joinCookieChunks(values: (string | undefined)[]): string | null {
  const present = values.filter((v): v is string => Boolean(v));
  if (present.length === 0) return null;
  return present.join("");
}

export const SESSION_COOKIE_PREFIX = COOKIE_BASE;
export const SESSION_COOKIE_MAX_CHUNKS = MAX_CHUNKS;
