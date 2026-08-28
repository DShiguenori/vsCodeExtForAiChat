import * as path from 'path';
import { SessionCard } from '../claude/model';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

export function formatRelativeTime(thenMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - thenMs);
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `há ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 172_800_000) return 'ontem';
  return `há ${Math.floor(diff / 86_400_000)} d`;
}

export function statusBarText(cards: SessionCard[]): string {
  if (cards.length === 0) return '';
  if (cards.length === 1) return `$(sparkle) ${truncate(cards[0].title, 28)}`;
  return `$(sparkle) ${cards.length} sessões Claude`;
}

export function statusBarTooltip(cards: SessionCard[], nowMs: number): string {
  return cards
    .map((c) =>
      `**${c.title}**\n\n${truncate(c.description, 80)} — _${formatRelativeTime(c.lastActivityMs, nowMs)}_`,
    )
    .join('\n\n---\n\n');
}

export function renderSessionsHtml(cards: SessionCard[], nowMs: number): string {
  const body =
    cards.length === 0
      ? '<p class="empty">Nenhuma sessão Claude ativa nesta janela.</p>'
      : cards
          .map(
            (c) => `
  <div class="card">
    <div class="title">${escapeHtml(c.title)}</div>
    <div class="desc">${escapeHtml(truncate(c.description, 140))}</div>
    <div class="meta">
      <span>${escapeHtml(formatRelativeTime(c.lastActivityMs, nowMs))}</span>
      <span>${escapeHtml(path.basename(c.cwd))}</span>
    </div>
  </div>`,
          )
          .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { padding: 4px 8px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
  .card {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
    border-left: 3px solid var(--vscode-focusBorder);
    border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;
    background: var(--vscode-sideBar-background);
  }
  .title { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
  .desc { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px;
          color: var(--vscode-descriptionForeground); opacity: .8; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
