import * as vscode from 'vscode';
import type { SourceFile } from '../reports/report-types';
import { isInAnalysisScope } from './file-scope';

export async function readWorkspace(folder: vscode.WorkspaceFolder, token: vscode.CancellationToken): Promise<SourceFile[]> {
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, '**/{*.ts,*.html,*.tsx,*.jsx,*.vue,*.svelte,package.json,angular.json}'),
    '**/{node_modules,dist,out,build,coverage,.git,.vscode,.angular,.code-insight}/**', undefined, token);
  const files: SourceFile[] = [];
  let bytes = 0;
  // Bound I/O concurrency and overall snapshot size to avoid exhausting the extension host.
  for (let i = 0; i < uris.length; i += 16) {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    const batch = await Promise.all(uris.slice(i, i + 16).filter(uri => isInAnalysisScope(uri.path.slice(folder.uri.path.replace(/\/$/, '').length + 1))).map(async uri => {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 5 * 1024 * 1024) throw new Error(`Arquivo excede 5 MB: ${uri.path}`);
      const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
      const content = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      const contentBytes = Buffer.byteLength(content);
      if (contentBytes > 5 * 1024 * 1024) throw new Error(`Arquivo excede 5 MB: ${uri.path}`);
      bytes += contentBytes;
      if (bytes > 100 * 1024 * 1024) throw new Error('Workspace excede 100 MB de arquivos analisáveis. Abra uma pasta menor.');
      return { path: uri.path.slice(folder.uri.path.replace(/\/$/, '').length + 1), content };
    }));
    files.push(...batch);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
