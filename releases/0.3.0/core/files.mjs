import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const hash = data => crypto.createHash('sha256').update(data).digest('hex');
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function check(value, message) { if (!value) throw new Error(message); }
export function relative(value) {
  check(typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0'), 'Invalid relative path');
  check(!path.isAbsolute(value) && value.split('/').every(p => p && p !== '.' && p !== '..' && !p.includes(':')), `Unsafe path: ${value}`);
  return value;
}
export function inside(root, name) {
  relative(name);
  const base = fs.realpathSync(root);
  let current = base;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) || (() => { try { return fs.lstatSync(current).isSymbolicLink(); } catch { return false; } })()) {
      check(!fs.lstatSync(current).isSymbolicLink(), `Symlink refused: ${name}`);
    }
  }
  return current;
}
export function read(root, name) {
  const file = inside(root, name);
  check(fs.statSync(file).isFile(), `Not a regular file: ${name}`);
  check(fs.statSync(file).size <= 32 * 1024 * 1024, `File exceeds 32 MiB: ${name}`);
  return fs.readFileSync(file);
}
export function write(root, name, data, exclusive = false) {
  const file = inside(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exclusive) { fs.writeFileSync(file, data, { flag: 'wx' }); return; }
  // Atomic replacement only for harness-owned metadata, never artist sources.
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  fs.renameSync(tmp, file);
}
export const writeJSON = (root, name, data, exclusive = false) => write(root, name, `${JSON.stringify(data, null, 2)}\n`, exclusive);
export function inventory(root) {
  const result = {};
  const visit = (dir, prefix = '') => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      check(!item.isSymbolicLink(), 'Release/pack symlinks are forbidden');
      const name = prefix + item.name;
      if (item.isDirectory()) visit(path.join(dir, item.name), `${name}/`);
      else { check(item.isFile(), 'Non-regular release/pack file'); result[name] = hash(fs.readFileSync(path.join(dir, item.name))); }
    }
  };
  visit(root);
  return result;
}
