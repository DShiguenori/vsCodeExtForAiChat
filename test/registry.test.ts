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
