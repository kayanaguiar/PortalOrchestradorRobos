# RoboCommand

Portal web para monitorar e operar robôs (processos) hospedados em um ou mais **UiPath Orchestrators**. Substitui o uso direto da console do Orchestrator por uma interface centralizada, com autenticação, papéis, auditoria, operação em lote e gestão de Filas, Buckets e Assets — tudo funcionando com **múltiplos orchestrators em paralelo**.

> ⚠️ Projeto independente, sem vínculo com a UiPath. "UiPath" e "Orchestrator" são marcas de seus respectivos donos. Usa apenas as APIs públicas do Orchestrator.

## Stack

- **Frontend**: React 19 · Tailwind 4 · Vite 8 · React Router 7 · @dnd-kit · Motion · lucide-react
- **Backend**: Python 3.13 · FastAPI · httpx · SQLAlchemy · Alembic · PyJWT · bcrypt · slowapi · cryptography
- **Infra**: Docker Compose · Nginx (frontend + TLS) · PostgreSQL 17 · worker coletor de logs

## Features

### Monitoramento e operação
- **Dashboard** com cards arrastáveis (ordem persistida no localStorage), favoritos, ações em lote (start/stop/kill), busca global e **cards de resumo** de Filas / Buckets / Assets.
- **Notificações acumuladas**: jobs falhos, robôs sem execução no dia, assistants offline, orchestrators desconectados, gatilhos auto-desabilitados pelo UiPath e **filas com falhas do dia**. Aparecem e somem sozinhas conforme a situação se resolve.
- **Detalhe do robô** lista todos os jobs ativos (Running + Pending) com botões individuais — pare o que está rodando sem cancelar a fila. Logs por execução carregados sob demanda.
- **Histórico** completo de jobs com filtro por data, status e robô.

### Recursos do Orchestrator
- **Filas** (`/queues`): CRUD de QueueDefinitions + transações (ver por status, adicionar item, reprocessar, excluir), com **busca por referência e paginação**, painel de detalhes da fila/transação e **atualização ao vivo** enquanto a fila anda.
- **Buckets** (`/buckets`): CRUD de Storage Buckets + arquivos (listar recursivo, **upload**, **download**, excluir) via URIs pré-assinados proxiados pelo backend.
- **Assets** (`/assets`): CRUD dos 4 tipos (Text/Integer/Bool/Credential). Senha de credencial é **write-only** (nunca volta na leitura).
- **Gatilhos** (`/triggers`): listar, habilitar/desabilitar, criar, editar, excluir. **Detecta quando o UiPath desabilita um gatilho sozinho** (fila estourada) e avisa.
- Filas, Buckets e Assets são **cross-folder**: enumeram os folders de cada orchestrator e agregam tudo.

### Administração
- **Auditoria** (admin): histórico filtrável por usuário, ação, robô e intervalo de datas.
- **Usuários** (admin): CRUD com soft delete — usuários são inativados, nunca removidos.
- **Configurações**: cadastro de orchestrators por usuário (admin pode compartilhar), intervalo de polling, processos arquivados e um guia embutido **"Como conectar?"**.

### Plataforma
- **Multi-orchestrator** com requests em paralelo (`asyncio.gather`), timeout de 30s e cache em memória (TTL 5–20s).
- **Negociação de scopes por orchestrator**: o portal pede o conjunto ideal e cai automaticamente pro que cada External Application aceita — um orchestrator sem o scope de Filas/Buckets/Assets **não quebra** os demais, e passa a ser reconhecido sozinho quando o scope é adicionado.
- **Client Secrets criptografados em repouso** no Postgres (Fernet).
- **Sessão JWT renovada automaticamente** a cada 12h.
- **Tema** claro/escuro, layout **totalmente responsivo**, sidebar colapsável.

## Quick start

### Docker (recomendado)

```bash
cp .env.example .env
# edite .env: defina DB_PASSWORD e um JWT_SECRET forte (>= 32 chars)
docker compose up --build -d
```

Acesse:
- HTTP: `http://localhost:9090`
- HTTPS: `https://localhost` (certificados em `./certs/`)

**Login padrão** (criado no primeiro boot): `admin@robocommand.com` / `admin123` — **troque a senha imediatamente** em produção.

### Desenvolvimento local

```bash
# Terminal 1 — backend (precisa de um Postgres e JWT_SECRET no ambiente)
cd server && pip install -r requirements.txt && python app.py

# Terminal 2 — frontend
npm install && npm run dev
```

Frontend em `http://localhost:5173`, backend em `http://localhost:3001`.

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `JWT_SECRET` | backend | **Obrigatório, mínimo 32 caracteres.** O backend recusa subir se vazio, curto ou igual ao placeholder. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `SECRET_ENCRYPTION_KEY` | backend | Opcional. Chave pra criptografar os Client Secrets no banco. Se ausente, é derivada do `JWT_SECRET`. Defina uma dedicada se pretende rotacionar o `JWT_SECRET` sem reinserir os secrets |
| `UIPATH_TOKEN_URL` | backend | URL OAuth2 do UiPath (default: `https://cloud.uipath.com/identity_/connect/token`) |
| `DB_PASSWORD` | db + backend | Senha do Postgres |
| `DATABASE_URL` | backend + collector | URL de conexão Postgres (o Docker monta automaticamente) |
| `VITE_API_URL` | frontend (opcional) | URL do backend, só se hospedado em domínio diferente |
| `LOG_COLLECTOR_INTERVAL` | collector | Intervalo da coleta de logs em segundos (default: `120`) |
| `LOG_RETENTION_DAYS` | collector | Dias de retenção dos logs arquivados (default: `180`) |

> **Não commite segredos.** `.env`, `certs/` e `server/data/*.json` (que podem conter credenciais) devem ficar fora do controle de versão.

## Configuração no UiPath

Crie uma **External Application** do tipo **Confidential**, com os scopes em **Application Scope** (não User Scope):

```
OR.Robots.Read      OR.Jobs.Read        OR.Jobs.Write       OR.Folders.Read
OR.Audit.Read       OR.Execution.Read   OR.Execution.Write  OR.Monitoring.Read
OR.Administration.Write   OR.Queues     OR.Buckets          OR.Assets
```

- `OR.Queues`, `OR.Buckets` e `OR.Assets` são **opcionais** — sem eles, as telas correspondentes ficam indisponíveis só naquele orchestrator (os demais seguem normais), graças à negociação de scopes.
- O portal tem o passo a passo completo embutido: **Configurações → "Como conectar?"** (criar a app, copiar cada scope individualmente, e de onde tirar URL Base, Folder ID, Client ID e Client Secret).

## Roles

| Role | Permissões |
|---|---|
| `admin` | Tudo + gerenciar usuários + auditoria + compartilhar orchestrators |
| `operator` | Operar robôs e CRUD de Filas/Buckets/Assets + gerenciar seus orchestrators |
| `viewer` | Apenas leitura |

## Arquitetura

```
src/
  components/
    pages/                  Páginas lazy-loaded: Robots, Logs, Triggers, Queues, Buckets, Assets, Audit, Users, Settings, Login
    ResourceCards.jsx       Cards de resumo (Filas/Buckets/Assets) do dashboard
    SortableRobotCard.jsx   Wrapper drag-and-drop do RobotCard
    CustomSelect.jsx        Select padrão; DatePicker, ConfirmModal, Toast, ExpandableLog
  hooks/useUiPathData.js    Polling hooks (jobs, logs, processes, sessions, health, triggers, queues summary)
  services/api.js           Cliente do backend (refresh de token automático)

server/
  app.py                    FastAPI — proxy autenticado para UiPath (leitura híbrida de logs, cross-folder)
  auth.py                   JWT + bcrypt + dependências de role (valida JWT_SECRET no boot)
  uipath_auth.py            Tokens OAuth2 com cache + negociação de scopes por orchestrator
  crypto_util.py            Criptografia dos Client Secrets (Fernet)
  cache.py                  Cache em memória com TTL
  database.py               SQLAlchemy session + Base
  log_collector.py          Worker que arquiva os logs do UiPath no Postgres (container próprio)
  models.py                 User, Orchestrator, SharedOrchestrator, Setting, ArchivedProcess, AuditLog, RobotLog
  orchestrator_store.py     Helpers de orchestrators (DB)
  seed.py / alembic/        Bootstrap inicial e migrações
  tests/                    Suite pytest (mocka UiPath e banco)
```

O `docker-compose.yml` sobe 4 serviços: **db** (Postgres), **backend** (FastAPI), **collector** (worker de logs) e **frontend** (Nginx servindo o build + TLS).

## Arquivamento de logs

A busca de logs antigos direto no UiPath é lenta (timeout). Um container **`collector`** copia os logs pro Postgres:

- A cada `LOG_COLLECTOR_INTERVAL` (120s), busca de cada orchestrator os logs novos desde a última coleta (marca d'água por orchestrator) e grava em `robot_logs`, ignorando duplicados pelo `Id`.
- **Leitura por estado, não só por data**: `/api/logs` serve **dias anteriores** e **jobs já finalizados há alguns minutos** (logs imutáveis) do Postgres — instantâneo; job **rodando ou recém-terminado** vem ao vivo do UiPath. Sempre com **fallback** pro UiPath se o banco ainda não tiver os logs.
- **Retenção**: logs com mais de `LOG_RETENTION_DAYS` são apagados 1x/dia. A marca d'água persiste, então após restart o coletor retoma de onde parou.

## Testes

Suite de testes do backend (mocka UiPath e banco — não precisa de Postgres nem rede):

```bash
docker compose run --rm --no-deps backend sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q"
```

Cobre a negociação de scopes, a criptografia de secrets, os helpers de parsing/folder/logs, o cache e endpoints-chave (agregação cross-folder, filtro de transações, healthcheck).

## Segurança

- `JWT_SECRET` validado no boot (recusa subir com valor fraco).
- **Client Secrets criptografados no banco** (Fernet); a API nunca devolve o secret em claro (mascara com `••••••••`).
- Rate limiting nos endpoints de login e ações (slowapi).
- Papéis (`admin`/`operator`/`viewer`) aplicados no backend via dependências.
- Usuários **inativados**, nunca excluídos (preserva auditoria).
- Healthcheck público em `/api/ping` (sem auth); todo o resto exige JWT.

## Idiossincrasias do UiPath (workarounds)

- `IsLatestVersion` do `/odata/Releases` é bugado — comparar com `GetProcessVersions`.
- `PUT` não funciona em Releases — usar `PATCH`.
- `JobKey` não é filtrável em `/odata/RobotLogs` — filtrar por `ProcessName` e depois por `JobKey` no código.
- `QueueItems` **não permite `$orderby`/`$filter` por data** — ordenar por `Id desc`; métricas "de hoje" vêm de `RetrieveLastDaysProcessingRecords`.
- Actions de arquivo de Bucket recebem parâmetros via **query string** (`GetFiles?directory=/&recursive=true`, etc.), não inline no path.
- Recursos são **folder-scoped**: Filas/Buckets/Assets exigem enumerar folders e consultar por folder.
- Assistant offline é detectado por desaparecimento da session, não por `State=Disconnected`.
- Pause/Resume não existe para jobs comuns — só `SoftStop` ou `Kill`.

## Princípios do projeto

- **Sem mock**: somente dados reais do UiPath.
- **Cache invalidado após qualquer ação** (start/stop/update/CRUD).
- **Loading progressivo**: a tela só espera `health + jobs + logs`; o resto carrega em background.
- **Ações destrutivas confirmam** antes de executar.
- **Multi-orchestrator paralelo**, sempre com fallback quando um orchestrator falha.

## Contribuindo

Contribuições são bem-vindas. Abra uma issue descrevendo o bug/feature antes de um PR grande. Rode os testes do backend antes de enviar (`pytest`). Mantenha o padrão do código existente (sem mock, backend em Python/FastAPI, frontend em JSX).

## Licença

[MIT](LICENSE) © KayanAguiar
