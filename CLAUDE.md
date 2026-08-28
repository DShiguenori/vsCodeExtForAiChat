# Claude Session HUD — instruções do projeto

Extensão VSCode que mostra, numa view do Explorer + status bar, o título e o último prompt de
cada sessão Claude Code viva pertencente à janela atual. Spec e plano de implementação em
[docs/superpowers/](docs/superpowers/) — leia o spec antes de mexer na camada de dados.

## Comandos

- `npm run build` — bundle esbuild em `dist/extension.js`
- `npm run watch` — build contínuo
- `npm test` — vitest (testes unitários, rodam fora do VSCode)
- `npm run typecheck` — `tsc --noEmit`
- `npm run package` — gera o `.vsix` (vsce)
- F5 — roda a extensão em Extension Development Host

## Regras do projeto

- **Somente leitura sobre `~/.claude`** — este projeto NUNCA escreve lá, em nenhuma hipótese.
- Código, identificadores e comentários em **inglês**; textos de UI em **pt-BR**.
- `src/claude/*` e `src/ui/render.ts` **não importam `vscode`** — são módulos Node puros
  testáveis via vitest. Só `src/ui/sessionsView.ts`, `src/ui/statusBar.ts` e `src/extension.ts`
  tocam a API do VSCode.
- Parsing dos dados de `~/.claude` é tolerante: linha/arquivo malformado é ignorado
  silenciosamente, nunca lança (o formato é interno do Claude Code e pode mudar).
- TDD: teste falhando → implementação mínima → suíte verde (`npm test && npm run typecheck`) →
  commit.
- Commits em pt-BR, formato `tipo: descrição` (feat/fix/chore/docs/test/refactor). Sem trailers
  de atribuição.
- Fixtures de teste sempre em diretórios temporários (`fs.mkdtempSync`), nunca no `~/.claude`
  real.
