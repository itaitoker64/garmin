// Baked-in fallback configuration so the app works on a fresh Vercel deploy
// with zero environment variables. Every value here is overridden by the
// matching env var when it's set in the Vercel project settings — set real
// env vars if this repo ever becomes shared or public, since committed
// secrets are readable by anyone with repo access.
//
// This file is imported by the Edge middleware, so keep it free of Node-only
// imports (no `crypto`, no `bcryptjs`).

// Login identity for the credentials provider. The hash is bcrypt — the
// password itself is not stored anywhere in the repo.
export const DEFAULT_ADMIN_EMAIL = "itaitoker64@gmail.com";
export const DEFAULT_ADMIN_PASSWORD_HASH =
  "$2a$10$oAvvR2BSfavJwErr0KFS4.AHVOPFus2aZ/fbyMnE8EToz5zMQL2LW";

// Signs NextAuth session JWTs (used by both the auth routes and middleware —
// they must agree, which is why it lives in this shared module).
export const DEFAULT_NEXTAUTH_SECRET =
  "oEBAk9gD+iPstirB9z7lQCudF7gDzu+bMcAnKWsSoMU=";

// AES-256-GCM key for the encrypted Garmin session cookie.
export const DEFAULT_SESSION_ENC_KEY =
  "kktOEzDGgBSde1R90TwD2X6F8avKe/qSVcQoscoFvM0=";

// Shared secret between the Next.js server and the Python functions. The
// Python side has the same fallback in api/garmin-data/_garmin_lib.py —
// keep them in sync.
export const DEFAULT_INTERNAL_FN_SECRET =
  "e71fa48902a456bb210a75d9ecc25d8eeb4207d3767b0ee3ed75e17aa7affc4c";

export const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || DEFAULT_NEXTAUTH_SECRET;
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
export const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_PASSWORD_HASH;
export const SESSION_ENC_KEY = process.env.SESSION_ENC_KEY || DEFAULT_SESSION_ENC_KEY;
export const INTERNAL_FN_SECRET =
  process.env.INTERNAL_FN_SECRET || DEFAULT_INTERNAL_FN_SECRET;
