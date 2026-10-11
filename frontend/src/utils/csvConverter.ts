const FORMULA_PREFIX = /^[=+\-@]/;

function stripControlCharacters(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

export function sanitizeCsvValue(raw: unknown): string {
  const base = String(raw ?? "");
  const cleaned = stripControlCharacters(base).trim();
  if (!cleaned) return "";
  // Prefix potentially dangerous formula payloads to prevent spreadsheet execution.
  if (FORMULA_PREFIX.test(cleaned)) {
    return `'${cleaned}`;
  }
  return cleaned;
}

function quoteCsvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function convertRowsToCsv(
  rows: Array<Record<string, unknown>>,
  delimiter = ";",
): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map((header) => quoteCsvCell(header)).join(delimiter);
  const rowLines = rows.map((row) =>
    headers
      .map((header) => quoteCsvCell(sanitizeCsvValue(row[header])))
      .join(delimiter),
  );
  return [headerLine, ...rowLines].join("\n");
}

function parseCsvLine(line: string, delimiter = ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.replace(/\r/g, "").trim());
}

export function parseCsv(content: string, delimiter = ";"): Array<Record<string, string>> {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0], delimiter).map((header) => sanitizeCsvValue(header));
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = sanitizeCsvValue(values[index] ?? "");
      return acc;
    }, {});
  });
}
