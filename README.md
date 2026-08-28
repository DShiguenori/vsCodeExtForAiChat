# Claude Session HUD

Mostra, em cada janela do VSCode, o que as sessões do Claude Code daquela janela
estão fazendo: título auto-gerado, último prompt enviado e tempo desde a última
atividade. View "Sessões Claude" no Explorer + item na status bar.

## Como funciona

Lê (somente leitura) os dados que o Claude Code mantém em `~/.claude`:
`sessions/*.json` (sessões vivas) e `projects/<slug>/<sessionId>.jsonl`
(título `ai-title` e `last-prompt` do transcript). Atualiza a cada 3 s.

## Desenvolvimento

- `npm install && npm run build` — bundle em `dist/`
- `npm test` / `npm run typecheck` — vitest + tsc
- F5 — roda a extensão em Extension Development Host
- `npm run package` — gera o `.vsix`

## Instalação local

`code --install-extension claude-session-hud-0.1.0.vsix`

Design e plano: `docs/superpowers/`.
