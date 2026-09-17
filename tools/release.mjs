import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { inventory, hash, writeJSON, check } from '../core/files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
check(/^\d+\.\d+\.\d+$/.test(version), 'Semver version required');
const target = path.join(root, 'releases', version);
check(!fs.existsSync(target), 'Immutable release exists. Bump version, do not overwrite.');
fs.mkdirSync(path.dirname(target), { recursive: true });
const stage = path.join(root, 'releases', `.partial-${crypto.randomUUID()}`);
fs.mkdirSync(stage);
for (const item of ['core', 'adapters', 'bin', 'package.json']) fs.cpSync(path.join(root, item), path.join(stage, item), { recursive: true, filter: name => !['.godot'].includes(path.basename(name)) && !name.endsWith('.uid') });
const manifest = { schema: 1, version, files: inventory(stage) };
writeJSON(stage, 'release.json', manifest, true);
fs.renameSync(stage, target);
process.stdout.write(`${JSON.stringify({ version, manifestSha256: hash(fs.readFileSync(path.join(target, 'release.json'))) }, null, 2)}\n`);
