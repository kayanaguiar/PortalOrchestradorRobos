# RoboCommand - Portal Orchestrador de Robôs UiPath

## Stack
- **Frontend**: React 19 + Tailwind CSS 4 + Vite 8 + React Router + Motion + @dnd-kit
- **Backend**: Python FastAPI + httpx + uvicorn
- **Docker**: Nginx (frontend) + FastAPI (backend) + PostgreSQL (preparado)
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
  models.py           # User, Orchestrator, SharedOrchestrator, Setting, ArchivedProcess, AuditLog
  data/               # orchestrators.json, settings.json (legado, hoje usa Postgres)
  alembic/            # Migrações do banco
```

## Rotas
- `/` — Dashboard (cards arrastáveis, ações em lote, order salva no localStorage)
- `/robots` — Robôs (lista + detalhe com **jobs ativos** Running+Pending listados separadamente + logs por execução + polling)
- `/history` — Histórico de Jobs (filtro por data/status/robô, filtros viram cards no mobile)
- `/triggers` — Gatilhos (agendamentos e triggers do UiPath, criar/editar/excluir)
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
- **Healthcheck público em `/api/ping`** (sem auth) — usado pelo Docker healthcheck
- **Refresh de token**: `POST /api/auth/refresh` emite novo JWT a partir de um válido (usado pelo frontend a cada 12h)
- **Snapshots in-memory** (`_previous_online_assistants`, `_previous_enabled_triggers`, `_manually_disabled_triggers`): cuidado com `--workers > 1` no uvicorn, cada worker tem seu snapshot

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
```
Tipo: Confidential, scopes em Application Scope (não User Scope)

## Variáveis de ambiente
- `UIPATH_TOKEN_URL` — URL de autenticação (default: cloud.uipath.com)
- `JWT_SECRET` — **OBRIGATÓRIO**, >= 32 chars, não pode ser `TROQUE_AQUI`. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- `DB_PASSWORD` — senha do Postgres
- `DATABASE_URL` — PostgreSQL (para Docker)
- `VITE_API_URL` — URL do backend se hospedado separado
