import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const splitterPath = path.join(repoRoot, 'src', 'lib', 'markdownSplit.ts');

const source = await readFile(splitterPath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const splitterModule = await import(moduleUrl);
const { splitMarkdown } = splitterModule;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const assertNoLoss = (input, segments) => {
  const rebuilt = segments.map((segment) => segment.content).join('');
  assert.equal(rebuilt, input, 'segments should concatenate back to original input');
};

test('example splits for levels 1, 2, 3', () => {
  const input = [
    '# title',
    '',
    'context one',
    '',
    '## subtitle',
    '',
    'subcontext',
    '',
    '## test',
    '',
    'test context',
    '',
    '### details',
    '',
    'blabla',
    '',
  ].join('\n');

  const level1 = splitMarkdown(input, 1);
  assert.deepEqual(level1.map((segment) => segment.content), [input]);
  assertNoLoss(input, level1);

  const level2 = splitMarkdown(input, 2);
  assert.deepEqual(level2.map((segment) => segment.content), [
    '# title\n\ncontext one\n\n',
    '## subtitle\n\nsubcontext\n\n',
    '## test\n\ntest context\n\n### details\n\nblabla\n',
  ]);
  assertNoLoss(input, level2);

  const level3 = splitMarkdown(input, 3);
  assert.deepEqual(level3.map((segment) => segment.content), [
    '# title\n\ncontext one\n\n',
    '## subtitle\n\nsubcontext\n\n',
    '## test\n\ntest context\n\n',
    '### details\n\nblabla\n',
  ]);
  assertNoLoss(input, level3);
});

test('preserves preamble before first heading', () => {
  const input = [
    'intro line',
    'intro two',
    '',
    '# Title',
    'Body',
    '',
  ].join('\n');

  const segments = splitMarkdown(input, 1);
  assert.deepEqual(segments.map((segment) => segment.content), [
    'intro line\nintro two\n\n',
    '# Title\nBody\n',
  ]);
  assertNoLoss(input, segments);
});

test('handles multiple top-level sections', () => {
  const input = ['# First', 'A', '# Second', 'B', ''].join('\n');
  const segments = splitMarkdown(input, 1);
  assert.deepEqual(segments.map((segment) => segment.content), [
    '# First\nA\n',
    '# Second\nB\n',
  ]);
  assertNoLoss(input, segments);
});

test('ignores headings inside fenced code blocks', () => {
  const input = [
    '# Title',
    '```',
    '## not heading',
    '```',
    'Content',
    '## Real',
    'More',
    '',
  ].join('\n');

  const segments = splitMarkdown(input, 2);
  assert.deepEqual(segments.map((segment) => segment.content), [
    '# Title\n```\n## not heading\n```\nContent\n',
    '## Real\nMore\n',
  ]);
  assertNoLoss(input, segments);
});

test('keeps segments when headings are consecutive', () => {
  const input = ['# Top', '## One', '## Two', ''].join('\n');
  const segments = splitMarkdown(input, 2);
  assert.deepEqual(segments.map((segment) => segment.content), [
    '# Top\n',
    '## One\n',
    '## Two\n',
  ]);
  assertNoLoss(input, segments);
});

test('includes trailing text after last child heading', () => {
  const input = ['# Top', '## A', 'Alpha', '', 'Tail line', ''].join('\n');
  const segments = splitMarkdown(input, 2);
  assert.deepEqual(segments.map((segment) => segment.content), [
    '# Top\n',
    '## A\nAlpha\n\nTail line\n',
  ]);
  assertNoLoss(input, segments);
});

test('returns a single segment when no headings at target level exist', () => {
  const input = ['Just text', 'More text', ''].join('\n');
  const segments = splitMarkdown(input, 3);
  assert.deepEqual(segments.map((segment) => segment.content), ['Just text\nMore text\n']);
  assertNoLoss(input, segments);
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}

console.log('\nAll markdown splitter tests passed.');
