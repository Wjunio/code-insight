import * as vscode from 'vscode';
import { mappingsToRules, parseRuleConfig } from '../analyzers/rules/rule-config';
import type { MigrationRule } from '../analyzers/rules/rule-types';

/** Root configuration is authoritative, including an intentionally empty rule list. */
export async function readRuleConfiguration(folder: vscode.WorkspaceFolder): Promise<MigrationRule[]> {
  const uri = vscode.Uri.joinPath(folder.uri, '.code-insight.json');
  const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
  if (open) {
    const text = open.getText();
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('.code-insight.json excede 1 MB.');
    return parseRuleConfig(text);
  }
  let text: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > 1024 * 1024) throw new Error('.code-insight.json excede 1 MB.');
    text = Buffer.from(bytes).toString('utf8');
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
      return mappingsToRules(vscode.workspace.getConfiguration('codeInsight', folder.uri).get<unknown>('componentMappings', {}));
    }
    throw error;
  }
  return parseRuleConfig(text);
}
