// Review-only concept workflow. No generator credentials, network calls or publish entry point.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { check, hash, read, inside, inventory, write, writeJSON } from './files.mjs';
import { inspect } from '../adapters/imagemagick.mjs';

const idPattern = /^[a-z][a-z0-9_-]{0,63}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const text = x => typeof x === 'string' && x.trim().length > 0;
function scoped(name, prefix) {
  check(typeof name === 'string' && name.startsWith(prefix), `Expected ${prefix} path`);
  return name;
}
export function conceptSnapshot(root, id, environment) {
  check(idPattern.test(id ?? ''), 'Invalid concept ID');
  const name = `design/concepts/${id}.json`, c = JSON.parse(read(root, name));
  check(c.schema === 1 && c.id === id && c.purpose === 'review-only', 'Concepts must be review-only');
  check(c.generator === 'codex-built-in-imagegen', 'Only explicitly authorized built-in imagegen handoff is supported');
  scoped(c.authorization, 'design/decisions/'); scoped(c.prompt, 'design/prompts/'); scoped(c.output, 'art/source/concepts/');
  check(c.output.endsWith('.png'), 'Concept output must be PNG');
  check(Array.isArray(c.references) && c.references.length <= 16, 'Up to 16 references allowed');
  c.references.forEach(n => scoped(n, 'design/'));
  check(Array.isArray(c.imageReferences) && c.imageReferences.length <= 5 && c.imageReferences.every(n => c.references.includes(n) && n.endsWith('.png')), 'Image references must be listed PNG references');
  check(Array.isArray(c.reviewCriteria) && c.reviewCriteria.length > 0 && c.reviewCriteria.every(text), 'Visual review criteria required');
  const limits = c.constraints;
  check(limits && ['minWidth', 'minHeight', 'maxEdge', 'maxPixels'].every(k => Number.isSafeInteger(limits[k]) && limits[k] > 0), 'Integer dimensions required');
  check(limits.maxEdge <= 4096 && limits.maxPixels <= 4194304 && limits.minWidth <= limits.maxEdge && limits.minHeight <= limits.maxEdge, 'Concept size limit exceeded');
  check(Number.isFinite(limits.minAspect) && Number.isFinite(limits.maxAspect) && limits.minAspect > 0 && limits.maxAspect >= limits.minAspect && ['opaque', 'any'].includes(limits.alpha), 'Invalid aspect/alpha limits');
  const files = {};
  for (const file of new Set([name, c.authorization, c.prompt, ...c.references])) files[file] = hash(read(root, file));
  const prompt = read(root, c.prompt).toString('utf8');
  check(prompt.trim().length >= 20 && read(root, c.authorization).toString('utf8').trim().length >= 20, 'Prompt and explicit authorization record required');
  const tools = Object.fromEntries(Object.entries(environment.tools).map(([key, value]) => [key, typeof value === 'string' ? value : { version: value.version, sha256: value.sha256 }]));
  const inputs = { files, release: environment.release, tools };
  return { c, prompt, inputs, ticket: hash(JSON.stringify(inputs)) };
}
function directory(root, id, ticket) {
  check(idPattern.test(id) && digestPattern.test(ticket ?? ''), 'Invalid concept ID/ticket');
  return inside(root, `builds/design/concepts/${id}/${ticket}`);
}
function planned(root, id, ticket, environment) {
  const s = conceptSnapshot(root, id, environment);
  check(ticket === s.ticket, 'Concept inputs changed or wrong ticket; plan again before generation');
  directory(root, id, ticket);
  const file = inside(root, `builds/design/concepts/${id}/${ticket}/plan.json`);
  const plan = JSON.parse(fs.readFileSync(file));
  check(plan.ticket === ticket && plan.id === id && JSON.stringify(plan.inputs) === JSON.stringify(s.inputs) && plan.prompt === s.prompt, 'Concept plan changed');
  return s;
}
export function conceptPlan(root, id, environment) {
  const s = conceptSnapshot(root, id, environment), target = directory(root, id, s.ticket);
  const result = { schema: 1, id, ticket: s.ticket, state: 'awaiting-generation', purpose: 'review-only', generator: s.c.generator, prompt: s.prompt, imageReferences: s.c.imageReferences, inputs: s.inputs, output: s.c.output,
    execution: 'Agent hands this exact prompt and references to the built-in tool, then saves its PNG and generation receipt. The harness itself makes no API call.',
    automaticApproval: false, productionEligible: false };
  fs.mkdirSync(target, { recursive: true });
  const file = inside(root, `builds/design/concepts/${id}/${s.ticket}/plan.json`);
  if (fs.existsSync(file)) check(fs.readFileSync(file, 'utf8') === `${JSON.stringify(result, null, 2)}\n`, 'Existing concept plan changed');
  else writeJSON(target, 'plan.json', result, true);
  return { ...result, directory: target };
}
function imageMetadata(root, c, environment) {
  const bytes = read(root, c.output);
  check(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Concept is not PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), a = c.constraints;
  check(width >= a.minWidth && height >= a.minHeight && width <= a.maxEdge && height <= a.maxEdge && width * height <= a.maxPixels && width / height >= a.minAspect && width / height <= a.maxAspect, 'Concept dimensions/aspect outside planned limits');
  return inspect(environment.tools.imagemagick.binary, root, c.output, { id: c.id, width, height, alpha: a.alpha, maxColors: 16777216 });
}
function receipt(root, c, ticket, inputs, metadata) {
  const name = `design/concepts/${c.id}.receipt.json`, bytes = read(root, name), r = JSON.parse(bytes);
  check(r.schema === 1 && r.id === c.id && r.ticket === ticket && r.promptSha256 === inputs.files[c.prompt] && r.imageSha256 === metadata.sha256, 'Receipt must match planned prompt, ticket and image hash');
  check(r.generator === c.generator && r.mode === 'built-in-tool' && r.ai === true && r.reproducible === false && r.productionApproved === false, 'AI provenance/mode must be truthful and review-only');
  check(text(r.toolOutputFile) && text(r.createdAt) && text(r.note), 'Generation receipt details required');
  return { name, bytes, value: r, sha256: hash(bytes) };
}
export function conceptImport(root, id, ticket, environment) {
  const s = planned(root, id, ticket, environment), metadata = imageMetadata(root, s.c, environment), r = receipt(root, s.c, ticket, s.inputs, metadata);
  const parent = directory(root, id, ticket), candidate = inside(root, `builds/design/concepts/${id}/${ticket}/candidates/${metadata.sha256}`);
  if (fs.existsSync(candidate)) return { ...conceptVerify(root, id, ticket, environment), cached: true };
  const stage = inside(root, `builds/design/concepts/${id}/${ticket}/.partial-${crypto.randomUUID()}`);
  fs.mkdirSync(stage);
  write(stage, 'candidate.png', read(root, s.c.output), true);
  write(stage, 'generation-receipt.json', r.bytes, true);
  for (const name of Object.keys(s.inputs.files)) write(stage, `inputs/${name}`, read(root, name), true);
  const files = inventory(stage);
  const report = { schema: 1, id, ticket, inputs: s.inputs, files, image: metadata, receiptSha256: r.sha256, technical: 'passed', visual: 'pending-user-review', historicalAccuracy: 'not-certified', productionEligible: false, nativeLayeredSource: false, reviewCriteria: s.c.reviewCriteria };
  report.digest = hash(JSON.stringify(report));
  writeJSON(stage, 'report.json', report, true);
  check(conceptSnapshot(root, id, environment).ticket === ticket && hash(read(root, s.c.output)) === metadata.sha256 && hash(read(root, r.name)) === r.sha256, 'Inputs changed during concept import');
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  fs.renameSync(stage, candidate);
  return { id, ticket, directory: candidate, image: metadata, digest: report.digest, technical: report.technical, visual: report.visual, productionEligible: false, cached: false };
}
export function conceptVerify(root, id, ticket, environment) {
  const s = planned(root, id, ticket, environment), metadata = imageMetadata(root, s.c, environment), r = receipt(root, s.c, ticket, s.inputs, metadata);
  directory(root, id, ticket);
  const relativeTarget = `builds/design/concepts/${id}/${ticket}/candidates/${metadata.sha256}`;
  const target = inside(root, relativeTarget);
  const report = JSON.parse(read(root, `${relativeTarget}/report.json`)), files = inventory(target);
  delete files['report.json'];
  check(JSON.stringify(files) === JSON.stringify(report.files), 'Concept candidate files changed');
  check(JSON.stringify(report.inputs) === JSON.stringify(s.inputs) && report.receiptSha256 === r.sha256 && report.image.sha256 === metadata.sha256, 'Concept provenance changed');
  const { digest, ...body } = report;
  check(digest === hash(JSON.stringify(body)) && report.id === id && report.ticket === ticket && report.productionEligible === false && report.visual === 'pending-user-review', 'Concept report changed');
  return { id, ticket, digest, directory: target, technical: 'passed', visual: 'pending-user-review', productionEligible: false };
}
export function conceptRun(command, root, id, options, environment) {
  if (command === 'concept-plan') return conceptPlan(root, id, environment);
  if (command === 'concept-import') return conceptImport(root, id, options.ticket, environment);
  if (command === 'concept-verify') return conceptVerify(root, id, options.ticket, environment);
  throw new Error('Unknown concept command');
}
