import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inventory, write, writeJSON, hash } from '../core/files.mjs';

const home = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'design-pin-test-'));
  const project = path.join(base, 'ExampleGame'), release = path.join(base, 'GameDesignHarness/releases/0.1.0');
  fs.mkdirSync(project); fs.mkdirSync(release, { recursive: true });
  write(release, 'bin/design.mjs', 'console.log("pinned-fixture-executed")');
  writeJSON(release, 'release.json', { schema: 1, version: '0.1.0', files: inventory(release) });
  writeJSON(project, 'design/harness.lock.json', { schema: 1, version: '0.1.0', manifestSha256: hash(fs.readFileSync(path.join(release, 'release.json'))) });
  write(project, 'tools/design.mjs', fs.readFileSync(path.join(home, 'templates/design.mjs')));
  const run = (...args) => spawnSync(process.execPath, [path.join(project, 'tools/design.mjs'), ...args], { encoding: 'utf8' });
  return { project, release, run };
}
test('launcher executes only pinned release', () => { const f = fixture(); assert.equal(f.run('plan').status, 0); });
test('edited release code rejected', () => { const f = fixture(); write(f.release, 'bin/design.mjs', 'throw Error("tampered")'); assert.match(f.run('plan').stderr, /contents changed/); });
test('extra executable rejected', () => { const f = fixture(); write(f.release, 'extra.mjs', 'bad'); assert.equal(f.run().status, 1); });
test('manifest changed rejected', () => { const f = fixture(); fs.appendFileSync(path.join(f.release, 'release.json'), ' '); assert.match(f.run().stderr, /manifest changed/); });
test('project redirect rejected', () => { const f = fixture(); assert.match(f.run('--project', '/tmp').stderr, /fixes the project/); });
test('symlink executable rejected', () => { const f = fixture(); fs.renameSync(path.join(f.release, 'bin/design.mjs'), path.join(f.project, 'original.mjs')); fs.symlinkSync(path.join(f.project, 'original.mjs'), path.join(f.release, 'bin/design.mjs')); assert.match(f.run().stderr, /symlink refused/); });
