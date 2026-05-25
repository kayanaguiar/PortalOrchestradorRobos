# Bug fix: Job Running escondido após cancelar Pending

## Problema
Quando um gatilho cria um novo job Pending enquanto outro job já está Running, e o usuario cancela o Pending, o card mostrava status "Stopped" (do Pending cancelado) em vez do "Running" que ainda estava ativo. Isso porque buildRobots em App.jsx pegava o job mais recente por CreationTime, e o Pending cancelado era mais recente.

## Correção
Em buildRobots (App.jsx), a seleção do "latest job" agora prioriza jobs ativos (Running/Pending) sobre finalizados (Stopped/Successful/Faulted). Só entre jobs de mesma prioridade pega o mais recente por CreationTime.

## Código
```javascript
const activeStates = new Set(["Running", "Pending"]);
// Job ativo sempre prevalece sobre finalizado
if (jobIsActive && !existingIsActive) {
  latestJobByProcess[key] = job;
} else if (jobIsActive === existingIsActive && ...) {
  // Mesma prioridade: pega o mais recente
}
```

## Data
2026-04-14
