// Executes the actual deployed controller source, not a reimplementation.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { chromium } from 'playwright';

const baseline = '610e609c491864e6c4384839e80c8e91b7e5fce4';
const file = 'src/components/chat/anchoredTranscriptScroll.ts';
const baselineSource = execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [version, source] of [['production-baseline', baselineSource], ['correction', fs.readFileSync(file, 'utf8')]]) {
    for (const input of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
      const page = await browser.newPage();
      await page.route('http://scroll.test/', route => route.fulfill({ contentType: 'text/html', body: '<style>#owner{height:300px;width:500px;overflow:auto}article{height:300px}</style><div id="owner"></div>' }));
      await page.goto('http://scroll.test/');
      const code = ts.transpileModule(source.replaceAll('import.meta.env.DEV', 'true').replaceAll('export function ', 'function '), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
      await page.addScriptTag({ content: code });
      const result = await page.evaluate((input) => {
        const owner = document.querySelector('#owner');
        for (let index = 0; index < 4; index++) {
          const item = document.createElement('article');
          item.dataset.paigeMessageId = `fixture-${index}`;
          owner.append(item);
        }
        const controller = createAnchoredTranscriptScroll({ storagePrefix: 'synthetic-test' });
        controller.attach(owner);
        owner.dispatchEvent(input === 'keydown' ? new KeyboardEvent(input, { key: 'ArrowUp' }) : new Event(input));
        owner.scrollTop -= 1;
        const chosen = owner.scrollTop;
        controller.notifyLayoutChange();
        controller.handleScroll();
        const actual = owner.scrollTop;
        controller.destroy();
        return { chosen, actual, stable: actual === chosen };
      }, input);
      results.push({ version, input, ...result });
      await page.close();
    }
  }
} finally { await browser.close(); }
const output = path.resolve('outputs/paige-scroll-delayed-baseline');
fs.mkdirSync(output, { recursive: true });
const passed = results.filter(r => r.version === 'production-baseline').every(r => !r.stable)
  && results.filter(r => r.version === 'correction').every(r => r.stable);
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ baseline, evidenceClass: 'Actual controller source in Chromium; controlled event ordering and synthetic geometry, not authenticated production', passed, results }, null, 2));
console.log(JSON.stringify({ passed, results }));
process.exitCode = passed ? 0 : 1;
