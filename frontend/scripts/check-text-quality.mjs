import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  path.join(ROOT, "src"),
  path.join(ROOT, "../backend_python/app/routes"),
];

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".py"]);
const IGNORE_PARTS = new Set(["node_modules", "dist", ".git", "__pycache__"]);

const ENTITY_RE = /&(auml|ouml|uuml|Auml|Ouml|Uuml|szlig);/g;
const MOJIBAKE_RE = /Ã¤|Ã¶|Ã¼|Ã„|Ã–|Ãœ|â€“|â€ž|â€œ|â€˜|â€™/g;
const TRANSLIT_RE = /\b(fuer|jaehr|moeg|ueber|groess|gueltig|ungueltig)\w*\b/gi;

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_PARTS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      const ext = path.extname(entry.name);
      if (TEXT_EXTENSIONS.has(ext)) yield full;
    }
  }
}

function findMatches(content, regex) {
  const out = [];
  for (const m of content.matchAll(regex)) {
    out.push({ value: m[0], index: m.index ?? 0 });
  }
  return out;
}

function getLine(content, index) {
  const prefix = content.slice(0, index);
  return prefix.split("\n").length;
}

const hardIssues = [];
const softIssues = [];

for (const target of TARGETS) {
  for (const file of walk(target)) {
    const content = fs.readFileSync(file, "utf8");
    for (const issue of findMatches(content, ENTITY_RE)) {
      hardIssues.push({ file, line: getLine(content, issue.index), kind: "entity", value: issue.value });
    }
    for (const issue of findMatches(content, MOJIBAKE_RE)) {
      hardIssues.push({ file, line: getLine(content, issue.index), kind: "encoding", value: issue.value });
    }
    for (const issue of findMatches(content, TRANSLIT_RE)) {
      softIssues.push({ file, line: getLine(content, issue.index), kind: "transliteration", value: issue.value });
    }
  }
}

if (hardIssues.length > 0) {
  console.error("Text quality check failed (hard issues):");
  for (const issue of hardIssues) {
    console.error(`- ${issue.file}:${issue.line} [${issue.kind}] ${issue.value}`);
  }
}

if (softIssues.length > 0) {
  console.warn("Text quality hints (review recommended):");
  for (const issue of softIssues.slice(0, 80)) {
    console.warn(`- ${issue.file}:${issue.line} [${issue.kind}] ${issue.value}`);
  }
  if (softIssues.length > 80) {
    console.warn(`... ${softIssues.length - 80} more hints`);
  }
}

if (hardIssues.length === 0) {
  console.log("Text quality check passed (no hard issues).");
}

process.exit(hardIssues.length > 0 ? 1 : 0);
