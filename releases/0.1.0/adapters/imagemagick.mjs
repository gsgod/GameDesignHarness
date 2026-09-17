import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, hash, read } from '../core/files.mjs';

export function execute(binary, args, options = {}) {
  const r = spawnSync(binary, args, { encoding: 'utf8', timeout: 45000, maxBuffer: 32 * 1024 * 1024, shell: false, ...options });
  check(!r.error && r.status === 0, `Tool failed: ${r.error?.message ?? r.stderr ?? r.status}`);
  return r.stdout;
}
export function tool(binary, versionArgs) {
  check(typeof binary === 'string' && path.isAbsolute(binary), 'Tool path must be absolute');
  const resolved = fs.realpathSync(binary);
  check(fs.statSync(resolved).isFile(), 'Tool must be a regular executable');
  return { binary: resolved, sha256: hash(fs.readFileSync(resolved)), version: execute(resolved, versionArgs).trim().split('\n')[0] };
}
const limits = ['-limit', 'memory', '256MiB', '-limit', 'map', '512MiB', '-limit', 'disk', '512MiB', '-limit', 'thread', '2', '-limit', 'time', '30'];
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let n = value;
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let n = 0xffffffff;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
export function inspect(binary, root, name, asset) {
  const b = read(root, name);
  check(b.length >= 33 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii', 12, 16) === 'IHDR', 'Not PNG');
  check(b.readUInt32BE(16) === asset.width && b.readUInt32BE(20) === asset.height, `Wrong dimensions: ${asset.id}`);
  // Single raster only: refuse animation and unknown critical chunks before decoder invocation.
  let offset = 8, ended = false, data = false;
  while (offset + 12 <= b.length) {
    const length = b.readUInt32BE(offset), type = b.toString('ascii', offset + 4, offset + 8);
    check(offset + 12 + length <= b.length && type !== 'acTL', 'Truncated/animated PNG not supported');
    check(crc32(b.subarray(offset + 4, offset + 8 + length)) === b.readUInt32BE(offset + 8 + length), 'PNG CRC mismatch');
    check(!/^[A-Z]/.test(type) || ['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type), 'Unknown PNG critical chunk');
    data ||= type === 'IDAT'; offset += 12 + length;
    if (type === 'IEND') { ended = true; break; }
  }
  check(ended && data && offset === b.length, 'Incomplete PNG or trailing data');
  const file = path.join(root, name);
  const output = execute(binary, [...limits, `PNG:${file}`, '-format', '%w %h %k %[opaque]', 'info:']).trim().split(/\s+/);
  const [width, height, colors] = output.slice(0, 3).map(Number), opaque = output[3]?.toLowerCase() === 'true';
  check(width === asset.width && height === asset.height && Number.isInteger(colors) && colors <= asset.maxColors, `Dimensions/color budget failed: ${asset.id}`);
  check(asset.alpha !== 'opaque' || opaque, `Opaque required: ${asset.id}`);
  check(asset.alpha !== 'transparent' || !opaque, `Transparent pixel required: ${asset.id}`);
  if (asset.palette) {
    const raw = execute(binary, [...limits, `PNG:${file}`, '-depth', '8', 'RGBA:-'], { encoding: null });
    const allowed = new Set(asset.palette.map(x => x.slice(1).toLowerCase()));
    for (let i = 0; i < raw.length; i += 4) {
      if (raw[i + 3] !== 0) check(allowed.has(raw.subarray(i, i + 3).toString('hex')), `Palette mismatch: ${asset.id}`);
    }
  }
  return { width, height, colors, opaque, sha256: hash(b) };
}
export function contactSheet(binary, files, output) {
  execute(binary, ['montage', ...limits, ...files.map(p => `PNG:${p}`), '-background', '#282b32', '-filter', 'point', '-thumbnail', '256x192', '-gravity', 'center', '-extent', '272x208', '-tile', '4x', '-geometry', '+8+8', `PNG:${output}`]);
}
