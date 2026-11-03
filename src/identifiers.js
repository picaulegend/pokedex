const namespace = 'e56dc6e4460b48748688e012628c78b4';
const encoder = new TextEncoder();

// Keep this encoding and namespace stable. Existing catalogue IDs depend on both.
export const encode = (value) =>
  JSON.stringify(
    value && typeof value === 'object'
      ? Array.isArray(value)
        ? value.map((v) => JSON.parse(encode(v)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, JSON.parse(encode(value[k]))]),
          )
      : value,
  );

export async function identifier(kind, ...parts) {
  const input = encoder.encode(encode([kind, ...parts]));
  const data = new Uint8Array(16 + input.length);
  data.set(namespace.match(/../g).map((n) => parseInt(n, 16)));
  data.set(input, 16);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  digest[6] = (digest[6] & 15) | 80;
  digest[8] = (digest[8] & 63) | 128;
  const text = [...digest].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
