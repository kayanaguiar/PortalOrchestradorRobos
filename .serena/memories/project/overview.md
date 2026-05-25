# Portal RoboCommand - Visão Geral

## Stack
- **Frontend**: React 19 + Tailwind CSS 4 + Vite 8 + React Router + Motion
- **Backend**: Python FastAPI + httpx + uvicorn
- **Docker**: Nginx (frontend) + FastAPI (backend) + PostgreSQL (preparado)

## Rotas
- `/` — Dashboard (cards, robôs de todos os Releases, Robot Logs)
- `/robots` — Lista de robôs + detalhe com logs por execução + Novo Processo
- `/history` — Histórico de Jobs com filtro por data/status/robô
- `/triggers` — Gatilhos (criar, editar, habilitar/desabilitar)
- `/settings` — Configuração de Orchestrators, polling, processos arquivados

## Funcionalidades completas
- Dashboard baseado em Releases (todos os processos), enriquecido com Jobs
- Iniciar/Parar(SoftStop)/Encerrar(Kill) Jobs com confirmação
- Atualizar versão do processo via PATCH (compara versões, ignora AutoUpdate)
- Criar processo a partir de pacote do feed (/odata/Processes → POST /odata/Releases)
- Gatilhos: listar, criar, editar (nome, cron, timezone), habilitar/desabilitar
- Arquivar/desarquivar processos (optimistic update com useRef)
- Notificações: jobs faulted, assistants offline, orchestrators desconectados
- Toast de feedback, modal de confirmação, busca global
- Sidebar colapsável persistida, polling configurável
- Cache em memória TTL 5-10s + requests paralelos asyncio.gather
- Componentes reutilizáveis: DatePicker, TimezoneSelect, CustomSelect, ConfirmModal, Toast

## Decisões importantes
- NÃO usar mock, NÃO existe pause/resume, PATCH não PUT pra Releases
- PUT pra ProcessSchedules (SetEnable dá 405 no Cloud)
- SpecificPriorityValue deve ser removido do PUT quando JobPriority é null/Normal
- IsLatestVersion bugado, AutoUpdate=true ignora badge
- JobKey não filtrável no OData, Assistants offline por desaparecimento de session
- Busca de versões em endpoint separado (/api/processes/check-updates)
