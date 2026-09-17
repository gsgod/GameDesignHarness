// Project-local launcher. The game itself never imports this tool.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (value, message) => { if (!value) throw new Error(message); };
try {
  const project = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const lockFile = path.join(project, 'design/harness.lock.json');
  check(!fs.lstatSync(lockFile).isSymbolicLink(), 'Lock must not be a symlink');
  const lock = JSON.parse(fs.readFileSync(lockFile));
  check(lock.schema === 1 && /^\d+\.\d+\.\d+$/.test(lock.version) && /^[0-9a-f]{64}$/.test(lock.manifestSha256), 'Invalid release lock');
  const parent = path.resolve(project, '..', 'GameDesignHarness');
  const release = path.join(parent, 'releases', lock.version);
  for (const p of [parent, path.join(parent, 'releases'), release]) check(!fs.lstatSync(p).isSymbolicLink(), 'Harness release symlink refused');
  const manifestFile = path.join(release, 'release.json');
  check(!fs.lstatSync(manifestFile).isSymbolicLink(), 'Manifest symlink refused');
  const bytes = fs.readFileSync(manifestFile);
  check(hash(bytes) === lock.manifestSha256, 'Release manifest changed; refusing execution');
  const manifest = JSON.parse(bytes), actual = {};
  check(manifest.schema === 1 && manifest.version === lock.version, 'Release version mismatch');
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      check(!entry.isSymbolicLink(), 'Release file symlink refused');
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(directory, entry.name), `${name}/`);
      else {
        check(entry.isFile(), 'Release entry is not a file');
        if (name !== 'release.json') actual[name] = hash(fs.readFileSync(path.join(directory, entry.name)));
      }
    }
  }
  visit(release);
  check(Object.keys(actual).length === Object.keys(manifest.files).length && Object.entries(actual).every(([name, digest]) => manifest.files[name] === digest), 'Release contents changed; refusing execution');
  const args = process.argv.slice(2);
  check(!args.some(a => a === '--project' || a.startsWith('--project=')), 'Launcher fixes the project root');
  const result = spawnSync(process.execPath, [path.join(release, 'bin/design.mjs'), ...args, '--project', project], { stdio: 'inherit', shell: false, timeout: 300000 });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`Design launcher: ${error.message}\n`);
  process.exitCode = 1;
}
