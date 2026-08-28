import * as vscode from 'vscode';
import { SessionCard } from '../claude/model';
import { statusBarText, statusBarTooltip } from './render';

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);

  update(cards: SessionCard[]): void {
    const text = statusBarText(cards);
    if (!text) {
      this.item.hide();
      return;
    }
    this.item.text = text;
    this.item.tooltip = new vscode.MarkdownString(statusBarTooltip(cards, Date.now()));
    this.item.command = 'claudeSessionHud.sessions.focus';
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
