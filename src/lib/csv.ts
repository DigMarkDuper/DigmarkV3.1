/**
 * Minimal, correct RFC-4180-style CSV parser (no external dependency).
 *
 * Handles quoted fields, escaped quotes (""), commas and newlines inside
 * quotes, and \r\n / \n line endings. Returns an array of rows, each a string[].
 */

/** Strip a UTF-8 BOM if present. */
function stripBom(text: string): string {
  return text.length > 0 && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCSV(text: string): string[][] {
  const s = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++; // bare CR is ignored; CRLF handled by the following LF
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Flush the final field/row (trailing newline handled by the loop above).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Decode raw CSV file bytes into text using an encoding-aware strategy
 * (additive entry for the Insight File Upload feature). Handles:
 *  - UTF-8 (with or without BOM),
 *  - UTF-16 LE / BE (BOM-detected), which Excel-based Insight exports use,
 *  - fallback to UTF-8 when no BOM is present.
 * The existing `parseCSV` (UTF-8 string input) is unchanged.
 */
export function decodeCsvBytes(buf: Buffer | Uint8Array): string {
  const bytes = Buffer.isBuffer(buf)
    ? buf
    : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return bytes.subarray(2).toString("utf16le");
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      // UTF-16BE: swap byte order then decode as utf16le.
      const swapped = Buffer.alloc(bytes.length - 2);
      for (let i = 2, j = 0; i + 1 < bytes.length; i += 2, j += 2) {
        swapped[j] = bytes[i + 1];
        swapped[j + 1] = bytes[i];
      }
      return swapped.toString("utf16le");
    }
  }
  return bytes.toString("utf8");
}

/**
 * Parse CSV from raw bytes (encoding-aware). Optionally strips a leading
 * `sep=,` / `sep=\t` delimiter-preamble line that Excel exports prepend, and
 * skips a leading "metric title" line (Instagram per-metric exports).
 * Returns array-of-arrays of strings. Never throws on malformed content —
 * it yields whatever rows parse; callers validate.
 */
export function parseCsvBytes(
  buf: Buffer | Uint8Array,
  opts: { stripSepPreamble?: boolean; skipTitleLine?: boolean } = {},
): string[][] {
  const aoa = parseCSV(decodeCsvBytes(buf));
  const out: string[][] = [];
  let i = 0;
  if (opts.stripSepPreamble && aoa[i] && /^sep=/i.test(String(aoa[i][0] ?? "").trim())) {
    i++;
  }
  if (opts.skipTitleLine && aoa[i]) {
    // Only skip a single-cell "title" line (not a real multi-column header).
    const nonEmpty = aoa[i].filter((c) => c.trim() !== "");
    if (nonEmpty.length === 1) {
      i++;
    }
  }
  for (; i < aoa.length; i++) {
    if (aoa[i].every((c) => (c ?? "").trim() === "")) {
      continue; // drop fully-empty rows from parsed output
    }
    out.push(aoa[i].map((c) => (c === undefined ? "" : String(c))));
  }
  return out;
}