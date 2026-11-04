/**
 * JSON parser for imported files and broker payloads. Differences from JSON.parse:
 * - duplicate object keys are an error (JSON.parse would silently keep the last one),
 * - the key __proto__ is rejected,
 * - the size is limited in UTF-8 bytes before parsing,
 * - the nesting depth is limited.
 * Core code: no TextEncoder and no other platform globals.
 */
export type StrictJson = { ok: true; value: unknown } | { ok: false; error: string };

const MAX_DEPTH = 32;

class Failure extends Error {}

/** UTF-8 length of a string without TextEncoder. Lone surrogates count as three bytes (U+FFFD). */
export function utf8Length(input: string): number {
  let bytes = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length && input.charCodeAt(i + 1) >= 0xdc00 && input.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export function parseStrictJson(input: string, maxBytes: number): StrictJson {
  if (utf8Length(input) > maxBytes) return { ok: false, error: `Input is larger than ${Math.round(maxBytes / 1024)} KiB` };
  let pos = 0;
  const err = (message: string): never => {
    throw new Failure(`${message} (position ${pos})`);
  };
  const ws = () => {
    while (pos < input.length && ' \t\n\r'.includes(input[pos])) pos++;
  };
  const string = (): string => {
    pos++;
    let out = '';
    for (;;) {
      if (pos >= input.length) err('String is not terminated');
      const ch = input[pos];
      if (ch === '"') {
        pos++;
        return out;
      }
      if (ch < ' ') err('Control character in string');
      if (ch === '\\') {
        const next = input[pos + 1];
        const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (next in simple) {
          out += simple[next];
          pos += 2;
        } else if (next === 'u') {
          const hex = input.slice(pos + 2, pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) err('Invalid \\u sequence');
          out += String.fromCharCode(parseInt(hex, 16));
          pos += 6;
        } else err('Invalid escape sequence');
      } else {
        out += ch;
        pos++;
      }
    }
  };
  const value = (depth: number): unknown => {
    if (depth > MAX_DEPTH) err('Nested too deeply');
    ws();
    const ch = input[pos];
    if (ch === '{') {
      pos++;
      const obj: Record<string, unknown> = {};
      const seen = new Set<string>();
      ws();
      if (input[pos] === '}') {
        pos++;
        return obj;
      }
      for (;;) {
        ws();
        if (input[pos] !== '"') err('Key expected');
        const key = string();
        if (key === '__proto__') err('The key __proto__ is not allowed');
        if (seen.has(key)) err(`Duplicate key "${key}"`);
        seen.add(key);
        ws();
        if (input[pos] !== ':') err('":" expected');
        pos++;
        obj[key] = value(depth + 1);
        ws();
        if (input[pos] === ',') {
          pos++;
          continue;
        }
        if (input[pos] === '}') {
          pos++;
          return obj;
        }
        err('"," or "}" expected');
      }
    }
    if (ch === '[') {
      pos++;
      const arr: unknown[] = [];
      ws();
      if (input[pos] === ']') {
        pos++;
        return arr;
      }
      for (;;) {
        arr.push(value(depth + 1));
        ws();
        if (input[pos] === ',') {
          pos++;
          continue;
        }
        if (input[pos] === ']') {
          pos++;
          return arr;
        }
        err('"," or "]" expected');
      }
    }
    if (ch === '"') return string();
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(pos, pos + 400));
    if (!literal) return err('Invalid value');
    pos += literal[0].length;
    if (literal[0] === 'true') return true;
    if (literal[0] === 'false') return false;
    if (literal[0] === 'null') return null;
    const n = Number(literal[0]);
    if (!Number.isFinite(n)) err('Number out of range');
    return n;
  };
  try {
    const result = value(0);
    ws();
    if (pos < input.length) err('Unexpected characters after the document');
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e instanceof Failure ? e.message : 'Invalid JSON' };
  }
}
