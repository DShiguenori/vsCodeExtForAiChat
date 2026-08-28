# Claude Session HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensão VSCode que mostra, numa view sempre visível + status bar, o título e o último prompt de cada sessão Claude Code viva pertencente à janela atual.

**Architecture:** Camada de dados em Node puro (`src/claude/`: registro de sessões vivas em `~/.claude/sessions/*.json`, parsing do transcript `.jsonl`, monitor com polling 3 s + fs.watch e cache por mtime) totalmente separada da casca VSCode (`src/ui/` + `extension.ts`), que só renderiza `SessionCard[]`. Renderização é função pura testável.

**Tech Stack:** TypeScript estrito, esbuild (bundle), vitest (testes unitários, sem mock de VSCode), @vscode/vsce (empacotamento). Node 20, VSCode engine ^1.90.0.

**Spec:** `docs/superpowers/specs/2026-08-28-claude-session-hud-design.md` (leia antes de qualquer task — contém os formatos de dados reais verificados e as decisões).

## Global Constraints

- Node `>=20`, engine VSCode `^1.90.0`, `@types/vscode` fixado em `1.90.0`.
- A extensão é **somente leitura** sobre `~/.claude` — nenhuma task pode escrever lá.
- Código, identificadores e comentários em **inglês**; textos de UI em **pt-BR**; commits em pt-BR no formato `tipo: descrição` (repo pessoal, sem número de feature ADO).
- Parsing tolerante: linha/arquivo malformado é ignorado silenciosamente, nunca lança.
- Nenhuma dependência de runtime (só devDependencies); nada de rede.
- Todos os testes rodam com `npm test` (vitest) e `npm run typecheck` (tsc --noEmit) — ambos verdes antes de cada commit.
- Fixtures de teste sempre em diretórios temporários (`fs.mkdtempSync(path.join(os.tmpdir(), ...))`), nunca no `~/.claude` real.

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `vitest.config.ts`, `.gitignore`, `.vscode/launch.json`, `src/extension.ts`, `test/smoke.test.ts`

**Interfaces:**
- Consumes: nada (repo contém apenas `docs/`).
- Produces: toolchain que todas as tasks seguintes usam: `npm run build`, `npm run typecheck`, `npm test`, F5 para rodar a extensão.

- [ ] **Step 1: Criar package.json**

```json
{
  "name": "claude-session-hud",
  "displayName": "Claude Session HUD",
  "description": "Mostra título e última atividade das sessões Claude Code vivas desta janela",
  "version": "0.1.0",
  "publisher": "danilouema",
  "private": true,
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {},
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "package": "vsce package --no-dependencies --allow-missing-repository"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/vscode": "1.90.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.23.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Criar tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Criar esbuild.mjs**

```js
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
});
if (watch) {
  await ctx.watch();
  console.log('esbuild watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
```

- [ ] **Step 4: Criar vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 5: Criar/atualizar .gitignore** (o arquivo pode já existir no repo — garantir que contém exatamente estas entradas):

```
node_modules/
dist/
*.vsix
.claude/settings.local.json
.DS_Store
```

- [ ] **Step 6: Criar .vscode/launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Rodar extensão",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

- [ ] **Step 7: Criar src/extension.ts (stub)**

```ts
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  console.log('claude-session-hud activated');
}

export function deactivate(): void {}
```

- [ ] **Step 8: Criar test/smoke.test.ts**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Instalar e verificar**

Run: `npm install && npm run build && npm run typecheck && npm test`
Expected: os quatro comandos saem com código 0; `dist/extension.js` existe.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold da extensão claude-session-hud"
```

---

### Task 2: Tipos + leitura do registro de sessões vivas

**Files:**
- Create: `src/claude/model.ts`, `src/claude/registry.ts`
- Test: `test/registry.test.ts`

**Interfaces:**
- Consumes: toolchain da Task 1.
- Produces (usado pelas Tasks 3, 4, 5, 6):

```ts
// src/claude/model.ts
export interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number; // epoch ms
  name?: string;
}
export interface TranscriptInfo {
  aiTitle?: string;
  lastPrompt?: string;
}
export interface SessionCard {
  sessionId: string;
  pid: number;
  cwd: string;
  title: string;
  description: string;
  lastActivityMs: number; // epoch ms
}

// src/claude/registry.ts
export function isPidAlive(pid: number): boolean;
export function readRegistry(sessionsDir: string, alive?: (pid: number) => boolean): RegistryEntry[];
export function isUnderFolder(cwd: string, folder: string): boolean;
export function filterByFolders(entries: RegistryEntry[], folders: string[]): RegistryEntry[];
```

- [ ] **Step 1: Criar src/claude/model.ts** com o conteúdo exato do bloco "Produces" acima (as três interfaces).

- [ ] **Step 2: Escrever os testes que falham — test/registry.test.ts**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readRegistry, isUnderFolder, filterByFolders } from '../src/claude/registry';
import { RegistryEntry } from '../src/claude/model';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-reg-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const write = (name: string, content: string) => fs.writeFileSync(path.join(dir, name), content);
const entry = (over: Partial<RegistryEntry> = {}) => JSON.stringify({
  pid: 100, sessionId: 'sid-1', cwd: '/tmp/proj', startedAt: 1000, name: 'proj-a1', ...over,
});

describe('readRegistry', () => {
  it('reads valid entries when pid is alive', () => {
    write('100.json', entry());
    const out = readRegistry(dir, () => true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ pid: 100, sessionId: 'sid-1', cwd: '/tmp/proj', startedAt: 1000, name: 'proj-a1' });
  });

  it('drops entries whose pid is dead', () => {
    write('100.json', entry({ pid: 100 }));
    write('200.json', entry({ pid: 200, sessionId: 'sid-2' }));
    const out = readRegistry(dir, (pid) => pid === 100);
    expect(out.map((e) => e.sessionId)).toEqual(['sid-1']);
  });

  it('ignores non-json files, malformed json and incomplete entries', () => {
    write('100.key', 'not json');
    write('bad.json', '{broken');
    write('101.json', JSON.stringify({ pid: 101 })); // sem sessionId/cwd
    write('102.json', entry({ pid: 102, sessionId: 'sid-ok' }));
    const out = readRegistry(dir, () => true);
    expect(out.map((e) => e.sessionId)).toEqual(['sid-ok']);
  });

  it('returns [] when the directory does not exist', () => {
    expect(readRegistry(path.join(dir, 'nope'), () => true)).toEqual([]);
  });
});

describe('isUnderFolder', () => {
  it('matches equal path and children only', () => {
    expect(isUnderFolder('/a/b', '/a/b')).toBe(true);
    expect(isUnderFolder('/a/b/c', '/a/b')).toBe(true);
    expect(isUnderFolder('/a/bc', '/a/b')).toBe(false); // sibling com prefixo
    expect(isUnderFolder('/a', '/a/b')).toBe(false);    // pai não conta
  });
});

describe('filterByFolders', () => {
  it('keeps sessions whose cwd is inside any workspace folder', () => {
    const es = [
      { pid: 1, sessionId: 'in', cwd: '/w/one/sub', startedAt: 0 },
      { pid: 2, sessionId: 'out', cwd: '/elsewhere', startedAt: 0 },
    ] as RegistryEntry[];
    expect(filterByFolders(es, ['/w/one', '/w/two']).map((e) => e.sessionId)).toEqual(['in']);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/registry.test.ts`
Expected: FAIL — módulo `../src/claude/registry` não existe.

- [ ] **Step 4: Implementar src/claude/registry.ts**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { RegistryEntry } from './model';

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readRegistry(
  sessionsDir: string,
  alive: (pid: number) => boolean = isPidAlive,
): RegistryEntry[] {
  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir);
  } catch {
    return [];
  }
  const out: RegistryEntry[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
      if (
        typeof raw.pid === 'number' &&
        typeof raw.sessionId === 'string' &&
        typeof raw.cwd === 'string' &&
        alive(raw.pid)
      ) {
        out.push({
          pid: raw.pid,
          sessionId: raw.sessionId,
          cwd: raw.cwd,
          startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : 0,
          name: typeof raw.name === 'string' ? raw.name : undefined,
        });
      }
    } catch {
      // malformed registry file: skip
    }
  }
  return out;
}

export function isUnderFolder(cwd: string, folder: string): boolean {
  const rel = path.relative(folder, cwd);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function filterByFolders(entries: RegistryEntry[], folders: string[]): RegistryEntry[] {
  return entries.filter((e) => folders.some((f) => isUnderFolder(e.cwd, f)));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run test/registry.test.ts && npm run typecheck`
Expected: PASS (6 testes) e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/claude/model.ts src/claude/registry.ts test/registry.test.ts
git commit -m "feat: leitura do registro de sessões vivas do Claude Code"
```

---

### Task 3: Localização e parsing do transcript

**Files:**
- Create: `src/claude/transcript.ts`
- Test: `test/transcript.test.ts`

**Interfaces:**
- Consumes: `TranscriptInfo` de `src/claude/model.ts` (Task 2).
- Produces (usado pela Task 5):

```ts
export function projectSlug(cwd: string): string;
export function findTranscriptPath(projectsDir: string, cwd: string, sessionId: string): string | undefined;
export function extractTranscriptInfo(transcriptPath: string): Promise<TranscriptInfo>;
```

- [ ] **Step 1: Escrever os testes que falham — test/transcript.test.ts**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { projectSlug, findTranscriptPath, extractTranscriptInfo } from '../src/claude/transcript';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-tr-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('projectSlug', () => {
  it('replaces every non-alphanumeric char with dash', () => {
    expect(projectSlug('/Users/some.user/Work/proj_x')).toBe('-Users-some-user-Work-proj-x');
  });
});

describe('findTranscriptPath', () => {
  it('finds the transcript under the slug directory', () => {
    const cwd = '/tmp/my-proj';
    const p = path.join(dir, projectSlug(cwd));
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, 'sid-1.jsonl'), '');
    expect(findTranscriptPath(dir, cwd, 'sid-1')).toBe(path.join(p, 'sid-1.jsonl'));
  });

  it('falls back to scanning all project dirs (truncated/hashed slugs)', () => {
    const p = path.join(dir, 'weird-hashed-dir-abc123');
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, 'sid-2.jsonl'), '');
    expect(findTranscriptPath(dir, '/does/not/match', 'sid-2')).toBe(path.join(p, 'sid-2.jsonl'));
  });

  it('returns undefined when nothing exists', () => {
    expect(findTranscriptPath(dir, '/x', 'sid-3')).toBeUndefined();
  });
});

describe('extractTranscriptInfo', () => {
  it('returns the LAST ai-title and last-prompt, ignoring garbage lines', async () => {
    const f = path.join(dir, 't.jsonl');
    fs.writeFileSync(
      f,
      [
        JSON.stringify({ type: 'ai-title', aiTitle: 'Título antigo' }),
        '{broken json',
        JSON.stringify({ type: 'user', message: 'irrelevante "ai-title" no meio do texto' }),
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'primeiro prompt' }),
        JSON.stringify({ type: 'ai-title', aiTitle: 'Título atual' }),
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'faz o /merge-main' }),
      ].join('\n') + '\n',
    );
    const info = await extractTranscriptInfo(f);
    expect(info.aiTitle).toBe('Título atual');
    expect(info.lastPrompt).toBe('faz o /merge-main');
  });

  it('returns empty object for empty or unreadable file', async () => {
    const f = path.join(dir, 'empty.jsonl');
    fs.writeFileSync(f, '');
    expect(await extractTranscriptInfo(f)).toEqual({});
    expect(await extractTranscriptInfo(path.join(dir, 'missing.jsonl'))).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/transcript.test.ts`
Expected: FAIL — módulo `../src/claude/transcript` não existe.

- [ ] **Step 3: Implementar src/claude/transcript.ts**

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { TranscriptInfo } from './model';

export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

export function findTranscriptPath(
  projectsDir: string,
  cwd: string,
  sessionId: string,
): string | undefined {
  const direct = path.join(projectsDir, projectSlug(cwd), `${sessionId}.jsonl`);
  if (fs.existsSync(direct)) return direct;
  // Slugs can be truncated+hashed for long paths: scan as fallback.
  let dirs: string[];
  try {
    dirs = fs.readdirSync(projectsDir);
  } catch {
    return undefined;
  }
  for (const d of dirs) {
    const candidate = path.join(projectsDir, d, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function extractTranscriptInfo(transcriptPath: string): Promise<TranscriptInfo> {
  const info: TranscriptInfo = {};
  let stream: fs.ReadStream;
  try {
    stream = fs.createReadStream(transcriptPath, { encoding: 'utf8' });
  } catch {
    return info;
  }
  try {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.includes('"ai-title"')) {
        try {
          const rec = JSON.parse(line);
          if (rec.type === 'ai-title' && typeof rec.aiTitle === 'string') info.aiTitle = rec.aiTitle;
        } catch { /* skip */ }
      } else if (line.includes('"last-prompt"')) {
        try {
          const rec = JSON.parse(line);
          if (rec.type === 'last-prompt' && typeof rec.lastPrompt === 'string') info.lastPrompt = rec.lastPrompt;
        } catch { /* skip */ }
      }
    }
  } catch {
    // unreadable mid-stream: return whatever was collected
  }
  return info;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/transcript.test.ts && npm run typecheck`
Expected: PASS (6 testes) e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/claude/transcript.ts test/transcript.test.ts
git commit -m "feat: extração de título e último prompt do transcript"
```

---

### Task 4: Renderização pura (cards HTML + status bar + tempo relativo)

**Files:**
- Create: `src/ui/render.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `SessionCard` de `src/claude/model.ts` (Task 2).
- Produces (usado pela Task 6). IMPORTANTE: `render.ts` NÃO pode importar `vscode` (é testado pelo vitest fora do VSCode):

```ts
export function escapeHtml(s: string): string;
export function truncate(s: string, max: number): string; // corta e adiciona '…'
export function formatRelativeTime(thenMs: number, nowMs: number): string; // pt-BR
export function statusBarText(cards: SessionCard[]): string; // '' quando vazio
export function statusBarTooltip(cards: SessionCard[], nowMs: number): string; // markdown
export function renderSessionsHtml(cards: SessionCard[], nowMs: number): string; // doc HTML completo
```

- [ ] **Step 1: Escrever os testes que falham — test/render.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import {
  escapeHtml, truncate, formatRelativeTime,
  statusBarText, statusBarTooltip, renderSessionsHtml,
} from '../src/ui/render';
import { SessionCard } from '../src/claude/model';

const card = (over: Partial<SessionCard> = {}): SessionCard => ({
  sessionId: 'sid-1', pid: 1, cwd: '/w/webapp',
  title: 'Corrige paginação do PDF', description: 'abre um PR com essa correção',
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
});

describe('renderSessionsHtml', () => {
  it('renders title, description and relative time, escaped', () => {
    const html = renderSessionsHtml([card({ title: '<script>x</script>', description: 'a & b' })], 60_000);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('há 1 min');
    expect(html).toContain('webapp'); // basename do cwd
  });
  it('renders the empty state', () => {
    expect(renderSessionsHtml([], 0)).toContain('Nenhuma sessão Claude ativa nesta janela');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/render.test.ts`
Expected: FAIL — módulo `../src/ui/render` não existe.

- [ ] **Step 3: Implementar src/ui/render.ts**

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/render.test.ts && npm run typecheck`
Expected: PASS (13 testes) e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/ui/render.ts test/render.test.ts
git commit -m "feat: renderização pura dos cards e da status bar"
```

---

### Task 5: Monitor de sessões (polling + watcher + cache)

**Files:**
- Create: `src/claude/monitor.ts`
- Test: `test/monitor.test.ts`

**Interfaces:**
- Consumes: `readRegistry`/`filterByFolders` (Task 2), `findTranscriptPath`/`extractTranscriptInfo` (Task 3), tipos de `model.ts`.
- Produces (usado pela Task 6):

```ts
export interface MonitorOptions {
  claudeDir?: string;                    // default: path.join(os.homedir(), '.claude')
  folders: () => string[];               // workspace folders da janela
  pollIntervalMs?: number;               // default 3000
  aliveFn?: (pid: number) => boolean;    // default isPidAlive (injetável p/ teste)
  onSnapshot: (cards: SessionCard[]) => void;
}
export class SessionMonitor {
  constructor(opts: MonitorOptions);
  start(): void;            // agenda polling + fs.watch e faz refresh imediato
  stop(): void;
  refresh(): Promise<void>; // coalesce: chamadas concorrentes não se sobrepõem
}
```

- [ ] **Step 1: Escrever os testes que falham — test/monitor.test.ts**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionMonitor } from '../src/claude/monitor';
import { SessionCard } from '../src/claude/model';
import { projectSlug } from '../src/claude/transcript';

let claudeDir: string;
beforeEach(() => { claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-mon-')); });
afterEach(() => { fs.rmSync(claudeDir, { recursive: true, force: true }); });

function writeSession(file: string, pid: number, sessionId: string, cwd: string): void {
  const dir = path.join(claudeDir, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ pid, sessionId, cwd, startedAt: 500 }));
}

function writeTranscript(cwd: string, sessionId: string, lines: string[]): string {
  const dir = path.join(claudeDir, 'projects', projectSlug(cwd));
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
}

function makeMonitor(cwd: string, sink: SessionCard[][]): SessionMonitor {
  return new SessionMonitor({
    claudeDir,
    folders: () => [cwd],
    aliveFn: () => true,
    pollIntervalMs: 3_600_000, // nunca dispara no teste; refresh é manual
    onSnapshot: (cards) => sink.push(cards),
  });
}

describe('SessionMonitor.refresh', () => {
  it('builds cards from registry + transcript, sorted by activity', async () => {
    const cwd = path.join(claudeDir, 'ws');
    writeSession('1.json', 1, 'sid-a', cwd);
    writeSession('2.json', 2, 'sid-b', cwd);
    writeTranscript(cwd, 'sid-a', [
      JSON.stringify({ type: 'ai-title', aiTitle: 'Trabalho A' }),
      JSON.stringify({ type: 'last-prompt', lastPrompt: 'roda os testes' }),
    ]);
    const older = writeTranscript(cwd, 'sid-b', [
      JSON.stringify({ type: 'ai-title', aiTitle: 'Trabalho B' }),
    ]);
    fs.utimesSync(older, new Date(1000), new Date(1000)); // B bem mais antigo

    const sink: SessionCard[][] = [];
    await makeMonitor(cwd, sink).refresh();

    expect(sink).toHaveLength(1);
    expect(sink[0].map((c) => c.title)).toEqual(['Trabalho A', 'Trabalho B']);
    expect(sink[0][0].description).toBe('roda os testes');
  });

  it('re-parses the transcript when mtime changes and drops dead sessions', async () => {
    const cwd = path.join(claudeDir, 'ws');
    writeSession('1.json', 1, 'sid-a', cwd);
    const f = writeTranscript(cwd, 'sid-a', [JSON.stringify({ type: 'ai-title', aiTitle: 'V1' })]);
    fs.utimesSync(f, new Date(1000), new Date(1000));

    const sink: SessionCard[][] = [];
    const mon = makeMonitor(cwd, sink);
    await mon.refresh();
    expect(sink[0][0].title).toBe('V1');

    fs.appendFileSync(f, JSON.stringify({ type: 'ai-title', aiTitle: 'V2' }) + '\n');
    await mon.refresh();
    expect(sink[1][0].title).toBe('V2');

    fs.rmSync(path.join(claudeDir, 'sessions', '1.json')); // sessão encerrada
    await mon.refresh();
    expect(sink[2]).toEqual([]);
  });

  it('uses name/sessionId fallbacks and startedAt when transcript is missing', async () => {
    const cwd = path.join(claudeDir, 'ws');
    writeSession('1.json', 1, 'sid-without-transcript', cwd);
    const sink: SessionCard[][] = [];
    await makeMonitor(cwd, sink).refresh();
    expect(sink[0][0].title).toBe('sid-with'); // sessionId.slice(0, 8)
    expect(sink[0][0].description).toBe('');
    expect(sink[0][0].lastActivityMs).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/monitor.test.ts`
Expected: FAIL — módulo `../src/claude/monitor` não existe.

- [ ] **Step 3: Implementar src/claude/monitor.ts**

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RegistryEntry, SessionCard, TranscriptInfo } from './model';
import { filterByFolders, isPidAlive, readRegistry } from './registry';
import { extractTranscriptInfo, findTranscriptPath } from './transcript';

export interface MonitorOptions {
  claudeDir?: string;
  folders: () => string[];
  pollIntervalMs?: number;
  aliveFn?: (pid: number) => boolean;
  onSnapshot: (cards: SessionCard[]) => void;
}

interface CacheEntry {
  mtimeMs: number;
  info: TranscriptInfo;
  transcriptPath: string;
}

export class SessionMonitor {
  private timer?: ReturnType<typeof setInterval>;
  private watcher?: fs.FSWatcher;
  private cache = new Map<string, CacheEntry>();
  private refreshing = false;
  private pending = false;

  constructor(private readonly opts: MonitorOptions) {}

  private get claudeDir(): string {
    return this.opts.claudeDir ?? path.join(os.homedir(), '.claude');
  }
  private get sessionsDir(): string {
    return path.join(this.claudeDir, 'sessions');
  }
  private get projectsDir(): string {
    return path.join(this.claudeDir, 'projects');
  }

  start(): void {
    this.timer = setInterval(() => void this.refresh(), this.opts.pollIntervalMs ?? 3000);
    try {
      this.watcher = fs.watch(this.sessionsDir, () => void this.refresh());
    } catch {
      // sessions dir may not exist yet; polling still covers it
    }
    void this.refresh();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.watcher?.close();
    this.timer = undefined;
    this.watcher = undefined;
  }

  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.pending = true;
      return;
    }
    this.refreshing = true;
    try {
      const entries = filterByFolders(
        readRegistry(this.sessionsDir, this.opts.aliveFn ?? isPidAlive),
        this.opts.folders(),
      );
      const cards: SessionCard[] = [];
      for (const entry of entries) {
        cards.push(await this.buildCard(entry));
      }
      const liveIds = new Set(entries.map((e) => e.sessionId));
      for (const id of [...this.cache.keys()]) {
        if (!liveIds.has(id)) this.cache.delete(id);
      }
      cards.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
      this.opts.onSnapshot(cards);
    } finally {
      this.refreshing = false;
      if (this.pending) {
        this.pending = false;
        void this.refresh();
      }
    }
  }

  private async buildCard(entry: RegistryEntry): Promise<SessionCard> {
    const cached = this.cache.get(entry.sessionId);
    const transcriptPath =
      cached?.transcriptPath ?? findTranscriptPath(this.projectsDir, entry.cwd, entry.sessionId);
    let info: TranscriptInfo = cached?.info ?? {};
    let lastActivityMs = entry.startedAt;
    if (transcriptPath) {
      try {
        const stat = fs.statSync(transcriptPath);
        lastActivityMs = stat.mtimeMs;
        if (!cached || cached.mtimeMs !== stat.mtimeMs) {
          info = await extractTranscriptInfo(transcriptPath);
          this.cache.set(entry.sessionId, { mtimeMs: stat.mtimeMs, info, transcriptPath });
        }
      } catch {
        // transcript vanished between find and stat: keep fallbacks
      }
    }
    return {
      sessionId: entry.sessionId,
      pid: entry.pid,
      cwd: entry.cwd,
      title: info.aiTitle ?? entry.name ?? entry.sessionId.slice(0, 8),
      description: info.lastPrompt ?? '',
      lastActivityMs,
    };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/monitor.test.ts && npm test && npm run typecheck`
Expected: PASS (3 testes novos, suíte inteira verde) e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/claude/monitor.ts test/monitor.test.ts
git commit -m "feat: monitor de sessões com polling, watcher e cache por mtime"
```

---

### Task 6: Integração VSCode (view, status bar, ativação)

**Files:**
- Create: `src/ui/sessionsView.ts`, `src/ui/statusBar.ts`
- Modify: `src/extension.ts` (substituir o stub inteiro), `package.json` (preencher `contributes`)

**Interfaces:**
- Consumes: `SessionMonitor`/`MonitorOptions` (Task 5), `renderSessionsHtml`/`statusBarText`/`statusBarTooltip` (Task 4), `SessionCard` (Task 2).
- Produces: extensão funcional; view `claudeSessionHud.sessions` no Explorer; comando `claudeSessionHud.refresh`.

- [ ] **Step 1: Preencher `contributes` no package.json** (substituir o `"contributes": {}` da Task 1):

```json
"contributes": {
  "views": {
    "explorer": [
      {
        "type": "webview",
        "id": "claudeSessionHud.sessions",
        "name": "Sessões Claude",
        "contextualTitle": "Claude Session HUD"
      }
    ]
  },
  "commands": [
    { "command": "claudeSessionHud.refresh", "title": "Claude Session HUD: Atualizar" }
  ]
}
```

- [ ] **Step 2: Criar src/ui/sessionsView.ts**

```ts
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
```

- [ ] **Step 3: Criar src/ui/statusBar.ts**

```ts
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
```

- [ ] **Step 4: Reescrever src/extension.ts**

```ts
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
      provider.update(cards);
      statusBar.update(cards);
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
```

- [ ] **Step 5: Verificar build e suíte**

Run: `npm run build && npm run typecheck && npm test`
Expected: tudo verde. (`vscode.WebviewView.badge` existe desde 1.72 — dentro do engine ^1.90.)

- [ ] **Step 6: Teste manual (F5) — checklist**

1. Apertar F5 (config "Rodar extensão"); abre a janela "Extension Development Host".
2. Na janela de dev, abrir uma pasta que tenha sessão Claude viva (conferir candidatas com `ls ~/.claude/sessions/`).
3. Verificar no Explorer a view **"Sessões Claude"**: card com título (= título da aba do Claude), último prompt e "há X min".
4. Verificar item na status bar (esquerda, ícone sparkle); clicar nele deve focar a view.
5. Mandar uma mensagem nova na sessão Claude dessa janela → card atualiza em ≤ 3 s (título/descrição/tempo).
6. Abrir uma pasta sem sessão → estado vazio "Nenhuma sessão Claude ativa nesta janela." e status bar oculta.

Expected: os 6 itens OK. Se algum falhar, corrigir antes do commit.

- [ ] **Step 7: Commit**

```bash
git add package.json src/ui/sessionsView.ts src/ui/statusBar.ts src/extension.ts
git commit -m "feat: integração VSCode — webview view, status bar e ativação"
```

---

### Task 7: Empacotamento, instalação e README

**Files:**
- Create: `README.md`, `LICENSE`
- Modify: nenhum

**Interfaces:**
- Consumes: extensão completa (Task 6).
- Produces: `claude-session-hud-0.1.0.vsix` instalado no VSCode do usuário.

- [ ] **Step 1: Criar LICENSE** (MIT, evita prompt interativo do vsce):

```
MIT License

Copyright (c) 2026 Danilo Uema

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Criar README.md**

```markdown
# Claude Session HUD

Mostra, em cada janela do VSCode, o que as sessões do Claude Code daquela janela
estão fazendo: título auto-gerado, último prompt enviado e tempo desde a última
atividade. View "Sessões Claude" no Explorer + item na status bar.

## Como funciona

Lê (somente leitura) os dados que o Claude Code mantém em `~/.claude`:
`sessions/*.json` (sessões vivas) e `projects/<slug>/<sessionId>.jsonl`
(título `ai-title` e `last-prompt` do transcript). Atualiza a cada 3 s.

## Desenvolvimento

- `npm install && npm run build` — bundle em `dist/`
- `npm test` / `npm run typecheck` — vitest + tsc
- F5 — roda a extensão em Extension Development Host
- `npm run package` — gera o `.vsix`

## Instalação local

`code --install-extension claude-session-hud-0.1.0.vsix`

Design e plano: `docs/superpowers/`.
```

- [ ] **Step 3: Gerar o .vsix**

Run: `npm run package`
Expected: cria `claude-session-hud-0.1.0.vsix` sem prompts (sai com código 0).

- [ ] **Step 4: Instalar no VSCode real**

Run: `code --install-extension claude-session-hud-0.1.0.vsix`
Expected: "Extension 'claude-session-hud-0.1.0.vsix' was successfully installed."

- [ ] **Step 5: QA final nas janelas reais — checklist**

1. Recarregar (`Developer: Reload Window`) 2+ janelas que tenham sessões Claude vivas.
2. Cada janela mostra APENAS as suas sessões (conferir contra `ls ~/.claude/sessions/`).
3. Janela multi-root com 2 sessões simultâneas mostra 2 cards (se houver uma disponível).
4. Encerrar uma sessão Claude → card some em ≤ 3 s.
5. Critérios de sucesso do spec todos atendidos.

Expected: tudo OK; anotar qualquer desvio como issue no README antes do commit.

- [ ] **Step 6: Commit**

```bash
git add README.md LICENSE
git commit -m "chore: empacotamento vsix, licença e README"
```
