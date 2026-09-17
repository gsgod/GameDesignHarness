import { check, relative } from './files.mjs';
import { validateGeneration } from './generation.mjs';

const id = x => typeof x === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const size = x => Number.isInteger(x) && x > 0 && x <= 4096;
export function validate(c) {
  check(c?.schema === 1 && id(c.project) && id(c.pack), 'schema=1 and safe project/pack IDs required');
  check(c.profile === 'pixel-2d' && ['none', 'godot-4'].includes(c.engine), 'Unsupported profile/engine (v0.1: pixel-2d, none/godot-4)');
  check(c.policy?.network === false && c.policy?.paidTools === false, 'Harness is offline and free-tool only; network/paid tools forbidden');
  check(typeof c.policy.generativeAI === 'boolean', 'Explicit generativeAI policy required');
  check(text(c.brief) && Array.isArray(c.visualReview) && c.visualReview.length >= 1 && c.visualReview.every(text), 'Brief and human visual review criteria required');
  check(Array.isArray(c.references) && c.references.every(x => { relative(x); return x.startsWith('design/'); }), 'References must be project-local design files');
  check(Array.isArray(c.assets) && c.assets.length > 0 && c.assets.length <= 64, '1..64 assets required');
  const names = new Set();
  for (const a of c.assets) {
    check(id(a.id) && !names.has(a.id), 'Duplicate/invalid asset ID'); names.add(a.id);
    check(size(a.width) && size(a.height) && a.width * a.height <= 4194304, `Size exceeds bounds: ${a.id}`);
    check(['opaque', 'transparent', 'any'].includes(a.alpha), `Invalid alpha requirement: ${a.id}`);
    check(Number.isInteger(a.maxColors) && a.maxColors >= 1 && a.maxColors <= 16777216, 'maxColors required');
    for (const source of [a.source, a.editable]) { relative(source); check(source.startsWith('art/source/'), 'Sources must be under art/source/'); }
    check(a.source.endsWith('.png'), 'Export source must be PNG');
    check(text(a.purpose) && text(a.authoring), 'Asset purpose and authoring instructions required');
    const p = a.provenance;
    check(p && ['original', 'licensed', 'pending'].includes(p.kind) && text(p.creator) && text(p.license) && text(p.source) && typeof p.ai === 'boolean', 'Provenance fields required');
    check(typeof p.reviewed === 'boolean', 'Provenance reviewed must be explicit');
    if (p.ai) {
      check(c.policy.generativeAI === true, 'AI production requires explicit generativeAI permission');
      validateGeneration(a);
    } else check(p.generation === undefined, 'Do not erase AI attribution while retaining generation evidence');
    if (a.grid) check(size(a.grid.width) && size(a.grid.height) && a.width % a.grid.width === 0 && a.height % a.grid.height === 0, 'Invalid sprite grid');
    if (a.palette) check(Array.isArray(a.palette) && a.palette.length > 0 && a.palette.every(x => /^#[0-9a-fA-F]{6}$/.test(x)), 'Invalid palette');
  }
  return c;
}
