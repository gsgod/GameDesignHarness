import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { check, hash, json, inside, read, writeJSON, write, inventory } from './files.mjs';
import { validate } from './contract.mjs';
import { tool, execute, inspect, contactSheet } from '../adapters/imagemagick.mjs';
import { conceptRun } from './concepts.mjs';

const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = () => fs.existsSync(path.join(home, 'release.json')) ? hash(fs.readFileSync(path.join(home, 'release.json'))) : 'development';
const requirements = root => validate(JSON.parse(read(root, 'design/requirements.json')));
const area = 'builds/design';
const runPath = id => { check(/^[0-9a-f]{64}$/.test(id), 'Invalid run ID'); return `${area}/runs/${id}`; };
const now = () => new Date().toISOString();

export function configure(root, options) {
  const tools = { node: process.version, imagemagick: tool(options.magick, ['-version']) };
  check(tools.imagemagick.version.startsWith('Version: ImageMagick 7.'), 'ImageMagick 7 required');
  if (options.godot) {
    tools.godot = tool(options.godot, ['--version']);
    check(tools.godot.version.startsWith('4.'), 'Godot 4 required');
  }
  writeJSON(root, 'design/tools.local.json', tools);
  return { configured: tools, note: 'Changing tool identity invalidates existing run approvals. Do not commit machine paths.' };
}
export function doctor(root) {
  const configured = JSON.parse(read(root, 'design/tools.local.json'));
  check(configured.node === process.version, 'Node changed: explicitly reconfigure');
  const identities = { node: process.version };
  for (const name of ['imagemagick', 'godot']) {
    if (!configured[name]) continue;
    // Verify the configured executable BEFORE running even its version command.
    check(typeof configured[name].binary === 'string' && path.isAbsolute(configured[name].binary), 'Tool path must be absolute');
    const binary = fs.realpathSync(configured[name].binary);
    check(fs.statSync(binary).isFile() && hash(fs.readFileSync(binary)) === configured[name].sha256, `${name} changed: explicitly reconfigure`);
    const current = tool(configured[name].binary, name === 'godot' ? ['--version'] : ['-version']);
    check(current.sha256 === configured[name].sha256 && current.version === configured[name].version, `${name} changed: explicitly reconfigure`);
    identities[name] = current;
  }
  check(identities.imagemagick, 'ImageMagick is required');
  return identities;
}
export function plan(root) {
  const c = requirements(root), pending = [];
  for (const ref of c.references) read(root, ref);
  for (const a of c.assets) {
    for (const name of new Set([a.source, a.editable])) if (!fs.existsSync(inside(root, name))) pending.push({ asset: a.id, reason: 'missing-source', path: name });
    if (a.provenance.kind === 'pending' || !a.provenance.reviewed) pending.push({ asset: a.id, reason: 'provenance-review-needed' });
  }
  const result = { project: c.project, pack: c.pack, profile: c.profile, engine: c.engine,
    status: pending.length ? 'needs-artwork' : 'ready-to-build', pending,
    tools: { runner: 'Node.js 22+', pixels: 'Pixelorama (manual .pxo → PNG)', painting: 'Krita (manual .kra → PNG)', validation: 'ImageMagick 7', engine: c.engine },
    capabilities: ['PNG validation', 'contact sheet', 'source and license manifest', 'Godot PNG decode check', 'explicit approval', 'immutable local publish'],
    notImplemented: ['automatic original illustration', 'native editor CLI export', 'atlas packing', '3D/audio', 'visual-quality judgment', 'in-game UI replacement'],
    visualReview: c.visualReview, assets: c.assets.map(a => ({ id: a.id, purpose: a.purpose, authoring: a.authoring, source: a.source, editable: a.editable, size: [a.width, a.height] })) };
  writeJSON(root, `${area}/plan.json`, result);
  return result;
}
function snapshot(root) {
  const c = requirements(root), tools = doctor(root), inputs = {};
  if (c.engine === 'godot-4') check(tools.godot, 'Configure Godot before build');
  for (const name of new Set(['design/requirements.json', ...c.references, ...c.assets.flatMap(a => [a.source, a.editable])])) inputs[name] = hash(read(root, name));
  const identities = Object.fromEntries(Object.entries(tools).map(([key, val]) => [key, typeof val === 'string' ? val : { version: val.version, sha256: val.sha256 }]));
  const data = { release: release(), inputs, tools: identities };
  return { c, tools, data, id: hash(JSON.stringify(data)) };
}
function locked(root, fn) {
  const file = inside(root, `${area}/writer.lock`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'wx');
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, created: now() }));
  try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(file); }
}
export function build(root) {
  return locked(root, () => {
    const p = plan(root); check(p.pending.length === 0, `Artwork/provenance missing (${p.pending.length}); see builds/design/plan.json`);
    const s = snapshot(root), dest = inside(root, runPath(s.id));
    if (fs.existsSync(dest)) return { ...verify(root, s.id), cached: true };
    const stageName = `${area}/partial-${crypto.randomUUID()}`, stage = inside(root, stageName);
    fs.mkdirSync(path.join(stage, 'pack'), { recursive: true });
    const assets = [];
    for (const a of s.c.assets) {
      const metadata = inspect(s.tools.imagemagick.binary, root, a.source, a);
      write(stage, `pack/${a.id}.png`, read(root, a.source), true);
      // Save editable sources with their original path. Never modify the artist's originals.
      for (const source of new Set([a.source, a.editable])) if (!fs.existsSync(inside(stage, `sources/${source}`))) write(stage, `sources/${source}`, read(root, source), true);
      assets.push({ id: a.id, file: `${a.id}.png`, ...metadata, ...(a.grid ? { grid: a.grid } : {}), provenance: a.provenance, source: a.source, editable: a.editable });
    }
    for (const ref of ['design/requirements.json', ...s.c.references]) write(stage, `sources/${ref}`, read(root, ref), true);
    writeJSON(stage, 'pack/manifest.json', { schema: 1, project: s.c.project, pack: s.c.pack, run: s.id, assets }, true);
    contactSheet(s.tools.imagemagick.binary, assets.map(a => path.join(stage, 'pack', a.file)), path.join(stage, 'contact-sheet.png'));
    writeJSON(stage, 'contact-sheet-index.json', assets.map((a, i) => ({ cell: i, id: a.id, file: a.file })), true);
    const files = inventory(stage), digest = hash(JSON.stringify({ snapshot: s.data, files }));
    writeJSON(stage, 'report.json', { schema: 1, id: s.id, digest, snapshot: s.data, files, technical: 'passed', visual: 'pending', created: now() }, true);
    // Abort rather than approving bytes from sources edited during the build.
    check(snapshot(root).id === s.id, 'Inputs changed during build; partial preserved');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(stage, dest);
    return { id: s.id, directory: dest, technical: 'passed', visual: 'pending', cached: false };
  });
}
export function verify(root, id) {
  const s = snapshot(root); check(s.id === id, 'Inputs/toolchain/release changed; rebuild and review again');
  const run = inside(root, runPath(id)), report = json(path.join(run, 'report.json'));
  check(report.id === id && JSON.stringify(report.snapshot) === JSON.stringify(s.data), 'Run snapshot mismatch');
  const current = inventory(run); delete current['report.json'];
  check(JSON.stringify(current) === JSON.stringify(report.files), 'Run files changed');
  check(report.digest === hash(JSON.stringify({ snapshot: s.data, files: current })), 'Run digest mismatch');
  for (const a of s.c.assets) inspect(s.tools.imagemagick.binary, run, `pack/${a.id}.png`, a);
  return { id, digest: report.digest, directory: run, technical: 'passed' };
}
export function engineCheck(root, id) {
  return locked(root, () => {
    const verified = verify(root, id), c = requirements(root), tools = doctor(root);
    let log = 'No engine adapter requested';
    if (c.engine === 'godot-4') {
      const logPath = inside(root, `${area}/reviews/${id}.godot.log`);
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      // Godot may create caches beside project.godot. Never run inside immutable release code.
      const engineRoot = inside(root, `${area}/engine-${crypto.randomUUID()}`);
      fs.mkdirSync(engineRoot);
      for (const file of ['project.godot', 'check.gd']) write(engineRoot, file, fs.readFileSync(path.join(home, 'adapters/godot', file)), true);
      log = execute(tools.godot.binary, ['--headless', '--path', engineRoot, '--script', path.join(engineRoot, 'check.gd'), '--log-file', logPath, '--', `--manifest=${path.join(verified.directory, 'pack/manifest.json')}`]);
      const fullLog = log + (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '');
      check(log.includes('HARNESS_IMPORT_OK') && !/SCRIPT ERROR|^ERROR:|leaked at exit/m.test(fullLog), 'Godot import check failed');
    }
    verify(root, id);
    const result = { id, digest: verified.digest, engine: c.engine, check: 'PNG-decode-only', passed: true, log, created: now() };
    writeJSON(root, `${area}/reviews/${id}.engine.json`, result);
    return result;
  });
}
function engineReceipt(root, id, digest) {
  const e = JSON.parse(read(root, `${area}/reviews/${id}.engine.json`));
  check(e.id === id && e.digest === digest && e.passed === true && e.engine === requirements(root).engine, 'Run engine-check first');
  return hash(JSON.stringify(e));
}
export function approve(root, id, options) {
  return locked(root, () => {
    const v = verify(root, id), engine = engineReceipt(root, id, v.digest);
    check(typeof options.reviewer === 'string' && options.reviewer.trim().length >= 2 && typeof options.note === 'string' && options.note.trim().length >= 10, 'Explicit reviewer and meaningful review note required');
    check(typeof options.evidence === 'string' && options.evidence.startsWith('design/reviews/'), 'Local design/reviews/ evidence required');
    const evidence = hash(read(root, options.evidence));
    const result = { id, digest: v.digest, engine, reviewer: options.reviewer, note: options.note, evidence: { path: options.evidence, sha256: evidence }, criteria: requirements(root).visualReview, created: now() };
    writeJSON(root, `${area}/reviews/${id}.approval.json`, result);
    return result;
  });
}
export function publish(root, id) {
  return locked(root, () => {
    const v = verify(root, id), engine = engineReceipt(root, id, v.digest), c = requirements(root);
    const a = JSON.parse(read(root, `${area}/reviews/${id}.approval.json`));
    check(a.id === id && a.digest === v.digest && a.engine === engine && a.evidence?.sha256 === hash(read(root, a.evidence.path)), 'Approval stale or missing');
    const parent = c.engine === 'godot-4' ? 'game/assets/generated' : 'assets/generated';
    const target = inside(root, `${parent}/${c.pack}/${id}`), source = path.join(v.directory, 'pack');
    const expected = { ...inventory(source), 'approval.json': hash(`${JSON.stringify(a, null, 2)}\n`) };
    if (fs.existsSync(target)) {
      check(JSON.stringify(inventory(target)) === JSON.stringify(Object.fromEntries(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b)))), 'Published pack changed; refusing overwrite');
      return { target, alreadyPublished: true };
    }
    const stage = inside(root, `${area}/publish-${crypto.randomUUID()}`);
    fs.mkdirSync(stage);
    for (const file of Object.keys(inventory(source))) write(stage, file, read(source, file), true);
    writeJSON(stage, 'approval.json', a, true);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(stage, target);
    return { target, alreadyPublished: false, note: 'Local files only. No runtime pointer, game UI, Git or Steam changes.' };
  });
}
export function run(command, project, options = {}, id) {
  const root = fs.realpathSync(project);
  check(Number(process.versions.node.split('.')[0]) >= 22, 'Node 22+ required');
  if (command?.startsWith('concept-')) return conceptRun(command, root, id, options, { release: release(), tools: doctor(root) });
  if (command === 'configure') return configure(root, options);
  if (command === 'doctor') return doctor(root);
  if (command === 'plan' || command === 'status') return plan(root);
  if (command === 'build') return build(root);
  if (command === 'verify') return verify(root, id);
  if (command === 'engine-check') return engineCheck(root, id);
  if (command === 'approve') return approve(root, id, options);
  if (command === 'publish') return publish(root, id);
  throw new Error('Commands: configure, doctor, plan, status, build, verify, engine-check, approve, publish');
}
