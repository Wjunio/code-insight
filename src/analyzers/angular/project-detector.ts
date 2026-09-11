import { posix } from 'node:path';
import type { SourceFile } from '../../reports/report-types';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function detectProject(files: SourceFile[], warnings: string[]): { detected: boolean; versions: Record<string, number | null> } {
  let detected = files.some(f => posix.basename(f.path) === 'angular.json');
  const versions: Record<string, number | null> = {};
  for (const file of files.filter(f => posix.basename(f.path) === 'package.json')) {
    try {
      const pkg = record(JSON.parse(file.content));
      const version = record(pkg['dependencies'])['@angular/core'] ?? record(pkg['devDependencies'])['@angular/core'] ?? record(pkg['peerDependencies'])['@angular/core'];
      if (version === undefined) continue;
      detected = true;
      // Only ranges confined to one major are safe for the v19 default change.
      const match = typeof version === 'string' ? /^(?:\^|~)?(\d+)(?:\.(?:\d+|x|\*)){0,2}$/.exec(version.trim()) : null;
      versions[posix.dirname(file.path)] = match?.[1] ? Number(match[1]) : null;
      if (!match) warnings.push(`${file.path}: versão Angular ambígua; standalone implícito será inconclusivo.`);
    } catch { warnings.push(`${file.path}: JSON inválido.`); }
  }
  return { detected, versions };
}
export function versionFor(file: string, versions: Record<string, number | null>): number | null {
  let directory = posix.dirname(file);
  for (;;) {
    if (Object.hasOwn(versions, directory)) return versions[directory] ?? null;
    if (directory === '.') return null;
    directory = posix.dirname(directory);
  }
}
