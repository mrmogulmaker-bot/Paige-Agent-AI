#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const targets = [
  "src/components/chat/anchoredTranscriptScroll.ts",
  "src/components/chat/anchoredTranscriptScroll.test.ts",
  "src/components/chat/anchoredTranscriptScroll.react.test.tsx",
  "src/components/app/PaigeChat.tsx",
  "src/components/app/PaigeChat.scroll-stability.contract.test.ts",
  "src/components/app/PaigeChat.remount.test.tsx",
  "src/components/dashboard/PaigeAIChat.tsx",
  "src/pages/AppShell.tsx",
  "src/pages/AppShell.paige-mount.contract.test.ts",
  "src/__tests__/dedicated-chat-overflow-contract.test.ts",
  "src/solo/SoloPaigeWorkspace.contract.test.tsx",
  "scripts/ci/paige-scroll-baseline-reproduction.mjs",
  "scripts/ci/paige-scroll-verify.mjs",
  "scripts/live-drive/paige-scroll-stability-react-drive.mjs",
  "scripts/live-drive/harness/settings-mount/paige-threads-stub.ts",
  "scripts/live-drive/harness/settings-mount/supabase-paige-stub.ts",
  "scripts/live-drive/harness/settings-mount/vite.config.ts",
];

const eslint = path.resolve("node_modules/eslint/bin/eslint.js");
const run = spawnSync(process.execPath, [eslint, "--format", "json", ...targets], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (!run.stdout.trim()) {
  console.error(run.stderr || "ESLint produced no JSON output.");
  process.exit(1);
}

const reports = JSON.parse(run.stdout);
const appShell = path.normalize(path.resolve("src/pages/AppShell.tsx"));
const allowedAppShellBaseline = new Map();
const failures = [];

for (const report of reports) {
  const errors = report.messages.filter((message) => message.severity === 2);
  if (path.normalize(report.filePath) !== appShell) {
    for (const error of errors) failures.push(`${report.filePath}:${error.line}:${error.column} ${error.ruleId} ${error.message}`);
    continue;
  }

  const counts = new Map();
  for (const error of errors) counts.set(error.ruleId, (counts.get(error.ruleId) ?? 0) + 1);
  for (const [rule, count] of counts) {
    const ceiling = allowedAppShellBaseline.get(rule) ?? 0;
    if (count > ceiling) failures.push(`AppShell adds ${count - ceiling} ${rule} error(s) above the origin/main baseline.`);
  }
}

if (failures.length) {
  console.error("PAIGE scroll hotfix ESLint ratchet failed:\n" + failures.join("\n"));
  process.exit(1);
}

const warnings = reports.reduce((total, report) => total + report.messages.filter((message) => message.severity === 1).length, 0);
console.log(`✓ PAIGE scroll hotfix ESLint ratchet: no errors (${warnings} existing warning(s)).`);
