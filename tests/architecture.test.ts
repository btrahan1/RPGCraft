import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces that src/sim stays a pure, host-agnostic simulation core.
// It must never import Three.js, DOM layers, or use nondeterministic globals.
// If this test is green, the sim can run in Node, browser, or any future env.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const simRoot = join(repoRoot, 'src', 'sim');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

// Strip comments so prose mentioning Math.random doesn't false-positive.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function forbiddenImport(spec: string): string | null {
  if (spec === 'three' || spec.startsWith('three/')) return 'three';
  const layer = spec.match(/(?:^|\/)(render|ui|game)\//);
  return layer ? layer[1] : null;
}

const IMPORT_RE = /\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
const DYN_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DOM_GLOBAL_RE = /\b(document|window|navigator|localStorage|sessionStorage)\s*[.[]/;
const NONDETERMINISM_RE = /\b(Math\.random|Date\.now|performance\.now)\b/;

const simFiles = walk(simRoot);

function scanLines(re: RegExp): string[] {
  const violations: string[] = [];
  for (const file of simFiles) {
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (re.test(line)) violations.push(`${relative(repoRoot, file)}:${i + 1}  ${line.trim()}`);
    });
  }
  return violations;
}

describe('src/sim architecture invariants', () => {
  it('finds the sim source tree', () => {
    expect(simFiles.length).toBeGreaterThan(0);
  });

  it('imports nothing from render/ui/game or three', () => {
    const violations: string[] = [];
    for (const file of simFiles) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const specs: string[] = [];
      for (const m of src.matchAll(IMPORT_RE)) specs.push(m[1]);
      for (const m of src.matchAll(DYN_IMPORT_RE)) specs.push(m[1]);
      for (const spec of specs) {
        const bad = forbiddenImport(spec);
        if (bad) violations.push(`${relative(repoRoot, file)} imports '${spec}' (${bad})`);
      }
    }
    expect(violations, `src/sim must stay host-agnostic:\n${violations.join('\n')}`).toEqual([]);
  });

  it('touches no DOM or browser globals', () => {
    const violations = scanLines(DOM_GLOBAL_RE);
    expect(violations, `src/sim must run headless (no DOM globals):\n${violations.join('\n')}`).toEqual([]);
  });

  it('uses no nondeterministic globals (Math.random, Date.now, performance.now)', () => {
    const violations = scanLines(NONDETERMINISM_RE);
    expect(violations, `sim randomness must go through a seeded RNG:\n${violations.join('\n')}`).toEqual([]);
  });
});
