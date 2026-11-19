// 1) Sintaxis de TODOS los .js del proyecto. 2) Detecta archivos que faltan: toda importación relativa debe existir.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// La raíz se calcula desde la ubicación de este archivo: funciona desde cualquier directorio.
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'test', 'scripts'].map(r => join(projectRoot, r));
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
  if (r.status !== 0) { failed++; console.error(`FALLO de sintaxis: ${relative(projectRoot, f)}\n${r.stderr}`); }
}

const missing = [];
const importRe = /(?:from\s+|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(importRe)) {
    const target = resolve(dirname(f), m[1]);
    if (!existsSync(target)) missing.push(`${relative(projectRoot, target)}   (lo importa ${relative(projectRoot, f)})`);
  }
}
if (missing.length) {
  console.error('\nFALTAN ARCHIVOS en el proyecto (probablemente no se subieron al copiar el ZIP):');
  for (const m of [...new Set(missing)].sort()) console.error(`  ✖ ${m}`);
  console.error('Copiá el ZIP completo respetando todas las subcarpetas (src, test, scripts, docs).');
}
console.log(`${files.length - failed}/${files.length} archivos JavaScript con sintaxis correcta`);
process.exit(failed || missing.length ? 1 : 0);
