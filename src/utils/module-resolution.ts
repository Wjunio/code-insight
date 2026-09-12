import ts from 'typescript';
import { posix } from 'node:path';
import type { SourceFile } from '../reports/report-types';

/** Snapshot-only resolution. Never reads the host filesystem or package scripts. */
export function createModuleResolver(files: SourceFile[], usePaths = false): (name: string, containingFile: string) => string | undefined {
  const paths = new Set(files.map(f => `/project/${f.path}`));
  const configurations = usePaths ? files.filter(f => /^tsconfig(?:\.[^/]*)?\.json$/.test(posix.basename(f.path))).map(f => {
    const parsed = ts.parseConfigFileTextToJson(f.path, f.content);
    const options = parsed.error ? undefined : parsed.config?.compilerOptions;
    return { directory: `/project/${posix.dirname(f.path)}`, options };
  }) : [];
  const find = (base: string): string | undefined => {
    base = posix.normalize(base).replace(/\.js$/, '');
    return [base, `${base}.ts`, `${base}/index.ts`].find(p => paths.has(p));
  };
  return (name, containingFile) => {
    if (name.startsWith('.')) return find(posix.resolve(posix.dirname(containingFile), name));
    const configs = configurations.filter(c => containingFile.startsWith(`${posix.normalize(c.directory)}/`)).sort((a, b) => b.directory.length - a.directory.length);
    const nearest = configs[0]?.directory;
    const matches = new Set<string>();
    for (const config of configs.filter(c => c.directory === nearest)) {
      const options: unknown = config.options;
      if (!options || typeof options !== 'object') continue;
      const { baseUrl, paths: aliases } = options as { baseUrl?: unknown; paths?: unknown };
      const base = posix.resolve(config.directory, typeof baseUrl === 'string' ? baseUrl : '.');
      if (aliases && typeof aliases === 'object') for (const [alias, targets] of Object.entries(aliases)) {
        const parts = alias.split('*');
        if (parts.length > 2 || !Array.isArray(targets)) continue;
        const suffix = parts[1] ?? '';
        if (parts.length === 1 ? name !== alias : !name.startsWith(parts[0]!) || !name.endsWith(suffix)) continue;
        const middle = parts.length === 1 ? '' : name.slice(parts[0]!.length, suffix ? -suffix.length : undefined);
        for (const target of targets) if (typeof target === 'string') {
          const resolved = find(posix.resolve(base, target.replace('*', middle)));
          if (resolved) { matches.add(resolved); break; }
        }
      }
      if (!matches.size && typeof baseUrl === 'string') { const resolved = find(posix.resolve(base, name)); if (resolved) matches.add(resolved); }
    }
    return matches.size === 1 ? [...matches][0] : undefined;
  };
}
