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
