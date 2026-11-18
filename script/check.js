// Comprueba la sintaxis de TODOS los .js del proyecto (src, test, test-support, scripts).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La raíz del proyecto se calcula desde la ubicación de este archivo: funciona desde cualquier directorio.
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const roots = ['src', 'test', 'test-support', 'scripts'].map(r => join(projectRoot, r));
const files = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|mjs|cjs)$/.test(name)) files.push(full);
  }
};
for (const r of roots) { try { walk(r); } catch (e) { if (e.code !== 'ENOENT') throw e; } }

let failed = 0;
for (const f of files.sort()) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error(`FALLO ${f}\n${r.stderr}`); }
}
console.log(`${files.length - failed}/${files.length} archivos JavaScript con sintaxis correcta`);
process.exit(failed ? 1 : 0);
