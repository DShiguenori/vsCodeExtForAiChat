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
        Number.isInteger(raw.pid) && raw.pid > 0 &&
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
