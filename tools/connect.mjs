import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, hash, inventory, inside, write, writeJSON } from '../core/files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [projectArg, version] = process.argv.slice(2);
check(projectArg && /^\d+\.\d+\.\d+$/.test(version), 'Usage: node tools/connect.mjs <existing-game-root> <version>');
const project = fs.realpathSync(projectArg), release = inside(root, `releases/${version}`);
check(path.resolve(project, '..', 'GameDesignHarness') === root, 'Game and GameDesignHarness must be sibling folders');
const bytes = fs.readFileSync(path.join(release, 'release.json')), manifest = JSON.parse(bytes), actual = inventory(release);
delete actual['release.json'];
check(manifest.version === version && JSON.stringify(actual) === JSON.stringify(manifest.files), 'Release integrity check failed');
for (const file of ['tools/design.mjs', 'design/harness.lock.json']) check(!fs.existsSync(inside(project, file)), `Exists; explicit migration required: ${file}`);
write(project, 'tools/design.mjs', fs.readFileSync(path.join(root, 'templates/design.mjs')), true);
writeJSON(project, 'design/harness.lock.json', { schema: 1, version, manifestSha256: hash(bytes) }, true);
process.stdout.write(`Connected ${project} to local release ${version}. No requirements or artwork overwritten.\n`);
