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

function writeSession(file: string, pid: number, sessionId: string, cwd: string, name?: string): void {
  const dir = path.join(claudeDir, 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  const data = { pid, sessionId, cwd, startedAt: 500, ...(name ? { name } : {}) };
  fs.writeFileSync(path.join(dir, file), JSON.stringify(data));
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

  it('uses name fallback tier when no transcript', async () => {
    const cwd = path.join(claudeDir, 'ws');
    writeSession('1.json', 1, 'sid-with-name', cwd, 'proj-a1');
    const sink: SessionCard[][] = [];
    await makeMonitor(cwd, sink).refresh();
    expect(sink[0][0].title).toBe('proj-a1');
    expect(sink[0][0].description).toBe('');
  });

  it('coalesces concurrent refresh calls', async () => {
    const cwd = path.join(claudeDir, 'ws');
    writeSession('1.json', 1, 'sid-a', cwd);
    writeTranscript(cwd, 'sid-a', [
      JSON.stringify({ type: 'ai-title', aiTitle: 'Test' }),
    ]);

    const sink: SessionCard[][] = [];
    const mon = makeMonitor(cwd, sink);
    const p1 = mon.refresh();
    const p2 = mon.refresh();
    await Promise.all([p1, p2]);

    while (sink.length < 2) await new Promise(r => setTimeout(r, 10));
    expect(sink.length).toBe(2);
  });

  it('start/stop lifecycle manages polling and watching', async () => {
    const cwd = path.join(claudeDir, 'ws');
    writeSession('1.json', 1, 'sid-a', cwd);
    writeTranscript(cwd, 'sid-a', [
      JSON.stringify({ type: 'ai-title', aiTitle: 'Test' }),
    ]);

    const sink: SessionCard[][] = [];
    const mon = new SessionMonitor({
      claudeDir,
      folders: () => [cwd],
      aliveFn: () => true,
      pollIntervalMs: 25,
      onSnapshot: (cards) => sink.push(cards),
    });

    mon.start();
    while (sink.length < 2) await new Promise(r => setTimeout(r, 10));
    mon.stop();
    const n = sink.length;
    await new Promise(r => setTimeout(r, 120));
    expect(sink.length).toBe(n);
  });
});
