import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { configure, doctor, run, publish } from '../core/pipeline.mjs';
import { conceptPlan, conceptImport, conceptVerify } from '../core/concepts.mjs';
import { execute } from '../adapters/imagemagick.mjs';
import { hash, write, writeJSON, read } from '../core/files.mjs';

const magick = process.env.HARNESS_TEST_MAGICK || '/opt/homebrew/bin/magick';
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-concept-test-')), id = 'puzzle-concept';
  configure(root, { magick });
  write(root, 'design/decisions/permit.md', 'TEST FIXTURE: explicit built-in concept generation authorization, no production approval.');
  write(root, 'design/prompts/puzzle.md', 'TEST FIXTURE: original puzzle concept art prompt. Not actual generated artwork.');
  const spec = { schema: 1, id, purpose: 'review-only', authorization: 'design/decisions/permit.md', generator: 'codex-built-in-imagegen', prompt: 'design/prompts/puzzle.md', references: [], imageReferences: [], output: 'art/source/concepts/puzzle.png', constraints: { minWidth: 16, minHeight: 16, maxEdge: 128, maxPixels: 16384, minAspect: 1, maxAspect: 2, alpha: 'opaque' }, reviewCriteria: ['Test only; not user art approval'] };
  writeJSON(root, `design/concepts/${id}.json`, spec);
  const env = { release: 'test-only', tools: doctor(root) }, plan = conceptPlan(root, id, env);
  fs.mkdirSync(path.join(root, 'art/source/concepts'), { recursive: true });
  execute(magick, ['-size', '32x24', 'xc:#d8aa57', `PNG:${path.join(root, spec.output)}`]);
  const receipt = { schema: 1, id, ticket: plan.ticket, promptSha256: hash(read(root, spec.prompt)), imageSha256: hash(read(root, spec.output)), generator: spec.generator, mode: 'built-in-tool', ai: true, reproducible: false, productionApproved: false, toolOutputFile: 'synthetic-test-only.png', createdAt: '2026-09-16T00:00:00Z', note: 'Synthetic fixture; not a real generator call or art approval.' };
  const saveReceipt = () => writeJSON(root, `design/concepts/${id}.receipt.json`, receipt);
  saveReceipt();
  return { root, id, spec, env, plan, receipt, saveReceipt };
}
test('concept plan/import/cache/verify records provenance without production approval', () => {
  const f = fixture(), result = conceptImport(f.root, f.id, f.plan.ticket, f.env);
  assert.equal(result.technical, 'passed'); assert.equal(result.visual, 'pending-user-review'); assert.equal(result.productionEligible, false);
  assert.equal(conceptImport(f.root, f.id, f.plan.ticket, f.env).cached, true);
  assert.equal(conceptVerify(f.root, f.id, f.plan.ticket, f.env).digest, result.digest);
  assert.throws(() => publish(f.root, result.ticket));
  assert(!fs.existsSync(path.join(f.root, 'game')));
});
test('no concept import before matching plan ticket', () => { const f = fixture(); assert.throws(() => conceptImport(f.root, f.id, '0'.repeat(64), f.env), /inputs changed/); });
test('changed prompt or consent requires new plan and generation receipt', () => {
  const f = fixture(); write(f.root, f.spec.prompt, 'A different prompt which invalidates this generation.');
  assert.throws(() => conceptImport(f.root, f.id, f.plan.ticket, f.env), /inputs changed/);
});
test('false AI attribution or production approval is rejected', () => {
  const f = fixture(); f.receipt.ai = false; f.saveReceipt(); assert.throws(() => conceptImport(f.root, f.id, f.plan.ticket, f.env), /provenance/);
  f.receipt.ai = true; f.receipt.productionApproved = true; f.saveReceipt(); assert.throws(() => conceptImport(f.root, f.id, f.plan.ticket, f.env), /provenance/);
});
test('generated image hash must match receipt', () => {
  const f = fixture(); f.receipt.imageSha256 = '0'.repeat(64); f.saveReceipt(); assert.throws(() => conceptImport(f.root, f.id, f.plan.ticket, f.env), /Receipt/);
});
test('tampered concept output and report detected', () => {
  const f = fixture(), result = conceptImport(f.root, f.id, f.plan.ticket, f.env);
  fs.appendFileSync(path.join(result.directory, 'candidate.png'), 'modified');
  assert.throws(() => conceptVerify(f.root, f.id, f.plan.ticket, f.env), /files changed/);
});
test('candidate directory symlink refused', () => {
  const f = fixture(); fs.symlinkSync(os.tmpdir(), path.join(f.plan.directory, 'candidates'));
  assert.throws(() => conceptImport(f.root, f.id, f.plan.ticket, f.env), /Symlink/);
});
test('concept input path escape and invalid limits rejected', () => {
  const f = fixture(); f.spec.prompt = 'design/prompts/../../outside.md'; writeJSON(f.root, `design/concepts/${f.id}.json`, f.spec);
  assert.throws(() => conceptPlan(f.root, f.id, f.env), /Unsafe/);
  f.spec.prompt = 'design/prompts/puzzle.md'; f.spec.constraints.maxEdge = 100000; writeJSON(f.root, `design/concepts/${f.id}.json`, f.spec);
  assert.throws(() => conceptPlan(f.root, f.id, f.env), /size limit/);
});
test('unknown concept commands cannot publish', () => {
  const f = fixture(); assert.throws(() => run('concept-publish', f.root, {}, f.id), /Unknown concept command/);
});
test('output dimensions are checked against pre-generation limits', () => {
  const f = fixture(); f.spec.constraints.minWidth = 64; writeJSON(f.root, `design/concepts/${f.id}.json`, f.spec);
  const plan = conceptPlan(f.root, f.id, f.env);
  assert.throws(() => conceptImport(f.root, f.id, plan.ticket, f.env), /dimensions/);
});
