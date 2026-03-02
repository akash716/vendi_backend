/**
 * auth.js — Pure Node.js crypto based auth
 * JWT_SECRET is read lazily so dotenv is always loaded first
 */
import "dotenv/config";
import crypto from "crypto";

// Read secrets lazily to ensure dotenv is loaded
const getJwtSecret   = () => process.env.JWT_SECRET   || "vendi-super-secret-change-in-prod-2024";
const getStallSecret = () => process.env.STALL_SECRET || "vendi-stall-token-secret-2024";

/* ─── Base64url helpers ─── */
function b64url(str) {
  return Buffer.from(str).toString("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function b64urlDecode(str) {
  str = str.replace(/-/g,"+").replace(/_/g,"/");
  while (str.length % 4) str += "=";
  return Buffer.from(str,"base64").toString("utf8");
}

/* ─── JWT (HS256) ─── */
export function signToken(payload, expiresInSeconds = 86400 * 7) {
  const secret = getJwtSecret();
  const header = b64url(JSON.stringify({ alg:"HS256", typ:"JWT" }));
  const exp    = Math.floor(Date.now()/1000) + expiresInSeconds;
  const body   = b64url(JSON.stringify({ ...payload, exp, iat: Math.floor(Date.now()/1000) }));
  const sig    = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const secret = getJwtSecret();
    const parts  = (token || "").split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    // Pad to same length for timingSafeEqual
    const sigBuf = Buffer.from(sig.padEnd(expected.length, "="));
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(b64urlDecode(body));
    if (payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

/* ─── Password hashing (PBKDF2) ─── */
export async function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise((res, rej) =>
    crypto.pbkdf2(plain, salt, 100000, 64, "sha512", (e,k) => e ? rej(e) : res(k.toString("hex")))
  );
  return `${salt}:${hash}`;
}

export async function verifyPassword(plain, stored) {
  try {
    const [salt, hash] = (stored || ":").split(":");
    if (!salt || !hash) return false;
    const attempt = await new Promise((res, rej) =>
      crypto.pbkdf2(plain, salt, 100000, 64, "sha512", (e,k) => e ? rej(e) : res(k.toString("hex")))
    );
    const a = Buffer.from(attempt, "hex");
    const b = Buffer.from(hash,    "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/* ─── Stall token (AES-256-GCM) ─── */
function getStallKey() {
  return crypto.createHash("sha256").update(getStallSecret()).digest();
}

export function encryptStallToken(stallId, expiresInDays = 365) {
  const key     = getStallKey();
  const iv      = crypto.randomBytes(12);
  const payload = JSON.stringify({ stallId, exp: Date.now() + expiresInDays * 86400000 });
  const cipher  = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc     = Buffer.concat([cipher.update(payload,"utf8"), cipher.final()]);
  const tag     = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc])
    .toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}

export function decryptStallToken(token) {
  try {
    const key = getStallKey();
    let b64   = (token||"").replace(/-/g,"+").replace(/_/g,"/");
    while (b64.length % 4) b64 += "=";
    const buf      = Buffer.from(b64,"base64");
    const iv       = buf.slice(0,12);
    const tag      = buf.slice(12,28);
    const enc      = buf.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    const data  = JSON.parse(plain);
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
