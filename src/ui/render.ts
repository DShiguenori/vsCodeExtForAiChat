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
    .map((c) => {
      const lines = [`**${c.title}**`];
      if (c.goal) lines.push(`Pedido: ${truncate(c.goal, 80)}`);
      if (c.lastAction) lines.push(`Agora: ${truncate(c.lastAction, 80)}`);
      lines.push(`_${formatRelativeTime(c.lastActivityMs, nowMs)}_`);
      return lines.join('\n\n');
    })
    .join('\n\n---\n\n');
}

export function renderSessionsHtml(cards: SessionCard[], nowMs: number): string {
  const body =
    cards.length === 0
      ? '<p class="empty">Nenhuma sessão Claude ativa nesta janela.</p>'
      : cards
          .map((c) => {
            const rows: string[] = [];
            if (c.goal) {
              rows.push(
                `    <div class="row"><span class="label">Pedido</span><span class="value">${escapeHtml(truncate(c.goal, 120))}</span></div>`,
              );
            }
            if (c.lastAction) {
              rows.push(
                `    <div class="row"><span class="label">Agora</span><span class="value">${escapeHtml(truncate(c.lastAction, 120))}</span></div>`,
              );
            }
            const rowsHtml = rows.length > 0 ? `\n${rows.join('\n')}` : '';
            return `
  <div class="card">
    <div class="title">${escapeHtml(c.title)}</div>${rowsHtml}
    <div class="meta">
      <span>${escapeHtml(formatRelativeTime(c.lastActivityMs, nowMs))}</span>
      <span>${escapeHtml(path.basename(c.cwd))}</span>
    </div>
  </div>`;
          })
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
  .row { display: flex; gap: 6px; font-size: 12px; margin-top: 2px; }
  .label { flex: 0 0 44px; color: var(--vscode-descriptionForeground); }
  .value { flex: 1 1 auto; min-width: 0; }
  .meta { display: flex; justify-content: space-between; font-size: 11px;
          color: var(--vscode-descriptionForeground); opacity: .8; margin-top: 4px; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
