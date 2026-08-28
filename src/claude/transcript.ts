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

// Cheap substring pre-filter for candidate assistant-text lines: cap how many
// large lines get a full JSON.parse by keeping only the last few raw lines
// that even mention both markers, then parse from newest to oldest below.
const ASSISTANT_LINE_BUFFER_SIZE = 3;

export async function extractTranscriptInfo(transcriptPath: string): Promise<TranscriptInfo> {
  const info: TranscriptInfo = {};
  const assistantLineBuffer: string[] = [];
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
      }
      if (line.includes('"last-prompt"')) {
        try {
          const rec = JSON.parse(line);
          if (rec.type === 'last-prompt' && typeof rec.lastPrompt === 'string') {
            if (info.firstPrompt === undefined) info.firstPrompt = rec.lastPrompt;
            info.lastPrompt = rec.lastPrompt;
          }
        } catch { /* skip */ }
      }
      if (line.includes('"type":"assistant"') && line.includes('"type":"text"')) {
        assistantLineBuffer.push(line);
        if (assistantLineBuffer.length > ASSISTANT_LINE_BUFFER_SIZE) assistantLineBuffer.shift();
      }
    }
  } catch {
    // unreadable mid-stream: return whatever was collected
  }

  for (let i = assistantLineBuffer.length - 1; i >= 0; i--) {
    const text = extractAssistantText(assistantLineBuffer[i]);
    if (text) {
      info.lastAssistantLine = text;
      break;
    }
  }

  return info;
}

function extractAssistantText(line: string): string | undefined {
  try {
    const rec = JSON.parse(line);
    if (rec.type !== 'assistant') return undefined;
    const content = rec.message?.content;
    if (!Array.isArray(content)) return undefined;
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        return block.text;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}
