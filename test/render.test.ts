import { describe, it, expect } from 'vitest';
import {
  escapeHtml, truncate, formatRelativeTime,
  statusBarText, statusBarTooltip, renderSessionsHtml,
} from '../src/ui/render';
import { SessionCard } from '../src/claude/model';

const card = (over: Partial<SessionCard> = {}): SessionCard => ({
  sessionId: 'sid-1', pid: 1, cwd: '/w/webapp',
  title: 'Corrige paginação do PDF', goal: 'abre um PR com essa correção', lastAction: 'Rodou os testes',
  lastActivityMs: 0, ...over,
});

describe('escapeHtml', () => {
  it('escapes html-sensitive chars', () => {
    expect(escapeHtml(`<b>&"'`)).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });
});

describe('truncate', () => {
  it('keeps short strings and truncates long ones with ellipsis', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdef', 5)).toBe('abcd…');
  });
});

describe('formatRelativeTime (pt-BR)', () => {
  const now = 1_000_000_000_000;
  it.each([
    [now - 30_000, 'agora'],
    [now - 5 * 60_000, 'há 5 min'],
    [now - 3 * 3_600_000, 'há 3 h'],
    [now - 30 * 3_600_000, 'ontem'],
    [now - 3 * 86_400_000, 'há 3 d'],
  ])('formats %d as %s', (then, expected) => {
    expect(formatRelativeTime(then as number, now)).toBe(expected);
  });
});

describe('statusBarText', () => {
  it('is empty with no sessions', () => {
    expect(statusBarText([])).toBe('');
  });
  it('shows the single session title', () => {
    expect(statusBarText([card()])).toBe('$(sparkle) Corrige paginação do PDF');
  });
  it('shows the count for multiple sessions', () => {
    expect(statusBarText([card(), card({ sessionId: 'sid-2' })])).toBe('$(sparkle) 2 sessões Claude');
  });
});

describe('statusBarTooltip', () => {
  it('lists every session title', () => {
    const tip = statusBarTooltip([card(), card({ sessionId: 's2', title: 'Outro trabalho' })], 0);
    expect(tip).toContain('Corrige paginação do PDF');
    expect(tip).toContain('Outro trabalho');
  });
  it('includes Pedido: and Agora: labels when goal/lastAction are present', () => {
    const tip = statusBarTooltip([card({ goal: 'PR 27769 — corrige paginação', lastAction: 'Testes passaram' })], 0);
    expect(tip).toContain('Pedido:');
    expect(tip).toContain('PR 27769 — corrige paginação');
    expect(tip).toContain('Agora:');
    expect(tip).toContain('Testes passaram');
  });
  it('omits Pedido:/Agora: lines when both are empty', () => {
    const tip = statusBarTooltip([card({ goal: '', lastAction: '' })], 0);
    expect(tip).not.toContain('Pedido:');
    expect(tip).not.toContain('Agora:');
  });
});

describe('renderSessionsHtml', () => {
  it('renders title, goal and lastAction with labels, escaped', () => {
    const html = renderSessionsHtml(
      [card({ title: '<script>x</script>', goal: 'a & b', lastAction: 'c & d' })],
      60_000,
    );
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('c &amp; d');
    expect(html).toContain('Pedido');
    expect(html).toContain('Agora');
    expect(html).toContain('há 1 min');
    expect(html).toContain('webapp'); // basename do cwd
  });
  it('renders the empty state', () => {
    expect(renderSessionsHtml([], 0)).toContain('Nenhuma sessão Claude ativa nesta janela');
  });
  it('renders only title + meta, with no dangling label, when goal and lastAction are both empty', () => {
    const html = renderSessionsHtml([card({ goal: '', lastAction: '' })], 60_000);
    expect(html).not.toContain('Pedido');
    expect(html).not.toContain('Agora');
  });
  it('truncates goal and lastAction at 120 chars', () => {
    const long = 'x'.repeat(200);
    const html = renderSessionsHtml([card({ goal: long, lastAction: long })], 60_000);
    expect(html).toContain('x'.repeat(119) + '…');
  });
});
