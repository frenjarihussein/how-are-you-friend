const enc = new TextEncoder();

async function key(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 200_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** AES-GCM encrypts a JSON string with a password-derived key. */
export async function encryptJson(json: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(password, salt), enc.encode(json)));
  let bin = "";
  for (let i = 0; i < ct.length; i += 0x8000) bin += String.fromCharCode(...ct.subarray(i, i + 0x8000));
  return JSON.stringify({ v: 1, alg: "AES-256-GCM", salt: b64(salt), iv: b64(iv), data: btoa(bin) });
}

export async function decryptJson(file: string, password: string) {
  const o = JSON.parse(file);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(o.iv) }, await key(password, unb64(o.salt)), unb64(o.data));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("كلمة السر غير صحيحة أو الملف تالف");
  }
}
