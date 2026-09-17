import { run } from '../core/pipeline.mjs';

try {
  const args = process.argv.slice(2), command = args.shift(), options = {};
  let id;
  while (args.length) {
    const token = args.shift();
    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (!['project', 'magick', 'godot', 'reviewer', 'note', 'evidence'].includes(key) || options[key] !== undefined || !args.length) throw new Error(`Invalid option: ${token}`);
      options[key] = args.shift();
    } else if (id === undefined) id = token;
    else throw new Error('Unexpected argument');
  }
  if (!options.project) throw new Error('--project <absolute game root> required');
  const result = run(command, options.project, options, id);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`Design harness: ${error.message}\n`);
  process.exitCode = 1;
}
