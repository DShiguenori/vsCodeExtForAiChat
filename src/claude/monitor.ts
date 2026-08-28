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
