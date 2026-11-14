// scripts/csv.mjs: a tiny CSV reader and writer (no dependencies), shared by
// run-tests.mjs and judge.mjs.

// Handles quoted fields with commas, doubled quotes ("") and Windows line endings.
// First row = column names (lower-cased); returns one object per other row.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } // "" inside quotes = a literal "
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row); // skip blank lines
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [header = [], ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

// Quotes any field containing a comma, quote or line break.
export const esc = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Columns = union of all keys, in first-seen order (rows may have extra judge columns).
export const toCSV = (objs) => {
  const k = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  return [k.join(","), ...objs.map((o) => k.map((x) => esc(o[x])).join(","))].join("\n") + "\n";
};
