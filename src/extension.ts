import * as vscode from 'vscode';
import { SessionMonitor } from './claude/monitor';
import { SessionsViewProvider } from './ui/sessionsView';
import { StatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SessionsViewProvider();
  const statusBar = new StatusBar();
  const monitor = new SessionMonitor({
    folders: () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
    onSnapshot: (cards) => {
      try {
        statusBar.update(cards);
      } catch {
        // status bar surface failed: keep the webview update independent
      }
      try {
        provider.update(cards);
      } catch {
        // webview may be disposed/unavailable: keep the status bar update independent
      }
    },
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SessionsViewProvider.viewId, provider),
    statusBar,
    vscode.commands.registerCommand('claudeSessionHud.refresh', () => void monitor.refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void monitor.refresh()),
    { dispose: () => monitor.stop() },
  );
  monitor.start();
}

export function deactivate(): void {}
