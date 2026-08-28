// Pure text-extraction helpers for turning raw transcript fragments (a first
// user prompt, a last assistant text block) into short, human-scannable card
// text. No AI calls, no I/O — everything here is a plain string transform.

const URL_RE = /https?:\/\/\S+/g;
const BARE_URL_RE = /^https?:\/\/\S+$/;
const LEADING_URL_RE = /^(https?:\/\/\S+)\s+(\S[\s\S]*)$/;
const PR_PATH_RE = /\/pull(?:request)?\/(\d+)/;

/**
 * Replaces every http(s) URL in `text` with a short label: `PR <n>` when the
 * URL path matches `/pullrequest/<n>` or `/pull/<n>`, otherwise the URL's
 * hostname (without a leading `www.`). Afterwards, all whitespace (including
 * newlines) collapses to a single space and the result is trimmed.
 */
export function condenseUrls(text: string): string {
  const replaced = text.replace(URL_RE, (url) => {
    const prMatch = url.match(PR_PATH_RE);
    if (prMatch) return `PR ${prMatch[1]}`;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  });
  return replaced.replace(/\s+/g, ' ').trim();
}

/**
 * Strips the common inline Markdown markers (emphasis, inline code, links,
 * ATX headers) from `text`. Not a full Markdown parser — just enough to keep
 * a one-line card excerpt free of stray `**`/`` ` ``/`[]()` noise.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1');
}

/**
 * Returns the first non-empty line of `text` that isn't a table row (`|`),
 * a horizontal-rule separator (`---`), a blockquote (`>`) or a code-fence
 * delimiter (```` ``` ````). Returns '' when no line qualifies.
 */
export function firstMeaningfulLine(text: string): string {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('|')) continue;
    if (/^-{3,}$/.test(line)) continue;
    if (line.startsWith('>')) continue;
    if (line.startsWith('```')) continue;
    return line;
  }
  return '';
}

/**
 * Builds the "Pedido" card line from a session's first prompt: the original
 * goal, condensed to one short line. When the prompt's first meaningful line
 * is nothing but a URL, that URL collapses to its label and — only when a
 * next meaningful line exists — is joined to it with ' — ' so the label
 * never dangles alone in front of unrelated context.
 */
export function toGoal(firstPrompt: string | undefined): string {
  if (!firstPrompt) return '';
  const line = firstMeaningfulLine(firstPrompt);
  if (!line) return '';

  let combined = line;
  if (BARE_URL_RE.test(line)) {
    const idx = firstPrompt.indexOf(line);
    const remainder = idx >= 0 ? firstPrompt.slice(idx + line.length) : '';
    const nextLine = firstMeaningfulLine(remainder);
    combined = nextLine ? `${line} — ${nextLine}` : line;
  }

  // A prompt that opens with a URL and keeps going on the same line reads as
  // "<label> — <rest>"; without the dash the label runs into the sentence.
  const leading = combined.match(LEADING_URL_RE);
  if (leading && !leading[2].startsWith('—')) combined = `${leading[1]} — ${leading[2]}`;

  return stripMarkdown(condenseUrls(combined)).trim();
}

/**
 * Builds the "Agora" card line from the last assistant text block: its first
 * meaningful line, with Markdown noise stripped and any URL condensed.
 */
export function toLastAction(lastAssistantLine: string | undefined): string {
  if (!lastAssistantLine) return '';
  const line = firstMeaningfulLine(lastAssistantLine);
  if (!line) return '';
  return condenseUrls(stripMarkdown(line)).trim();
}
