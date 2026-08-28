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
  firstPrompt?: string;
  lastAssistantLine?: string;
}

export interface SessionCard {
  sessionId: string;
  pid: number;
  cwd: string;
  title: string;
  goal: string;
  lastAction: string;
  lastActivityMs: number; // epoch ms
}
