import { describe, it, expect } from 'vitest';
import { condenseUrls, stripMarkdown, firstMeaningfulLine, toGoal, toLastAction } from '../src/claude/summary';

describe('condenseUrls', () => {
  it('condenses an Azure DevOps pull request URL to "PR <n>"', () => {
    expect(condenseUrls('https://dev.azure.com/bnpdesenvolvimento/fasepro/_git/fasepro-monorepo/pullrequest/27769'))
      .toBe('PR 27769');
  });

  it('condenses a GitHub-style /pull/<n> URL to "PR <n>"', () => {
    expect(condenseUrls('https://github.com/org/repo/pull/123')).toBe('PR 123');
  });

  it('condenses a plain URL to its hostname without www.', () => {
    expect(condenseUrls('https://www.example.com/some/path?x=1')).toBe('example.com');
  });

  it('leaves text without a URL intact', () => {
    expect(condenseUrls('nenhuma url aqui, só texto')).toBe('nenhuma url aqui, só texto');
  });

  it('condenses every URL when there are multiple', () => {
    expect(condenseUrls('veja https://github.com/org/repo/pull/1 e https://www.outro.com/x'))
      .toBe('veja PR 1 e outro.com');
  });

  it('normalizes internal whitespace (including newlines) to a single space and trims', () => {
    expect(condenseUrls('  linha 1\n\nlinha  2  ')).toBe('linha 1 linha 2');
  });
});

describe('firstMeaningfulLine', () => {
  it('skips empty, table, separator, quote and code-fence lines', () => {
    const text = ['', '| a | b |', '---', '> uma citação', '```', 'conteúdo real'].join('\n');
    expect(firstMeaningfulLine(text)).toBe('conteúdo real');
  });

  it('returns empty string when nothing qualifies', () => {
    const text = ['', '| a | b |', '---', '> só citação'].join('\n');
    expect(firstMeaningfulLine(text)).toBe('');
  });

  it('returns the first line when it already qualifies', () => {
    expect(firstMeaningfulLine('primeira linha\nsegunda linha')).toBe('primeira linha');
  });
});

describe('stripMarkdown', () => {
  it('strips bold emphasis', () => {
    expect(stripMarkdown('**DevidApp**')).toBe('DevidApp');
  });

  it('strips backticks', () => {
    expect(stripMarkdown('`/merge-main`')).toBe('/merge-main');
  });

  it('converts a markdown link into just its text', () => {
    expect(stripMarkdown('[texto](http://x)')).toBe('texto');
  });
});

describe('toGoal', () => {
  it('condenses a leading bare URL to a label and joins the next meaningful line with " — "', () => {
    const firstPrompt =
      'https://dev.azure.com/bnpdesenvolvimento/fasepro/_git/fasepro-monorepo/pullrequest/27769' +
      '\n\nNessa branch dessa PR:\n- executa o /merge-main';
    expect(toGoal(firstPrompt).startsWith('PR 27769 — Nessa branch dessa PR')).toBe(true);
  });

  it('separates the label from the rest when the URL and the request share one line', () => {
    // Real transcripts store the whole prompt on a single line, so the URL is
    // never alone on its own line — the dash has to be inserted here too.
    const firstPrompt =
      'https://dev.azure.com/bnpdesenvolvimento/fasepro/_git/fasepro-monorepo/pullrequest/28312' +
      ' Nessa branch dessa PR: executa o /merge-main';
    expect(toGoal(firstPrompt)).toBe('PR 28312 — Nessa branch dessa PR: executa o /merge-main');
  });

  it('is exactly the label, with no dangling dash, when the prompt is only the URL', () => {
    expect(toGoal('https://dev.azure.com/bnpdesenvolvimento/fasepro/_git/fasepro-monorepo/pullrequest/27769'))
      .toBe('PR 27769');
  });

  it('returns empty string for undefined', () => {
    expect(toGoal(undefined)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(toGoal('')).toBe('');
  });
});

describe('toLastAction', () => {
  it('strips markdown emphasis from the assistant line', () => {
    expect(toLastAction('Postado — 8 threads na PR 27769, todas assinadas por **DevidApp** (confirmado).'))
      .toBe('Postado — 8 threads na PR 27769, todas assinadas por DevidApp (confirmado).');
  });

  it('returns empty string for undefined', () => {
    expect(toLastAction(undefined)).toBe('');
  });

  it('returns empty string for an empty string', () => {
    expect(toLastAction('')).toBe('');
  });
});
