# RoboCommand

Portal web para monitorar e operar robôs (processos) hospedados em um ou mais **UiPath Orchestrators**. Substitui o uso direto da console do Orchestrator por uma interface centralizada, com autenticação, papéis, auditoria e operação em lote.

## Stack

- **Frontend**: React 19 · Tailwind 4 · Vite 8 · React Router 7 · @dnd-kit · Motion · lucide-react
- **Backend**: Python 3.13 · FastAPI · httpx · SQLAlchemy · Alembic · PyJWT · bcrypt · slowapi
- **Infra**: Docker Compose · Nginx (frontend + TLS) · PostgreSQL 17

## Features principais

- **Dashboard** com cards arrastáveis (ordem persistida no localStorage), favoritos, ações em lote (start/stop/kill), busca global, contador de robôs offline na sidebar e notificações acumuladas (jobs falhos, robôs ociosos, assistants offline, orchestrators desconectados, gatilhos auto-desabilitados).
- **Detalhe do robô** lista todos os jobs ativos (Running + Pending) com botões individuais — pare o que está rodando sem precisar cancelar a fila. Execuções do dia e logs expandíveis carregados sob demanda.
- **Histórico** completo de jobs com filtro por data, status e robô.
- **Gatilhos**: listar, habilitar/desabilitar, criar, editar e excluir. **Detecta automaticamente quando o UiPath desabilita um gatilho sozinho** (geralmente: fila estourada) e avisa via notificação clicável.
- **Auditoria** (admin): histórico filtrável por usuário, ação, robô e intervalo de datas.
- **Usuários** (admin): CRUD com soft delete — usuários são inativados, nunca removidos.
- **Configurações**: cadastro de orchestrators por usuário (admin pode compartilhar), intervalo de polling e processos arquivados.
- **Multi-orchestrator**: cada usuário gerencia o seu conjunto; requests em paralelo via `asyncio.gather`. Detector de offline resiliente a falhas de rede (só reporta quando o orchestrator responde).
- **Sessão JWT renovada automaticamente** a cada 12h — usuário fica conectado entre dias sem precisar relogar.
- **Tema** claro/escuro, layout **totalmente responsivo** (todas as telas adaptadas pra mobile), sidebar colapsável.

## Quick start

### Docker (recomendado)

```bash
cp .env.example .env
# edite .env e defina DB_PASSWORD e JWT_SECRET
docker compose up --build -d
```

Acesse:
- HTTP: `http://localhost:9090`
- HTTPS: `https://localhost` (certificados em `./certs/`)

Login padrão na primeira execução: cadastrado pelo seeder com role `admin` (verifique `server/seed.py`).

### Desenvolvimento local

Em dois terminais:

```bash
# Terminal 1 — backend
cd server
pip install -r requirements.txt
python app.py
```

```bash
# Terminal 2 — frontend
npm install
npm run dev
```

Frontend em `http://localhost:5173`, backend em `http://localhost:3001`.

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `UIPATH_TOKEN_URL` | backend | URL OAuth2 do UiPath (default: `https://cloud.uipath.com/identity_/connect/token`) |
| `JWT_SECRET` | backend | **Obrigatório, mínimo 32 caracteres.** Backend recusa o boot se vazio ou igual ao placeholder do `.env.example`. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DB_PASSWORD` | db + backend | Senha do Postgres |
| `DATABASE_URL` | backend | URL de conexão Postgres (Docker monta automaticamente) |
| `VITE_API_URL` | frontend (opcional) | URL do backend, só necessária se hospedado em domínio diferente |

## Estrutura

```
src/
  components/
    pages/                  Páginas lazy-loaded (Robots, Logs, Triggers, Audit, Users, Settings, Login)
    SortableRobotCard.jsx   Wrapper drag-and-drop do RobotCard
    ExpandableLog.jsx       Log truncado clicável
    DatePicker.jsx          Calendário customizado com portal
    ConfirmModal.jsx        Confirmação para ações destrutivas
    Toast.jsx               Notificações temporárias
  hooks/
    useUiPathData.js        Polling hooks (jobs, logs, processes, sessions, health)
    useMediaQuery.js        Detecção de breakpoints
  services/
    api.js                  Cliente do backend

server/
  app.py                    FastAPI — proxy autenticado para UiPath
  auth.py                   JWT + bcrypt + dependências de role
  uipath_auth.py            Gerenciamento de tokens OAuth2 (com cache)
  cache.py                  Cache em memória com TTL
  database.py               SQLAlchemy session + Base
  models.py                 Modelos: User, Orchestrator, SharedOrchestrator, Setting, ArchivedProcess, AuditLog
  orchestrator_store.py     Helpers de orchestrators (DB)
  seed.py                   Bootstrap inicial (admin, dados de exemplo)
  alembic/                  Migrações
```

## Configuração no UiPath

### Scopes necessários (External Application)

```
OR.Robots.Read       OR.Jobs.Read         OR.Jobs.Write
OR.Folders.Read      OR.Audit.Read        OR.Execution.Read
OR.Execution.Write   OR.Monitoring.Read   OR.Administration.Write
```

Tipo: **Confidential**, scopes em **Application Scope** (não User Scope).

## Roles

| Role | Permissões |
|---|---|
| `admin` | Tudo + gerenciar usuários + ver auditoria + compartilhar orchestrators |
| `operator` | Operar robôs (start/stop/kill/cancel/restart/update) e gerenciar seus orchestrators |
| `viewer` | Apenas leitura |

## Notas operacionais (idiossincrasias do UiPath)

- **`IsLatestVersion`** do `/odata/Releases` é bugado — comparar com `GetProcessVersions` (endpoint dedicado em `/api/processes/check-updates`).
- **`PUT` não funciona em Releases** — usar `PATCH`.
- **`JobKey` não é filtrável** em `/odata/RobotLogs` — filtrar por `ProcessName` e depois por `JobKey` no código.
- **Assistant offline** é detectado por desaparecimento da session, não por `State=Disconnected`.
- **Pause/Resume** não existe para jobs comuns — só `SoftStop` ou `Kill`.
- **StartJobs**: usar `Strategy: "ModernJobsCount"` e `RuntimeType: "Unattended"`.

## Princípios do projeto

- **Sem mock**: somente dados reais do UiPath. Nenhum fallback fake.
- **Cache invalidado após qualquer ação** (start/stop/update).
- **Loading progressivo**: a tela só espera `health + jobs + logs`. O resto carrega em background.
- **Ações destrutivas confirmam** via `ConfirmModal` antes de executar.
- **Multi-orchestrator paralelo**: requests sempre via `asyncio.gather`, timeout de 30s.

## Licença

Privado.
