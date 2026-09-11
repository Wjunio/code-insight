const excludedDirectories = new Set(['node_modules', 'dist', 'out', 'build', 'coverage', '.git', '.vscode', '.angular', '.code-insight']);

export function isInAnalysisScope(path: string): boolean {
  const parts = path.replace(/\\/g, '/').split('/');
  return !parts.slice(0, -1).some(part => excludedDirectories.has(part)) && !/\.(?:d|spec|test)\.tsx?$/.test(path);
}
