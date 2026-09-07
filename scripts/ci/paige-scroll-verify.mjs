// Reproducible Paige chat scroll-stability release checks.
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const outputDirectory = path.join(root, 'outputs/paige-scroll-verification');
mkdirSync(outputDirectory, { recursive: true });

const manifest = JSON.parse(
  readFileSync(path.join(root, 'BUILD_VERIFICATION.json'), 'utf8'),
);
const runStarted = Date.now();
const git = (args) =>
  spawnSync('git', args, {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8',
  }).stdout?.trim() ?? '';

const revision = git(['rev-parse', 'HEAD']);
const workingTreeBefore = git(['status', '--short']);
const productFiles = [
  'src/components/chat/anchoredTranscriptScroll.ts',
  'src/components/dashboard/PaigeAIChat.tsx',
  'src/components/app/PaigeChat.tsx',
  'src/pages/AppShell.tsx',
  'scripts/live-drive/paige-scroll-stability-react-drive.mjs',
];
const hashes = Object.fromEntries(
  productFiles.map((file) => [
    file,
    createHash('sha256')
      .update(readFileSync(path.join(root, file)))
      .digest('hex'),
  ]),
);

const commandResults = [];
for (const { name, argv: declared, definition_file: definitionFile } of manifest.commands) {
  if (
    declared[0] !== 'node' ||
    !readFileSync(path.join(root, definitionFile), 'utf8').trim()
  ) {
    throw new Error(`Invalid command definition: ${name}`);
  }

  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, declared.slice(1), {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', (error) => resolve({ exitCode: -1, output: String(error) }));
    child.on('close', (exitCode) => resolve({ exitCode, output }));
  });

  const log = `${name}.log`;
  writeFileSync(path.join(outputDirectory, log), result.output);
  commandResults.push({
    name,
    argv: declared,
    definition_file: definitionFile,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.exitCode,
    log,
  });
  console.log(`${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${name}`);
}

const evidence = manifest.evidence.map((item) => {
  try {
    const stat = statSync(path.join(root, item.path));
    return {
      ...item,
      fresh:
        stat.mtimeMs >= runStarted &&
        Date.now() - stat.mtimeMs < item.max_age_hours * 3_600_000,
    };
  } catch {
    return { ...item, fresh: false };
  }
});

const passed =
  commandResults.every(({ exitCode }) => exitCode === 0) &&
  evidence.every(({ fresh }) => fresh);
const packet = {
  generatedAt: new Date().toISOString(),
  revision,
  workingTreeBefore,
  workingTreeAfter: git(['status', '--short']),
  hashes,
  commands: commandResults,
  evidence,
  automated: passed ? 'PASS' : 'FAIL',
  authenticatedProduction: 'UNVERIFIED',
};

writeFileSync(
  path.join(outputDirectory, 'command-transcript.json'),
  JSON.stringify(packet, null, 2),
);
mkdirSync(path.join(root, 'evidence/verification'), { recursive: true });
writeFileSync(
  path.join(root, 'evidence/verification/command-transcript.json'),
  JSON.stringify(packet, null, 2),
);

if (!passed) process.exitCode = 1;
