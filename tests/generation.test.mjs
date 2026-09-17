import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { configure, plan, build, verify, engineCheck, approve, publish } from '../core/pipeline.mjs';
import { validate } from '../core/contract.mjs';
import { read, write, writeJSON, hash } from '../core/files.mjs';
import { execute } from '../adapters/imagemagick.mjs';

const magick = process.env.HARNESS_TEST_MAGICK || '/opt/homebrew/bin/magick';
const godot = process.env.HARNESS_TEST_GODOT;
function fixture(engine = 'none') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-ai-test-'));
  const bind = name => ({ path: name, sha256: hash(read(root, name)) });
  for (const name of ['design/prompts/test.md', 'design/decisions/permit.md', 'design/decisions/free.md', 'design/reviews/rights.md', 'design/reference.md'])
    write(root, name, 'SYNTHETIC TEST ONLY: no actual image generation, billing attestation or Game_1 approval.');
  const original = 'art/source/original.png', source = 'art/source/final.png';
  fs.mkdirSync(path.join(root, 'art/source'), { recursive: true });
  execute(magick, ['-size', '16x16', 'xc:#d8aa57', `PNG:${path.join(root, original)}`]);
  write(root, source, read(root, original));
  const cost = { status: 'free-local', paid: false, reviewed: true, checkedBy: 'synthetic-test', checkedAt: '2026-09-17', evidence: bind('design/decisions/free.md') };
  const receiptPath = 'design/generation/test.receipt.json', processingPath = 'design/generation/test.processing.json';
  const receipt = { schema: 1, generator: 'synthetic-fixture-not-a-generator', mode: 'local-tool', ai: true,
    imageSha256: hash(read(root, original)), promptSha256: hash(read(root, 'design/prompts/test.md')),
    productionApproved: false, toolOutputFile: 'synthetic.png', createdAt: '2026-09-17', note: 'Synthetic fixture, not actual generation or approval.' };
  const processing = { schema: 1, ai: true, inputSha256: receipt.imageSha256, outputSha256: hash(read(root, source)), editableSha256: hash(read(root, source)),
    steps: [{ tool: 'test-only-copy', operation: 'Unchanged PNG copy, synthetic test only', cost: structuredClone(cost) }] };
  writeJSON(root, receiptPath, receipt); writeJSON(root, processingPath, processing);
  const g = { schema: 1, generator: receipt.generator, mode: receipt.mode, original: bind(original), prompt: bind('design/prompts/test.md'), receipt: bind(receiptPath),
    authorization: bind('design/decisions/permit.md'), rights: bind('design/reviews/rights.md'), references: [bind('design/reference.md')], processing: bind(processingPath), cost };
  const a = { id: 'puzzle', source, editable: source, sourceFormat: 'flat-png', width: 16, height: 16, alpha: 'opaque', maxColors: 2,
    purpose: 'Generic test fixture, not game artwork', authoring: 'Synthetic test fixture only',
    provenance: { kind: 'original', creator: 'synthetic-test', license: 'test-only', source: 'synthetic-test', reviewed: true, ai: true, generation: g } };
  const c = { schema: 1, project: 'ai-fixture', pack: 'puzzle-fixture', profile: 'pixel-2d', engine,
    policy: { network: false, paidTools: false, generativeAI: true }, brief: 'Synthetic AI provenance pipeline test, no real generation',
    references: [], visualReview: ['Test fixture approval, not Game_1 approval'], assets: [a] };
  const save = () => writeJSON(root, 'design/requirements.json', c);
  const saveReceipt = () => { writeJSON(root, receiptPath, receipt); g.receipt = bind(receiptPath); save(); };
  const saveProcessing = () => { writeJSON(root, processingPath, processing); g.processing = bind(processingPath); save(); };
  save(); configure(root, { magick, ...(godot ? { godot } : {}) });
  return { root, bind, c, a, g, receipt, processing, save, saveReceipt, saveProcessing };
}
function approveFixture(f, id) {
  write(f.root, 'design/reviews/visual.md', 'SYNTHETIC TEST ONLY: explicit candidate approval; never approval for actual Game_1 artwork.');
  return approve(f.root, id, { reviewer: 'synthetic-test', note: 'Fixture approval only, no user artwork approval.', evidence: 'design/reviews/visual.md' });
}
test('AI production: explicit free evidence, flat original, snapshot, engine, separate approval and immutable publish', () => {
  const f = fixture(); assert.equal(plan(f.root).status, 'ready-to-build');
  const b = build(f.root); assert.equal(b.visual, 'pending'); assert.equal(build(f.root).cached, true);
  const manifest = JSON.parse(read(b.directory, 'pack/manifest.json'));
  assert.equal(manifest.assets[0].provenance.ai, true); assert.equal(manifest.assets[0].sourceFormat, 'flat-png');
  for (const file of [f.g.original.path, f.g.receipt.path, f.g.prompt.path, f.g.cost.evidence.path, f.g.processing.path, f.g.rights.path, f.g.authorization.path, f.g.references[0].path])
    assert.equal(hash(read(b.directory, `sources/${file}`)), hash(read(f.root, file)));
  assert.throws(() => publish(f.root, b.id)); engineCheck(f.root, b.id);
  assert.throws(() => publish(f.root, b.id)); approveFixture(f, b.id);
  const p = publish(f.root, b.id); assert.ok(fs.existsSync(path.join(p.target, 'puzzle.png')));
  assert.equal(publish(f.root, b.id).alreadyPublished, true);
});
test('AI Godot PNG decode and test-only publication', { skip: !godot }, () => {
  const f = fixture('godot-4'), b = build(f.root);
  assert.equal(engineCheck(f.root, b.id).passed, true); approveFixture(f, b.id);
  assert.ok(publish(f.root, b.id).target.includes('game/assets/generated'));
});
test('AI opt-in is required; paid/network remain forbidden', () => {
  const f = fixture(); f.c.policy.generativeAI = false; assert.throws(() => validate(f.c), /explicit generativeAI/);
  f.c.policy.generativeAI = true;
  for (const key of ['network', 'paidTools']) { f.c.policy[key] = true; assert.throws(() => validate(f.c), /forbidden/); f.c.policy[key] = false; }
});
test('paid, unknown, unreviewed or undated generation cost is blocked', () => {
  const f = fixture(), original = structuredClone(f.g.cost);
  for (const change of [{ status: 'paid' }, { status: 'unknown' }, { paid: true }, { reviewed: false }, { checkedBy: '' }, { checkedAt: 'not-a-date' }]) {
    f.g.cost = { ...original, ...change }; assert.throws(() => validate(f.c), /cost|Cost/);
  }
});
test('included tool access still needs explicit no-extra-charge evidence', () => {
  const f = fixture(); f.g.cost.status = 'included-no-extra-charge'; f.save(); assert.equal(plan(f.root).status, 'ready-to-build');
  delete f.g.cost.evidence; f.save(); assert.throws(() => plan(f.root), /binding/);
});
test('paid or unknown processing tools are blocked too', () => {
  const f = fixture(); f.processing.steps[0].cost.status = 'paid'; f.saveProcessing(); assert.throws(() => build(f.root), /cost/);
  f.processing.steps[0].cost.status = 'unknown'; f.saveProcessing(); assert.throws(() => build(f.root), /cost/);
});
test('AI attribution cannot be removed from generation or processing metadata', () => {
  const f = fixture(); f.a.provenance.ai = false; assert.throws(() => validate(f.c), /erase AI/);
  f.a.provenance.ai = true; f.processing.ai = false; f.saveProcessing(); assert.throws(() => plan(f.root), /attribution/);
});
test('AI metadata and real source format are required', () => {
  const f = fixture(); delete f.a.sourceFormat; assert.throws(() => validate(f.c), /sourceFormat/);
  f.a.sourceFormat = 'flat-png'; delete f.a.provenance.generation; assert.throws(() => validate(f.c), /generation record/);
});
test('flat PNG renamed as a layered original is rejected', () => {
  const f = fixture(); f.a.editable = 'art/source/fake.kra'; f.a.sourceFormat = 'layered-document';
  write(f.root, f.a.editable, read(f.root, f.a.source)); f.save(); assert.throws(() => plan(f.root), /masquerade/);
});
test('flat working original must really decode as PNG', () => {
  const f = fixture(); f.a.editable = 'art/source/fake.png';
  write(f.root, f.a.editable, 'This is plain text, not a working PNG original.');
  f.processing.editableSha256 = hash(read(f.root, f.a.editable)); f.saveProcessing();
  assert.throws(() => build(f.root), /not PNG/);
});
test('known AI run cannot be reclassified after removing all generation metadata', () => {
  const f = fixture(); build(f.root); f.a.provenance.ai = false; delete f.a.provenance.generation; f.c.policy.generativeAI = false; f.save();
  assert.throws(() => build(f.root), /Known AI source/);
});
test('known concept PNG cannot bypass production gates as non-AI', () => {
  const f = fixture(); writeJSON(f.root, 'design/concepts/old.receipt.json', f.receipt);
  f.a.provenance.ai = false; delete f.a.provenance.generation; f.save();
  assert.throws(() => build(f.root), /Known AI source/);
});
test('mixed AI/non-AI attribution for identical bytes is rejected before the first build', () => {
  const f = fixture(), duplicate = structuredClone(f.a); duplicate.id = 'reclassified';
  duplicate.provenance.ai = false; delete duplicate.provenance.generation; f.c.assets.push(duplicate); f.save();
  assert.throws(() => plan(f.root), /Known AI source/); assert.throws(() => build(f.root), /Known AI source/);
  assert.equal(fs.existsSync(path.join(f.root, 'builds/design/runs')), false);
});
test('receipt must bind actual prompt, image, generator and AI status without approval', () => {
  const f = fixture(), original = structuredClone(f.receipt);
  for (const change of [{ imageSha256: '0'.repeat(64) }, { promptSha256: '0'.repeat(64) }, { generator: 'different' }, { ai: false }, { productionApproved: true }]) {
    Object.assign(f.receipt, original, change); f.saveReceipt(); assert.throws(() => plan(f.root), /receipt must match/);
  }
});
test('processing hashes bind original, final export and working source', () => {
  const f = fixture(), original = structuredClone(f.processing);
  for (const key of ['inputSha256', 'outputSha256', 'editableSha256']) {
    Object.assign(f.processing, original, { [key]: '0'.repeat(64) }); f.saveProcessing(); assert.throws(() => plan(f.root), /Processing record/);
  }
});
test('generation evidence rejects path escapes and symlinks', () => {
  const f = fixture(); f.g.cost.evidence.path = 'design/decisions/../../../outside'; assert.throws(() => validate(f.c), /Unsafe/);
  f.g.cost.evidence = f.bind('design/decisions/free.md'); fs.symlinkSync(os.tmpdir(), path.join(f.root, 'design/link'));
  f.g.references[0].path = 'design/link/outside.md'; f.save(); assert.throws(() => plan(f.root), /Symlink/);
});
test('missing/empty cost and rights evidence do not pass', () => {
  const f = fixture(); f.g.cost.evidence.path = 'design/decisions/missing.md'; f.save(); assert.throws(() => plan(f.root), /ENOENT/);
  write(f.root, 'design/decisions/empty.md', ''); f.g.cost.evidence = f.bind('design/decisions/empty.md'); f.save(); assert.throws(() => plan(f.root), /Meaningful/);
});
test('unreviewed rights still block AI build', () => {
  const f = fixture(); f.a.provenance.reviewed = false; f.save(); assert.throws(() => build(f.root), /provenance missing/);
});
for (const field of ['original', 'prompt', 'receipt', 'authorization', 'rights', 'processing', 'cost', 'reference']) {
  test(`changed transitive ${field} evidence invalidates verified/approved run`, () => {
    const f = fixture(), b = build(f.root); engineCheck(f.root, b.id); approveFixture(f, b.id);
    const binding = field === 'cost' ? f.g.cost.evidence : field === 'reference' ? f.g.references[0] : f.g[field];
    fs.appendFileSync(path.join(f.root, binding.path), 'changed');
    assert.throws(() => verify(f.root, b.id), /hash mismatch/); assert.throws(() => publish(f.root, b.id), /hash mismatch/);
  });
}
test('re-attested cost evidence creates new inputs rather than reusing old approval', () => {
  const f = fixture(), b = build(f.root); engineCheck(f.root, b.id); approveFixture(f, b.id);
  write(f.root, 'design/decisions/free.md', 'SYNTHETIC TEST ONLY: revised tool cost evidence, not real billing proof.');
  f.g.cost.evidence = f.bind('design/decisions/free.md'); f.processing.steps[0].cost.evidence = f.g.cost.evidence; f.saveProcessing();
  assert.throws(() => publish(f.root, b.id), /changed/);
});
