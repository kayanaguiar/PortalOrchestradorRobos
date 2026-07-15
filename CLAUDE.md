# RoboCommand - Portal Orchestrador de Robôs UiPath

## Stack
- **Frontend**: React 19 + Tailwind CSS 4 + Vite 8 + React Router + Motion + @dnd-kit
- **Backend**: Python FastAPI + httpx + uvicorn
- **Docker**: Nginx (frontend) + FastAPI (backend) + PostgreSQL + **collector** (worker de logs)
- **Linguagem**: JavaScript (JSX) no frontend, Python no backend

## Como rodar

### Dev local (2 terminais)
```bash
# Terminal 1 - Backend
cd server && pip install -r requirements.txt && python app.py

# Terminal 2 - Frontend
npm install && npm run dev
```
Acessa http://localhost:5173

### Docker
```bash
docker compose up --build
```
Acessa http://localhost

### Testes (backend, pytest)
```bash
# Roda num container efêmero (não sobe db, não afeta o ambiente rodando)
docker compose run --rm --no-deps backend sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q"
```
Testes em `server/tests/` — mockam UiPath e banco (não precisam de Postgres nem rede). Cobrem: negociação de scopes (`uipath_auth`), helpers de parsing/folder/headers, cache, e endpoints (`/api/ping`, `/api/queues` agregação cross-folder + `failed`, montagem do `$filter` de transações). Deps de teste em `requirements-dev.txt` (fora da imagem de produção).

## Estrutura do projeto
```
src/
  components/         # Componentes React
    pages/            # Páginas lazy-loaded (RobotsPage, LogsPage, SettingsPage, TriggersPage, UsersPage, LoginPage, AuditPage)
    SortableRobotCard.jsx  # Wrapper drag-and-drop para RobotCard (@dnd-kit)
    ExpandableLog.jsx      # Log clicável: truncado → expandido
    DatePicker.jsx    # Calendário customizado com portal (aceita valor vazio + min/max + clearable)
    CustomSelect.jsx  # Select padrão do projeto (usado em todos os filtros)
    ConfirmModal.jsx  # Modal de confirmação para ações perigosas
    Toast.jsx         # Notificações temporárias
  hooks/              # useUiPathData.js (polling hooks: logs, jobs, processes, sessions, health, triggers)
  services/           # api.js (chamadas ao backend, refresh token automático)
server/
  app.py              # FastAPI - proxy autenticado para UiPath
  auth.py             # JWT + bcrypt + validação de secret no boot
  uipath_auth.py      # Gerenciamento de tokens OAuth2
  cache.py            # Cache em memória com TTL
  orchestrator_store.py # CRUD de orchestrators (DB via SQLAlchemy)
  log_collector.py    # Worker que arquiva RobotLogs do UiPath no Postgres (container separado)
  models.py           # User, Orchestrator, SharedOrchestrator, Setting, ArchivedProcess, AuditLog, RobotLog
  data/               # orchestrators.json, settings.json (legado, hoje usa Postgres)
  alembic/            # Migrações do banco
```

## Rotas
- `/` — Dashboard (cards arrastáveis, ações em lote, order salva no localStorage)
- `/robots` — Robôs (lista + detalhe com **jobs ativos** Running+Pending listados separadamente + logs por execução + polling)
- `/history` — Histórico de Jobs (filtro por data/status/robô, filtros viram cards no mobile)
- `/triggers` — Gatilhos (agendamentos e triggers do UiPath, criar/editar/excluir)
- `/queues` — Filas (CRUD de QueueDefinitions + transações QueueItems: ver por status, adicionar/retry/excluir item). Retry = clona SpecificContent num novo item (UiPath não expõe retry por item). Requer scope `OR.Queues` (parent autoriza leitura+escrita)
- `/buckets` — Buckets (CRUD de Storage Buckets + arquivos: listar/upload/download/excluir). Upload/download passam pelos URIs pré-assinados (GetWriteUri/GetReadUri) proxiados pelo backend. Actions de arquivo usam params via query string. Requer scope `OR.Buckets`
- `/assets` — Assets (CRUD dos 4 tipos: Text/Integer/Bool/Credential; escopo Global ou PerRobot). Senha de credencial é write-only (não volta na leitura). Valores por-robô não editáveis nesta versão. Requer scope `OR.Assets`
- `/audit` — Auditoria (admin only, histórico filtrável por usuário/ação/robô/datas)
- `/users` — Usuários (admin only)
- `/settings` — Configurações de Orchestrators e polling (botão salvar fixo no rodapé)

## Regras importantes

### Backend
- NÃO usar Node/Express — backend é Python/FastAPI
- Cache em memória (TTL 5-10s) em todos os endpoints de leitura
- Requests para orchestrators SEMPRE em paralelo (asyncio.gather)
- Timeout de 30s em todos os httpx clients
- Respostas POST/PATCH do UiPath podem ter body vazio — tratar com `not response.content`
- Limpar cache após ações (start/stop/update)
- **`request_all_orchestrators_with_status`**: usar quando precisar distinguir "vazio porque vazio" de "vazio porque deu erro" (já usado em `/api/sessions`)
- **JWT_SECRET validado no boot**: backend recusa subir com valor vazio, placeholder ou < 32 chars
- **Client Secrets criptografados em repouso**: `crypto_util.py` (Fernet, chave derivada do `JWT_SECRET` ou do `SECRET_ENCRYPTION_KEY`). Cripto acontece só na fronteira do banco — `Orchestrator.from_dict` encripta ao gravar, `to_dict` decripta ao ler (prefixo `enc:`); o resto do código sempre vê texto puro. Valores sem prefixo = legado (texto puro) tratado de forma transparente. Migração idempotente no `entrypoint.sh` (`encrypt_existing_secrets`) encripta o que estava em texto puro
- **Healthcheck público em `/api/ping`** (sem auth) — usado pelo Docker healthcheck
- **Refresh de token**: `POST /api/auth/refresh` emite novo JWT a partir de um válido (usado pelo frontend a cada 12h)
- **Snapshots in-memory** (`_previous_online_assistants`, `_previous_enabled_triggers`, `_manually_disabled_triggers`): cuidado com `--workers > 1` no uvicorn, cada worker tem seu snapshot

### Arquivamento de logs (resolve "buscar logs antigos não carrega")
- **Problema**: `/api/logs` consultava `/odata/RobotLogs` ao vivo; logs antigos batiam no timeout de 30s
- **`log_collector.py`** roda em **container separado** (`collector` no compose): a cada `LOG_COLLECTOR_INTERVAL` (120s) busca os logs novos de cada orchestrator e grava na tabela `robot_logs`
- **Marca d'água por orchestrator** em `settings` (`log_watermark:{orchestrator_id}`) = timestamp do último log coletado. Persiste no Postgres → após pausa/restart, retoma de onde parou (recupera o gap, desde que o UiPath ainda retenha)
- **Começa do zero**: no primeiro boot de cada orchestrator a marca é fixada em "agora" — não importa histórico antigo
- **Idempotência**: insere com `ON CONFLICT (id) DO NOTHING` usando o `Id` do log do UiPath como PK
- **Retenção**: 1x/dia apaga logs com mais de `LOG_RETENTION_DAYS` (180)
- **Leitura híbrida em `/api/logs` — por ESTADO, não só por data**: dias anteriores → Postgres; **job já finalizado há > 2 ciclos do coletor** (frontend passa `job_ended_at`) → Postgres **mesmo sendo de hoje** (logs de job terminado são imutáveis); job rodando / recém-terminado / feed ao vivo → UiPath. Sempre com **fallback** pro UiPath se o banco ainda não tiver os logs. Helpers: `_parse_log_filter`, `_is_historical`, `_job_finished_and_collected`. Frontend (`RobotsPage`/`LogsPage`) passa `jobEndedAt` só quando o job não está Running/Pending
- O **collector espera `backend` ficar healthy** (depends_on) pra garantir que a migração já criou a tabela

### Frontend
- NÃO usar dados mock/fallback — apenas dados reais da API
- Loading progressivo: só espera health + jobs + logs. Resto carrega em background
- Páginas são lazy-loaded (React.lazy + Suspense) para code splitting
- Cards do dashboard arrastáveis (@dnd-kit), ordem salva no localStorage
- Logs truncados são expandíveis ao clicar (ExpandableLog.jsx)
- Notificações clicáveis → `notif.robotId` navega pra robô, `notif.link` navega pra página
- Notificações de orchestrator desconectado só disparam após **2 falhas consecutivas** (filtra timeout pontual)
- Ações perigosas (Stop/Kill/Restart) pedem confirmação via modal
- Toast de feedback após ações (sucesso/erro)
- Sidebar colapsável persistida no localStorage, com badge de robôs offline no item "Robôs"
- Busca global funciona em todas as páginas
- **Refresh JWT automático** a cada 12h via `refreshToken()`; falha → logout
- **CustomSelect** é o select padrão (todos os filtros usam — `/triggers`, `/audit`, `/history`)
- **Todas as telas adaptadas pra mobile**: grids viram stack vertical, tabelas viram cards, botões empilham, painel de notificações ocupa quase toda a tela
- **Status `inactive` = "Offline"** com cor `status-offline` (roxo) e ícone `WifiOff` — distinto de "Parado"
- Detalhe do robô lista **todos os jobs ativos** (Running + Pending) com botões individuais; `buildRobots` prioriza Running > Pending na seleção do job principal
- **Guia "Como conectar?"** na `/settings`: botão abre modal com passo a passo da External Application do UiPath + mapeamento dos 5 campos (Nome, URL Base OData, Folder ID, Client ID, Client Secret) + botão pra copiar os scopes

### UiPath API
- IsLatestVersion do /odata/Releases é BUGADO — comparar com GetProcessVersions
- AutoUpdate=true no Release = não mostrar badge de atualização
- PUT NÃO FUNCIONA em Releases — usar PATCH
- JobKey NÃO é filtrável no /odata/RobotLogs — filtrar por ProcessName e depois por JobKey no código
- Pause/Resume NÃO existe para Jobs comuns — só Stop (SoftStop/Kill)
- Assistants offline são detectados por DESAPARECIMENTO da session (não por State=Disconnected)
- StartJobs: Strategy "ModernJobsCount", RuntimeType "Unattended"
- Busca de versões em endpoint separado (/api/processes/check-updates) pra não bloquear
- **Gatilho auto-desabilitado pelo UiPath**: quando a fila estoura, o UiPath desabilita sozinho. O portal detecta por transição `Enabled: true → false` que não foi feita via `/api/triggers/set-enable`. Lista vai em `autoDisabled` do `/api/triggers` e dispara notificação amarela clicável.

### Scopes necessários na External Application do UiPath
```
OR.Robots.Read OR.Jobs.Read OR.Jobs.Write OR.Folders.Read
OR.Audit.Read OR.Execution.Read OR.Execution.Write
OR.Monitoring.Read OR.Administration.Write
OR.Queues OR.Buckets OR.Assets
```
Tipo: Confidential, scopes em Application Scope (não User Scope).
O mesmo passo a passo está disponível no portal: `/settings` → botão **"Como conectar?"**.

## Variáveis de ambiente
- `UIPATH_TOKEN_URL` — URL de autenticação (default: cloud.uipath.com)
- `JWT_SECRET` — **OBRIGATÓRIO**, >= 32 chars, não pode ser `TROQUE_AQUI`. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- `SECRET_ENCRYPTION_KEY` — **opcional**. Chave usada pra criptografar os Client Secrets dos orchestrators no banco. Se não definida, é derivada do `JWT_SECRET`. Defina uma dedicada se quiser rotacionar o JWT_SECRET sem perder os secrets (trocar essa chave torna os secrets já gravados ilegíveis → precisam ser reinseridos)
- `DB_PASSWORD` — senha do Postgres
- `DATABASE_URL` — PostgreSQL (para Docker)
- `VITE_API_URL` — URL do backend se hospedado separado
- `LOG_COLLECTOR_INTERVAL` — intervalo do coletor de logs em segundos (default: 120)
- `LOG_RETENTION_DAYS` — dias de retenção dos logs arquivados (default: 180)
