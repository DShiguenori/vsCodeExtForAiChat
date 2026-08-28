# Claude Session HUD — Design

Extensão VSCode que resolve o problema de carga cognitiva de trabalhar com 6+ janelas de VSCode
simultâneas, cada uma com uma ou mais sessões do Claude Code: ao focar qualquer janela, uma área
fixa da tela mostra **título + descrição breve + última atividade** de cada sessão Claude viva
daquela janela.

## Contexto e pesquisa (28/08/2026)

- **Não existe solução nativa.** A extensão oficial do Claude Code mostra o título auto-gerado
  (`ai-title`) só na aba da sessão e no picker de histórico. A statusline customizável é exclusiva
  do CLI. Não há exibição fixa.
- **Overlay externo (Aerospace/Hammerspoon) foi descartado** para v1: Aerospace não tem overlay
  (só hooks de foco); Hammerspoon consegue (hs.canvas + hs.window.filter) mas exige outro daemon,
  permissão de acessibilidade e mapeamento frágil "título da janela → workspace". Fica como
  complemento futuro.
- **Os dados já existem no disco**, verificados empiricamente nesta máquina (Claude Code 2.1.247):

### Fontes de dados (somente leitura — a extensão NUNCA escreve em `~/.claude`)

1. **Registro de sessões vivas**: `~/.claude/sessions/<pid>.json` — um arquivo por sessão em
   execução, removido quando a sessão morre. Campos relevantes (amostra real):

   ```json
   {"pid":14946,"sessionId":"4b4d5510-29f9-4118-9a7f-1228bf970280",
    "cwd":"/Users/danilouema/fas3","startedAt":1787919863411,
    "version":"2.1.247","kind":"interactive","entrypoint":"claude-vscode",
    "name":"fas3-02","nameSource":"derived"}
   ```

   O diretório também contém arquivos `*.key` (ignorar tudo que não é `.json`). Arquivos podem
   ficar órfãos se o processo morrer sem cleanup → sempre validar `pid` vivo.

2. **Transcript da sessão**: `~/.claude/projects/<slug>/<sessionId>.jsonl`, onde
   `slug = cwd.replace(/[^a-zA-Z0-9]/g, '-')`. Diretórios com caminho muito longo podem ser
   truncados + hash → fallback: varrer os subdiretórios de `projects/` procurando
   `<sessionId>.jsonl`. Linhas JSONL de interesse (podem aparecer várias vezes; **a última vence**):

   ```json
   {"type":"ai-title","sessionId":"…","aiTitle":"Azure function PDF nomes e páginas deslocados"}
   {"type":"last-prompt","lastPrompt":"abre um PR com essa correção e me dá a URL","leafUuid":"…"}
   ```

   O `mtime` do arquivo é a última atividade da sessão.

   **Risco assumido:** formato interno do Claude Code, pode mudar entre versões. Mitigação: todo
   o parsing fica isolado em `src/claude/` com tolerância a linhas/arquivos malformados;
   `claude agents --json` (CLI oficial) é fallback parcial documentado, não usado na v1.

## Decisões de design

| Decisão | Escolha | Por quê |
|---|---|---|
| Superfície principal | **WebviewView na sidebar do Explorer** | Sempre visível na área que o usuário já olha (Explorer aberto por padrão); cards multi-linha ricos; a view é arrastável para painel/sidebar secundária se o usuário preferir |
| Superfície secundária | **Status bar item** | Visível mesmo com sidebar fechada; clique foca a view |
| Título do card | último `ai-title` do transcript (fallback: `name` do registro, fallback: sessionId curto) | é o mesmo título que a extensão oficial mostra na aba |
| Descrição do card | último `last-prompt` (truncado) + tempo relativo do `mtime` | de graça, sempre atual; enriquecimento via hooks fica para v2 |
| Escopo da janela | sessão aparece se `cwd` da sessão está dentro (ou é igual a) alguma workspace folder da janela | mapeamento janela→sessões à prova de erro, resolve multi-root |
| Atualização | polling 3 s (com cache por `mtime`) + `fs.watch` no diretório `sessions/` como acelerador | pid vivo exige polling de qualquer forma; sem watcher por arquivo (simplicidade) |
| Interatividade v1 | nenhuma além de auto-update + comando "Atualizar" | YAGNI; não há API pública para focar uma sessão específica da extensão oficial |
| Webview sem JS | HTML re-renderizado a cada snapshot, `enableScripts: false` | menos superfície, sem protocolo de mensagens |

## Arquitetura

```
src/
  claude/            # camada de dados (Node puro, testável sem VSCode)
    model.ts         # tipos: RegistryEntry, TranscriptInfo, SessionCard
    registry.ts      # lê ~/.claude/sessions, valida pid, filtra por folders
    transcript.ts    # localiza e parseia o .jsonl (ai-title, last-prompt)
    monitor.ts       # orquestra: polling + watcher + cache -> snapshots
  ui/
    render.ts        # funções puras: HTML dos cards, texto/tooltip da status bar,
                     # escapeHtml, truncate, formatRelativeTime (pt-BR)
    sessionsView.ts  # WebviewViewProvider (casca fina sobre render.ts)
    statusBar.ts     # StatusBarItem (casca fina sobre render.ts)
  extension.ts       # activate(): liga monitor -> view + status bar
test/                # vitest, fixtures em diretórios temporários
```

Fluxo: `SessionMonitor` produz `SessionCard[]` ordenado por atividade → `SessionsViewProvider`
e `StatusBar` só renderizam. Toda lógica com regra de negócio é função pura ou classe com
dependências injetáveis (dirs e `aliveFn`) para TDD sem mock de VSCode.

## Fora de escopo (v1)

- Overlay fora do VSCode (Hammerspoon), descrição enriquecida via hooks, estado
  "trabalhando/aguardando", clicar no card para focar a sessão, publicação no marketplace,
  suporte a `CLAUDE_CONFIG_DIR` customizado, Windows/Linux (alvo: macOS, mas nada é
  macOS-specific além de paths padrão).

## Critérios de sucesso

1. Abrir qualquer janela VSCode com sessões Claude vivas → view "Sessões Claude" lista cada uma
   com título, último prompt e "há X min", em ≤ 3 s.
2. Janela multi-root (ex.: mono2 com 2 sessões) mostra as duas, separadas.
3. Sessão encerrada some da lista em ≤ 3 s; sessão nova aparece em ≤ 3 s.
4. Janela sem sessão mostra estado vazio; status bar some.
5. `npm test` (vitest + typecheck) verde; extensão instala via `.vsix` local.
