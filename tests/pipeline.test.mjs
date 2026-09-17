import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configure, doctor, plan, build, verify, engineCheck, approve, publish } from '../core/pipeline.mjs';
import { hash, inside, writeJSON, write } from '../core/files.mjs';
import { validate } from '../core/contract.mjs';
import { execute, crc32 } from '../adapters/imagemagick.mjs';

const magick = process.env.HARNESS_TEST_MAGICK || '/opt/homebrew/bin/magick';
const godot = process.env.HARNESS_TEST_GODOT;
function fixture(engine = 'none') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-puzzle-test-'));
  fs.mkdirSync(path.join(root, 'art/source'), { recursive: true });
  const source = 'art/source/puzzle.png', editable = 'art/source/puzzle.txt';
  execute(magick, ['-size', '16x16', 'xc:none', '-fill', '#ffcc00', '-draw', 'rectangle 4,4 11,11', `PNG:${path.join(root, source)}`]);
  write(root, editable, 'Synthetic puzzle test fixture: transparent 16×16, yellow center. Not game artwork.\n');
  write(root, 'design/brief.md', '# Synthetic puzzle fixture, no history dependency\n');
  const c = { schema: 1, project: 'puzzle-fixture', pack: 'puzzle-ui', profile: 'pixel-2d', engine,
    policy: { network: false, paidTools: false, generativeAI: false }, brief: 'Generic puzzle icons, technical fixtures only', references: ['design/brief.md'], visualReview: ['Synthetic test approval, never production art'],
    assets: [{ id: 'puzzle', source, editable, width: 16, height: 16, alpha: 'transparent', maxColors: 2, palette: ['#ffcc00'], grid: { width: 8, height: 8 }, purpose: 'Test generic pipeline', authoring: 'Synthetic fixture', provenance: { kind: 'original', creator: 'test fixture', source: 'deterministic test recipe', license: 'project-original', ai: false, reviewed: true } }] };
  writeJSON(root, 'design/requirements.json', c);
  configure(root, { magick, ...(godot ? { godot } : {}) });
  return { root, c, save: () => writeJSON(root, 'design/requirements.json', c) };
}
function approval(root, id) {
  write(root, 'design/reviews/test.md', 'TEST ONLY: synthetic fixture visual check, not user approval of Game_1.\n');
  return approve(root, id, { reviewer: 'test-suite', note: 'Test-only fixture review for pipeline behavior.', evidence: 'design/reviews/test.md' });
}
test('generic non-history end-to-end: plan/build/cache/verify/engine/approve/publish; source unchanged', () => {
  const f = fixture(), before = hash(fs.readFileSync(path.join(f.root, f.c.assets[0].source)));
  assert.equal(plan(f.root).status, 'ready-to-build');
  const b = build(f.root);
  assert.equal(b.technical, 'passed'); assert.equal(b.visual, 'pending');
  assert.equal(build(f.root).cached, true);
  assert.equal(verify(f.root, b.id).id, b.id);
  assert.throws(() => publish(f.root, b.id));
  engineCheck(f.root, b.id); approval(f.root, b.id);
  const p = publish(f.root, b.id);
  assert.ok(fs.existsSync(path.join(p.target, 'manifest.json')));
  assert.equal(publish(f.root, b.id).alreadyPublished, true);
  assert.equal(hash(fs.readFileSync(path.join(f.root, f.c.assets[0].source))), before);
});
test('Godot adapter decodes exported PNG without mutating game files', { skip: !godot }, () => {
  const f = fixture('godot-4'), b = build(f.root);
  assert.equal(engineCheck(f.root, b.id).passed, true);
  approval(f.root, b.id);
  assert.ok(publish(f.root, b.id).target.includes('game/assets/generated'));
});
test('missing artwork is a pending task, not successful art generation', () => {
  const f = fixture(); f.c.assets[0].source = 'art/source/not-drawn.png'; f.save();
  assert.equal(plan(f.root).status, 'needs-artwork'); assert.throws(() => build(f.root), /Artwork/);
});
test('unreviewed/pending licenses block build', () => {
  const f = fixture(); f.c.assets[0].provenance.reviewed = false; f.save();
  assert.throws(() => build(f.root), /provenance/);
  f.c.assets[0].provenance.reviewed = true; f.c.assets[0].provenance.kind = 'pending'; f.save();
  assert.throws(() => build(f.root), /provenance/);
});
test('dimension mismatch blocks build', () => {
  const f = fixture(); f.c.assets[0].width = 32; f.save(); assert.throws(() => build(f.root), /dimensions/);
});
test('color budget, alpha, palette each block incorrect assets', () => {
  const f = fixture(); f.c.assets[0].maxColors = 1; f.save(); assert.throws(() => build(f.root), /color budget/);
  f.c.assets[0].maxColors = 2; f.c.assets[0].alpha = 'opaque'; f.save(); assert.throws(() => build(f.root), /Opaque/);
  f.c.assets[0].alpha = 'transparent'; f.c.assets[0].palette = ['#ffffff']; f.save(); assert.throws(() => build(f.root), /Palette/);
});
test('reject invalid PNG bytes', () => {
  const f = fixture(); write(f.root, f.c.assets[0].source, 'not a PNG'); assert.throws(() => build(f.root), /Not PNG/);
});
test('reject PNG trailing bytes', () => {
  const f = fixture(); fs.appendFileSync(path.join(f.root, f.c.assets[0].source), 'trailing');
  assert.throws(() => build(f.root), /trailing/);
});
test('reject PNG CRC corruption and animation', () => {
  const f = fixture(), name = path.join(f.root, f.c.assets[0].source), bytes = fs.readFileSync(name);
  const corrupted = Buffer.from(bytes); corrupted[29] ^= 1;
  write(f.root, f.c.assets[0].source, corrupted); assert.throws(() => build(f.root), /CRC/);
  const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8); chunk.write('acTL', 4); chunk.writeUInt32BE(1, 8); chunk.writeUInt32BE(crc32(chunk.subarray(4, 16)), 16);
  write(f.root, f.c.assets[0].source, Buffer.concat([bytes.subarray(0, 33), chunk, bytes.subarray(33)]));
  assert.throws(() => build(f.root), /animated/);
});
test('source and editable changes invalidate approval', () => {
  const f = fixture(), b = build(f.root); engineCheck(f.root, b.id); approval(f.root, b.id);
  write(f.root, f.c.assets[0].editable, 'new artist revision'); assert.throws(() => publish(f.root, b.id), /changed/);
});
test('design references invalidate old run', () => {
  const f = fixture(), b = build(f.root); write(f.root, 'design/brief.md', 'revised direction');
  assert.throws(() => verify(f.root, b.id), /changed/);
});
test('changed outputs detected; cached build refuses corruption', () => {
  const f = fixture(), b = build(f.root); fs.appendFileSync(path.join(b.directory, 'pack/puzzle.png'), 'bad');
  assert.throws(() => verify(f.root, b.id), /files changed/); assert.throws(() => build(f.root), /files changed/);
});
test('changed approval evidence prevents publish', () => {
  const f = fixture(), b = build(f.root); engineCheck(f.root, b.id); approval(f.root, b.id);
  write(f.root, 'design/reviews/test.md', 'review withdrawn'); assert.throws(() => publish(f.root, b.id), /Approval stale/);
});
test('published pack cannot be overwritten', () => {
  const f = fixture(), b = build(f.root); engineCheck(f.root, b.id); approval(f.root, b.id);
  const p = publish(f.root, b.id); fs.appendFileSync(path.join(p.target, 'puzzle.png'), 'bad');
  assert.throws(() => publish(f.root, b.id), /refusing overwrite/);
});
test('paths, symlinks, duplicate IDs and paid/network policy rejected', () => {
  const f = fixture();
  for (const p of ['../evil.png', '/tmp/evil.png', 'art/source/../evil.png', 'C:\\evil.png']) {
    const c = structuredClone(f.c); c.assets[0].source = p; assert.throws(() => validate(c));
  }
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'art/source/link'));
  assert.throws(() => inside(f.root, 'art/source/link/evil.png'), /Symlink/);
  for (const key of ['network', 'paidTools']) { const c = structuredClone(f.c); c.policy[key] = true; assert.throws(() => validate(c), /offline/); }
  const allowed = structuredClone(f.c); allowed.policy.generativeAI = true; assert.equal(validate(allowed), allowed);
  const c = structuredClone(f.c); c.assets.push(c.assets[0]); assert.throws(() => validate(c), /Duplicate/);
});
test('symlink output directory is refused', () => {
  const f = fixture(); fs.symlinkSync(os.tmpdir(), path.join(f.root, 'builds')); assert.throws(() => build(f.root), /Symlink/);
});
test('writer lock prevents concurrent mutation, never deletes someone else lock', () => {
  const f = fixture(); write(f.root, 'builds/design/writer.lock', 'existing');
  assert.throws(() => build(f.root), /EEXIST/); assert.equal(fs.readFileSync(path.join(f.root, 'builds/design/writer.lock'), 'utf8'), 'existing');
});
test('tool pin mismatch is rejected instead of automatically updating', () => {
  const f = fixture(), local = path.join(f.root, 'design/tools.local.json'), data = JSON.parse(fs.readFileSync(local));
  data.imagemagick.sha256 = 'incorrect'; writeJSON(f.root, 'design/tools.local.json', data);
  assert.throws(() => doctor(f.root), /changed/);
});
test('replaced binary is rejected before any attempt to execute it', () => {
  const f = fixture(), data = JSON.parse(fs.readFileSync(path.join(f.root, 'design/tools.local.json')));
  write(f.root, 'design/not-an-executable', 'Untrusted replacement. Must not attempt execution.');
  data.imagemagick.binary = path.join(f.root, 'design/not-an-executable');
  writeJSON(f.root, 'design/tools.local.json', data);
  assert.throws(() => doctor(f.root), /imagemagick changed/);
});
test('no approval without engine receipt and meaningful evidence', () => {
  const f = fixture(), b = build(f.root); assert.throws(() => approval(f.root, b.id));
  engineCheck(f.root, b.id); assert.throws(() => approve(f.root, b.id, {}), /reviewer/);
});
