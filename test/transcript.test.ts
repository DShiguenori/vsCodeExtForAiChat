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

  it('captures a last-prompt whose serialized line also contains the literal substring "ai-title"', async () => {
    const f = path.join(dir, 't2.jsonl');
    // lastPrompt is the bare word `ai-title` (no inner quotes in the source string), so once
    // JSON.stringify wraps it in its own quotes the raw .jsonl line contains the literal
    // substring `"ai-title"` — the same marker the ai-title branch scans for. This is what
    // used to make the record fall into the first `if` and get swallowed by an `else if`.
    fs.writeFileSync(
      f,
      [
        JSON.stringify({ type: 'ai-title', aiTitle: 'Título inicial' }),
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'ai-title' }),
      ].join('\n') + '\n',
    );
    const info = await extractTranscriptInfo(f);
    expect(info.aiTitle).toBe('Título inicial');
    expect(info.lastPrompt).toBe('ai-title');
  });

  it('returns empty object for empty or unreadable file', async () => {
    const f = path.join(dir, 'empty.jsonl');
    fs.writeFileSync(f, '');
    expect(await extractTranscriptInfo(f)).toEqual({});
    expect(await extractTranscriptInfo(path.join(dir, 'missing.jsonl'))).toEqual({});
  });

  it('captures the FIRST last-prompt as firstPrompt while lastPrompt stays the last one', async () => {
    const f = path.join(dir, 'first-last.jsonl');
    fs.writeFileSync(
      f,
      [
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'primeiro prompt da sessão' }),
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'segundo prompt' }),
      ].join('\n') + '\n',
    );
    const info = await extractTranscriptInfo(f);
    expect(info.firstPrompt).toBe('primeiro prompt da sessão');
    expect(info.lastPrompt).toBe('segundo prompt');
  });

  it('captures the last assistant text block, recovering into the buffer when the newest matching line has no usable text', async () => {
    const f = path.join(dir, 'assistant.jsonl');
    fs.writeFileSync(
      f,
      [
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'primeiro prompt' }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Resposta antiga' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Resposta mais recente com texto' }] },
        }),
        // Newest line still matches the cheap "assistant"+"text" substring filter (so it
        // lands in the buffer) but its text block is empty — extraction must recede to the
        // previous buffered line and still find the earlier non-empty text.
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: '' }] },
        }),
      ].join('\n') + '\n',
    );
    const info = await extractTranscriptInfo(f);
    expect(info.firstPrompt).toBe('primeiro prompt');
    expect(info.lastAssistantLine).toBe('Resposta mais recente com texto');
  });

  it('leaves lastAssistantLine undefined when no assistant line has a text block', async () => {
    const f = path.join(dir, 'no-text.jsonl');
    fs.writeFileSync(
      f,
      [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] },
        }),
      ].join('\n') + '\n',
    );
    const info = await extractTranscriptInfo(f);
    expect(info.lastAssistantLine).toBeUndefined();
  });
});
