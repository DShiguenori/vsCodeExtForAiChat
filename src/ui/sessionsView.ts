import * as vscode from 'vscode';
import { SessionCard } from '../claude/model';
import { renderSessionsHtml } from './render';

export class SessionsViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'claudeSessionHud.sessions';

  private view?: vscode.WebviewView;
  private cards: SessionCard[] = [];

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: false };
    view.webview.html = renderSessionsHtml(this.cards, Date.now());
  }

  update(cards: SessionCard[]): void {
    this.cards = cards;
    if (this.view) {
      this.view.webview.html = renderSessionsHtml(cards, Date.now());
      this.view.badge = { value: cards.length, tooltip: `${cards.length} sessões Claude vivas` };
    }
  }
}
