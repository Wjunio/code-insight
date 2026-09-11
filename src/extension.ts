import * as vscode from 'vscode';
import { registerCommands } from './commands/analyze-project';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Code Insight');
  context.subscriptions.push(output);
  registerCommands(context, output);
}
