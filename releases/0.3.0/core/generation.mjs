// Evidence validation only. Never invokes generators, billing, downloads or APIs.
import fs from 'node:fs';
import { check, relative, read, hash, inside } from './files.mjs';

const text = x => typeof x === 'string' && x.trim().length > 0;
const sha = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
function binding(value, prefix) {
  check(value && typeof value.path === 'string', 'Generation evidence binding required');
  relative(value.path);
  check(value.path.startsWith(prefix) && sha(value.sha256), `Generation evidence must be a hashed ${prefix} file`);
  return value;
}
function cost(value) {
  check(value && ['free-local', 'included-no-extra-charge'].includes(value.status) && value.paid === false && value.reviewed === true,
    'Free-tool cost review required; paid/unknown costs are forbidden');
  check(text(value.checkedBy) && text(value.checkedAt) && Number.isFinite(Date.parse(value.checkedAt)), 'Cost reviewer and date required');
  binding(value.evidence, 'design/decisions/');
}
export function validateGeneration(asset) {
  const g = asset.provenance.generation;
  check(g?.schema === 1 && text(g.generator) && ['built-in-tool', 'local-tool'].includes(g.mode), 'AI generation record and supported tool mode required');
  binding(g.original, 'art/source/'); check(g.original.path.endsWith('.png'), 'Original AI output must be PNG');
  binding(g.prompt, 'design/prompts/'); binding(g.receipt, 'design/');
  binding(g.authorization, 'design/decisions/'); binding(g.rights, 'design/reviews/'); binding(g.processing, 'design/');
  check(g.receipt.path.endsWith('.json') && g.processing.path.endsWith('.json'), 'Generation receipt/processing must be JSON');
  check(Array.isArray(g.references) && g.references.length <= 16, 'Up to 16 generation references allowed');
  g.references.forEach(ref => binding(ref, 'design/'));
  cost(g.cost);
  check(['flat-png', 'layered-document'].includes(asset.sourceFormat), 'Explicit AI sourceFormat required');
  check(asset.sourceFormat === 'flat-png' ? asset.editable.endsWith('.png') : /\.(kra|pxo|ora|xcf)$/.test(asset.editable),
    'Source format must describe the real working original, not a renamed generated PNG');
}

// Called by plan/build/verify. Every transitive file joins the immutable run snapshot.
export function generationFiles(root, asset) {
  if (!asset.provenance.ai) return [];
  validateGeneration(asset);
  const g = asset.provenance.generation, files = new Set();
  const evidence = (b, nonempty = false) => {
    const bytes = read(root, b.path);
    check(hash(bytes) === b.sha256, `Generation evidence hash mismatch: ${b.path}`);
    if (nonempty) check(bytes.toString('utf8').trim().length >= 20, `Meaningful evidence required: ${b.path}`);
    files.add(b.path); return bytes;
  };
  evidence(g.original); evidence(g.prompt, true); evidence(g.authorization, true); evidence(g.rights, true); evidence(g.cost.evidence, true);
  g.references.forEach(ref => evidence(ref));
  const receipt = JSON.parse(evidence(g.receipt));
  check(receipt.schema === 1 && receipt.ai === true && receipt.generator === g.generator && receipt.mode === g.mode &&
    receipt.imageSha256 === g.original.sha256 && receipt.promptSha256 === g.prompt.sha256 && receipt.productionApproved === false,
    'Generation receipt must match AI source/prompt/tool, without claiming production approval');
  check(text(receipt.toolOutputFile) && text(receipt.createdAt) && text(receipt.note), 'Actual generation receipt details required');
  const processing = JSON.parse(evidence(g.processing));
  check(processing.schema === 1 && processing.ai === true && processing.inputSha256 === g.original.sha256 &&
    processing.outputSha256 === hash(read(root, asset.source)) && processing.editableSha256 === hash(read(root, asset.editable)),
    'Processing record must bind original, final PNG and working source; AI attribution must remain true');
  check(Array.isArray(processing.steps) && processing.steps.length > 0 && processing.steps.length <= 32, '1..32 explicit processing steps required (including unchanged export)');
  for (const step of processing.steps) {
    check(text(step.tool) && text(step.operation), 'Processing tool and operation required');
    cost(step.cost); evidence(step.cost.evidence, true);
  }
  if (asset.sourceFormat === 'layered-document') {
    check(!read(root, asset.editable).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'A flat PNG cannot masquerade as a layered document');
  }
  return [...files];
}

// Catch accidental reclassification of bytes already recorded as AI in this project.
// Not an AI detector or protection against a user rewriting/deleting all local history.
export function checkKnownAI(root, assets) {
  const candidates = assets.filter(a => !a.provenance.ai);
  if (!candidates.length) return;
  const known = new Set();
  for (const a of assets.filter(a => a.provenance.ai)) {
    known.add(a.provenance.generation.original.sha256);
    for (const name of new Set([a.source, a.editable])) if (fs.existsSync(inside(root, name))) known.add(hash(read(root, name)));
  }
  const entries = name => {
    const dir = inside(root, name);
    if (!fs.existsSync(dir)) return [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    check(items.length <= 4096, 'AI history exceeds scan budget; review/archive explicitly');
    return items;
  };
  for (const entry of entries('design/concepts')) {
    if (!entry.name.endsWith('.receipt.json')) continue;
    const r = JSON.parse(read(root, `design/concepts/${entry.name}`));
    if (r.ai === true && sha(r.imageSha256)) known.add(r.imageSha256);
  }
  for (const entry of entries('builds/design/runs')) {
    if (!/^[0-9a-f]{64}$/.test(entry.name)) continue;
    const m = JSON.parse(read(root, `builds/design/runs/${entry.name}/pack/manifest.json`));
    for (const a of m.assets ?? []) if (a.provenance?.ai === true) {
      if (sha(a.sha256)) known.add(a.sha256);
      if (sha(a.provenance.generation?.original?.sha256)) known.add(a.provenance.generation.original.sha256);
    }
  }
  for (const a of candidates) for (const name of new Set([a.source, a.editable])) {
    if (fs.existsSync(inside(root, name))) check(!known.has(hash(read(root, name))), `Known AI source cannot be declared non-AI: ${name}`);
  }
}
