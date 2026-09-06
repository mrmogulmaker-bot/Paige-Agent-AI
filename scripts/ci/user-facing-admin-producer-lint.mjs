#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|json|ya?ml|sql)$/i;
const ADMIN_STRING = /["'`](?:https:\/\/(?:www\.|app\.)?paigeagent\.ai)?\/admin(?:\/|\b)/i;

// The retired path has no inbound compatibility mount. Negative regression fixtures and the
// one data-cleanup migration may name it; executable product destinations may not.
const RETIREMENT_FIXTURES = new Set([
  "supabase/migrations/20261227000000_retire_admin_notification_urls.sql",
]);

function filesUnder(relative) {
  const start = path.join(ROOT, relative);
  if (!fs.existsSync(start)) return [];
  const out = [];
  const visit = (entry) => {
    const stat = fs.statSync(entry);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry)) visit(path.join(entry, child));
    } else if (SOURCE_EXT.test(entry)) {
      out.push(entry);
    }
  };
  visit(start);
  return out;
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function isCommentOnly(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("<!--");
}

const CLASSES = [
  {
    name: "frontend callers",
    files: () => filesUnder("src").filter((file) =>
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file) && !relative(file).startsWith("src/__tests__/")),
    line: () => true,
  },
  {
    name: "sibling edge functions",
    files: () => filesUnder("supabase/functions"),
    line: () => true,
  },
  {
    name: "database triggers",
    files: () => filesUnder("supabase/migrations").filter((file) => !RETIREMENT_FIXTURES.has(relative(file))),
    line: (line) => /trigger|link_to|http|request|payload|body|url/i.test(line),
  },
  {
    name: "pg_cron and pg_net migrations",
    files: () => filesUnder("supabase/migrations").filter((file) => !RETIREMENT_FIXTURES.has(relative(file))),
    line: (line) => /cron|pg_net|net\.http|http_post|schedule|url|body/i.test(line),
  },
  {
    name: "GitHub Actions",
    files: () => filesUnder(".github"),
    line: () => true,
  },
  {
    name: "external webhook and OAuth providers",
    files: () => filesUnder("supabase/functions").filter((file) =>
      /(?:oauth|webhook|checkout|notify|email|security|watcher)/i.test(relative(file))),
    line: () => true,
  },
  {
    name: "n8n, Zapier, and MCP callers",
    files: () => [
      ...filesUnder("supabase/functions").filter((file) => /(?:n8n|zapier|mcp)/i.test(relative(file))),
      ...filesUnder("scripts").filter((file) => /(?:n8n|zapier|mcp)/i.test(relative(file))),
    ],
    line: () => true,
  },
  {
    name: "tests and operational scripts",
    files: () => [...filesUnder("tests"), ...filesUnder("scripts")]
      .filter((file) => relative(file) !== "scripts/ci/user-facing-admin-producer-lint.mjs"),
    line: (line) => /fetch|invoke|request|response|redirect|location|url|path|link_to|success_path|cancel_path/i.test(line),
  },
];

function scanText(file, text, classDef) {
  const hits = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (isCommentOnly(line) || !classDef.line(line) || !ADMIN_STRING.test(line)) continue;
    hits.push({ file: relative(file), line: index + 1, text: line.trim() });
  }
  return hits;
}

function selfTest() {
  for (const classDef of CLASSES) {
    const fake = path.join(ROOT, "fixtures", `${classDef.name.replaceAll(" ", "-")}.ts`);
    const signal = classDef.name === "frontend callers"
      ? 'const redirectTo = "/admin/setup/billing";'
      : classDef.name === "database triggers"
        ? "select jsonb_build_object('url', '/admin/security') -- trigger payload"
        : classDef.name === "pg_cron and pg_net migrations"
          ? "select net.http_post(url := '/admin/security')"
          : classDef.name === "tests and operational scripts"
            ? 'fetch("/admin/security")'
            : 'const url = "https://paigeagent.ai/admin/security";';
    if (scanText(fake, signal, classDef).length !== 1) {
      throw new Error(`self-test missed ${classDef.name}`);
    }
  }
  if (ADMIN_STRING.test('const role = "admin";') || ADMIN_STRING.test('import x from "@/components/admin/X"')) {
    throw new Error("self-test confused an admin role/import with a URL");
  }
  console.log(`user-facing-admin-producer-lint self-test: ${CLASSES.length} producer classes covered`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const violations = [];
for (const classDef of CLASSES) {
  const seen = new Set();
  for (const file of classDef.files()) {
    const key = relative(file);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = fs.readFileSync(file, "utf8");
    for (const hit of scanText(file, text, classDef)) {
      violations.push({ className: classDef.name, ...hit });
    }
  }
}

const unique = new Map(violations.map((hit) => [`${hit.file}:${hit.line}:${hit.text}`, hit]));
if (unique.size) {
  console.error("Retired privileged-route producers found:");
  for (const hit of unique.values()) {
    console.error(`  [${hit.className}] ${hit.file}:${hit.line} ${hit.text}`);
  }
  process.exit(1);
}

console.log(`user-facing-admin-producer-lint: clean across ${CLASSES.length} producer classes`);
