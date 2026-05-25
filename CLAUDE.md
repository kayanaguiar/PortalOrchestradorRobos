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
    pages/            # Páginas lazy-loaded (RobotsPage, LogsPage, SettingsPage, TriggersPage, UsersPage, LoginPage)
    SortableRobotCard.jsx  # Wrapper drag-and-drop para RobotCard (@dnd-kit)
    ExpandableLog.jsx      # Log clicável: truncado → expandido
    DatePicker.jsx    # Calendário customizado com portal
    ConfirmModal.jsx  # Modal de confirmação para ações perigosas
    Toast.jsx         # Notificações temporárias
  hooks/              # useUiPathData.js (polling hooks)
  services/           # api.js (chamadas ao backend)
server/
  app.py              # FastAPI - proxy autenticado para UiPath
  uipath_auth.py      # Gerenciamento de tokens OAuth2
  cache.py            # Cache em memória com TTL
  orchestrator_store.py # CRUD de orchestrators (JSON)
  data/               # orchestrators.json, settings.json
```

## Rotas
- `/` — Dashboard (cards arrastáveis, ações em lote, order salva no localStorage)
- `/robots` — Robôs (lista + detalhe com logs por execução + polling automático)
- `/history` — Histórico de Jobs (filtro por data/status/robô)
- `/triggers` — Gatilhos (agendamentos e triggers do UiPath, criar/editar/excluir)
- `/audit` — Auditoria (admin only, histórico de quem fez o que)
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

### Frontend
- NÃO usar dados mock/fallback — apenas dados reais da API
- Loading progressivo: só espera health + jobs + logs. Resto carrega em background
- Páginas são lazy-loaded (React.lazy + Suspense) para code splitting
- Cards do dashboard arrastáveis (@dnd-kit), ordem salva no localStorage
- Logs truncados são expandíveis ao clicar (ExpandableLog.jsx)
- Notificações de erro são clicáveis → navega para o robô com VER LOGS
- Ações perigosas (Stop/Kill/Restart) pedem confirmação via modal
- Toast de feedback após ações (sucesso/erro)
- Sidebar colapsável persistida no localStorage
- Busca global funciona em todas as páginas

### UiPath API
- IsLatestVersion do /odata/Releases é BUGADO — comparar com GetProcessVersions
- AutoUpdate=true no Release = não mostrar badge de atualização
- PUT NÃO FUNCIONA em Releases — usar PATCH
- JobKey NÃO é filtrável no /odata/RobotLogs — filtrar por ProcessName e depois por JobKey no código
- Pause/Resume NÃO existe para Jobs comuns — só Stop (SoftStop/Kill)
- Assistants offline são detectados por DESAPARECIMENTO da session (não por State=Disconnected)
- StartJobs: Strategy "ModernJobsCount", RuntimeType "Unattended"
- Busca de versões em endpoint separado (/api/processes/check-updates) pra não bloquear

### Scopes necessários na External Application do UiPath
```
OR.Robots.Read OR.Jobs.Read OR.Jobs.Write OR.Folders.Read
OR.Audit.Read OR.Execution.Read OR.Execution.Write
OR.Monitoring.Read OR.Administration.Write
```
Tipo: Confidential, scopes em Application Scope (não User Scope)

## Variáveis de ambiente
- `UIPATH_TOKEN_URL` — URL de autenticação (default: cloud.uipath.com)
- `DATABASE_URL` — PostgreSQL (para Docker)
- `VITE_API_URL` — URL do backend se hospedado separado
