# UiPath Orchestrator API - Referência

## Autenticação
- POST https://cloud.uipath.com/identity_/connect/token (client_credentials)
- Scopes: OR.Robots.Read OR.Jobs.Read OR.Jobs.Write OR.Folders.Read OR.Audit.Read OR.Execution.Read OR.Execution.Write OR.Monitoring.Read OR.Administration.Write
- External Application: Confidential, Application Scope
- Token expira em 3600s, cache com 5min margem
- Reiniciar servidor ao adicionar novos scopes

## Orchestrators
- Moreno RP: morenorp/DefaultTenant, folderId=7602685
- Raizen RP: iaraiuaaitf/DefaultTenant, folderId=5430033
- Folder ID = fid= na URL do Orchestrator

## GET
- /odata/RobotLogs — filtrável por ProcessName, TimeStamp. NÃO por JobKey
- /odata/Jobs — States: Running, Pending, Successful, Stopped, Faulted
- /odata/Releases — IsLatestVersion BUGADO. AutoUpdate = update automático
- /odata/Sessions — Assistants que caem SOMEM da lista
- /odata/ProcessSchedules — triggers/gatilhos com Enabled, cron, próxima execução
- /odata/Processes/UiPath.Server.Configuration.OData.GetProcessVersions(processId='NOME')

## POST
- StartJobs: Strategy "ModernJobsCount", RuntimeType "Unattended"
- StopJobs: { jobIds: [id], strategy: "SoftStop" ou "Kill" }
- ProcessSchedules/SetEnable: { enabled: bool, scheduleIds: [id] }
- Respostas POST/PATCH podem ter body vazio

## PATCH
- PATCH /odata/Releases({id}) com { "ProcessVersion": "x.y.z" }
- PUT NÃO FUNCIONA, só PATCH

## Performance
- Cache TTL 5-10s no backend
- asyncio.gather pra requests paralelos
- Timeout 30s em httpx clients
