const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(endpoint, params = {}) {
  const url = new URL(endpoint, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url, { headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
    throw new Error("Sessão expirada");
  }
  if (res.status === 403) {
    throw new Error("Sem permissão para esta ação");
  }
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function postRequest(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
    throw new Error("Sessão expirada");
  }
  if (res.status === 403) {
    const detail = await res.json().catch(() => ({ detail: "Sem permissão" }));
    throw new Error(detail.detail || "Sem permissão para esta ação");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json();
}

async function putRequest(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
    throw new Error("Sessão expirada");
  }
  if (res.status === 403) {
    const detail = await res.json().catch(() => ({ detail: "Sem permissão" }));
    throw new Error(detail.detail || "Sem permissão para esta ação");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json();
}

async function deleteRequest(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
    throw new Error("Sessão expirada");
  }
  if (res.status === 403) {
    const detail = await res.json().catch(() => ({ detail: "Sem permissão" }));
    throw new Error(detail.detail || "Sem permissão para esta ação");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json();
}

// ─── Auth ────────────────────────────────────────

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: "Erro ao fazer login" }));
    throw new Error(detail.detail || "Credenciais inválidas");
  }
  const data = await res.json();
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  return data;
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export async function refreshToken() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Falha ao renovar sessão");
  const data = await res.json();
  localStorage.setItem("token", data.token);
  return data.token;
}

export function getStoredUser() {
  const user = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (!user || !token) return null;
  return JSON.parse(user);
}

// ─── Logs ────────────────────────────────────────

export async function fetchLogs({ top = 50, skip = 0, filter, orderby, orchestratorId, jobEndedAt } = {}) {
  return request(`${API_BASE}/logs`, {
    "$top": top,
    "$skip": skip,
    "$filter": filter,
    "$orderby": orderby,
    orchestrator_id: orchestratorId,
    job_ended_at: jobEndedAt,
  });
}

// ─── Jobs ────────────────────────────────────────

export async function fetchJobs({ top = 100, filter } = {}) {
  return request(`${API_BASE}/jobs`, {
    "$top": top,
    "$filter": filter,
  });
}

export async function fetchLogsByJob(jobKey, processName) {
  const params = {};
  if (processName) params.process_name = processName;
  return request(`${API_BASE}/logs/job/${jobKey}`, params);
}

// ─── Job Actions ────────────────────────────────

export async function startJob(orchestratorId, releaseKey, robotName = null) {
  return postRequest("/jobs/start", { orchestratorId, releaseKey, robotName });
}

export async function stopJob(orchestratorId, jobId, strategy = "SoftStop", robotName = null, actionType = null) {
  return postRequest("/jobs/stop", { orchestratorId, jobId, strategy, robotName, actionType });
}

export async function resumeJob(orchestratorId, jobId) {
  return postRequest("/jobs/resume", { orchestratorId, jobId });
}

export async function fetchProcessUpdates() {
  return request(`${API_BASE}/processes/check-updates`);
}

// ─── Process Versions ────────────────────────────

export async function fetchProcessVersions(processId, orchestratorId) {
  return request(`${API_BASE}/processes/${encodeURIComponent(processId)}/versions`, {
    orchestrator_id: orchestratorId,
  });
}

export async function updateProcessVersion(orchestratorId, releaseName, packageVersion) {
  return postRequest("/processes/update-version", { orchestratorId, releaseName, packageVersion });
}

// ─── Packages (pacotes no feed) ──────────────────

export async function fetchPackages() {
  return request(`${API_BASE}/packages`);
}

export async function createRelease(data) {
  return postRequest("/releases/create", data);
}

// ─── Processes ───────────────────────────────────

export async function fetchProcesses() {
  return request(`${API_BASE}/processes`);
}

// ─── Sessions ────────────────────────────────────

export async function fetchSessions() {
  return request(`${API_BASE}/sessions`);
}

// ─── Triggers ────────────────────────────────────

export async function fetchTriggers() {
  return request(`${API_BASE}/triggers`);
}

export async function setTriggerEnable(orchestratorId, scheduleId, enabled) {
  return postRequest("/triggers/set-enable", { orchestratorId, scheduleId, enabled });
}

export async function updateTrigger(orchestratorId, triggerId, data) {
  return postRequest("/triggers/update", { orchestratorId, triggerId, ...data });
}

export async function createTrigger(data) {
  return postRequest("/triggers/create", data);
}

export async function deleteTrigger(orchestratorId, triggerId) {
  return postRequest("/triggers/delete", { orchestratorId, triggerId });
}

// ─── Folders ─────────────────────────────────────

export async function fetchFolders(orchestratorId) {
  return request(`${API_BASE}/folders`, { orchestrator_id: orchestratorId });
}

// ─── Filas (Queues) ──────────────────────────────
// Filas são escopadas por folder — folderId é obrigatório nas operações por fila.

export async function fetchQueues() {
  return request(`${API_BASE}/queues`);
}

export async function fetchQueueItems(queueId, orchestratorId, folderId, { status, reference, top = 25, skip = 0 } = {}) {
  return request(`${API_BASE}/queues/${queueId}/items`, {
    orchestrator_id: orchestratorId,
    folder_id: folderId,
    status: status && status !== "all" ? status : undefined,
    reference: reference || undefined,
    "$top": top,
    "$skip": skip,
  });
}

export async function fetchQueuesSummary() {
  return request(`${API_BASE}/queues/summary`);
}

export async function fetchQueueItemCounts(queueId, orchestratorId, folderId) {
  return request(`${API_BASE}/queues/${queueId}/counts`, {
    orchestrator_id: orchestratorId,
    folder_id: folderId,
  });
}

export async function createQueue(data) {
  return postRequest("/queues/create", data);
}

export async function updateQueue(data) {
  return postRequest("/queues/update", data);
}

export async function deleteQueue(orchestratorId, folderId, queueId, queueName) {
  return postRequest("/queues/delete", { orchestratorId, folderId, queueId, queueName });
}

export async function addQueueItem(data) {
  return postRequest("/queues/items/add", data);
}

export async function retryQueueItem(orchestratorId, folderId, itemId) {
  return postRequest("/queues/items/retry", { orchestratorId, folderId, itemId });
}

export async function deleteQueueItem(orchestratorId, folderId, itemId) {
  return postRequest("/queues/items/delete", { orchestratorId, folderId, itemId });
}

export async function deleteQueueItemsBatch(orchestratorId, folderId, itemIds) {
  return postRequest("/queues/items/delete-batch", { orchestratorId, folderId, itemIds });
}

// ─── Buckets ─────────────────────────────────────
// Buckets são folder-scoped — folderId obrigatório nas operações.

export async function fetchBuckets() {
  return request(`${API_BASE}/buckets`);
}

export async function fetchBucketFiles(bucketId, orchestratorId, folderId, directory = "/") {
  return request(`${API_BASE}/buckets/${bucketId}/files`, {
    orchestrator_id: orchestratorId,
    folder_id: folderId,
    directory,
  });
}

export async function createBucket(data) {
  return postRequest("/buckets/create", data);
}

export async function updateBucket(data) {
  return postRequest("/buckets/update", data);
}

export async function deleteBucket(orchestratorId, folderId, bucketId, bucketName) {
  return postRequest("/buckets/delete", { orchestratorId, folderId, bucketId, bucketName });
}

export async function deleteBucketFile(orchestratorId, folderId, bucketId, path) {
  return postRequest("/buckets/files/delete", { orchestratorId, folderId, bucketId, path });
}

export async function uploadBucketFile({ bucketId, orchestratorId, folderId, path, file }) {
  const form = new FormData();
  form.append("orchestrator_id", orchestratorId);
  form.append("folder_id", folderId);
  form.append("path", path);
  form.append("file", file);
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/buckets/${bucketId}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.reload();
    throw new Error("Sessão expirada");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json();
}

export async function downloadBucketFile({ bucketId, orchestratorId, folderId, path }) {
  const token = localStorage.getItem("token");
  const url = new URL(`${API_BASE}/buckets/${bucketId}/download`, window.location.origin);
  url.searchParams.set("orchestrator_id", orchestratorId);
  if (folderId) url.searchParams.set("folder_id", folderId);
  url.searchParams.set("path", path);
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  const blob = await res.blob();
  const filename = path.split("/").pop() || "download";
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

// ─── Assets ──────────────────────────────────────
// Assets são folder-scoped — folderId obrigatório nas operações.

export async function fetchAssets() {
  return request(`${API_BASE}/assets`);
}

export async function createAsset(data) {
  return postRequest("/assets/create", data);
}

export async function updateAsset(data) {
  return postRequest("/assets/update", data);
}

export async function deleteAsset(orchestratorId, folderId, assetId, assetName) {
  return postRequest("/assets/delete", { orchestratorId, folderId, assetId, assetName });
}

// ─── Archived Processes ──────────────────────────

export async function fetchArchivedProcesses() {
  return request(`${API_BASE}/archived-processes`);
}

export async function toggleArchivedProcess(processKey) {
  return postRequest("/archived-processes/toggle", { processKey });
}

// ─── Settings ────────────────────────────────────

export async function fetchSettings() {
  return request(`${API_BASE}/settings`);
}

export async function saveSettings(settings) {
  return postRequest("/settings", settings);
}

// ─── Health ──────────────────────────────────────

export async function fetchHealth() {
  return request(`${API_BASE}/health`);
}

// ─── Orchestrators ───────────────────────────────

export async function fetchOrchestrators() {
  return request(`${API_BASE}/orchestrators`);
}

export async function saveOrchestrators(orchestrators) {
  return postRequest("/orchestrators", orchestrators);
}

export async function testOrchestrator(orchestrator) {
  return postRequest("/orchestrators/test", orchestrator);
}

// ─── Users ──────────────────────────────────────

export async function fetchUsers() {
  return request(`${API_BASE}/users`);
}

export async function createUser(data) {
  return postRequest("/users", data);
}

export async function updateUser(userId, data) {
  return putRequest(`/users/${userId}`, data);
}

export async function deleteUser(userId) {
  return deleteRequest(`/users/${userId}`);
}

export async function reactivateUser(userId) {
  return postRequest(`/users/${userId}/reactivate`, {});
}

export async function fetchUserOrchestrators(userId) {
  return request(`${API_BASE}/users/${userId}/orchestrators`);
}

export async function saveUserOrchestrators(userId, orchestratorIds) {
  return postRequest(`/users/${userId}/orchestrators`, { orchestratorIds });
}

// ─── Change Password ────────────────────────────

export async function changePassword(currentPassword, newPassword) {
  return postRequest("/auth/change-password", { currentPassword, newPassword });
}

// ─── Audit Trail ───────────────────────────────

export async function fetchAuditLogs({ top = 50, skip = 0, userId, action, robotName, from, to } = {}) {
  const params = new URLSearchParams({ $top: top, $skip: skip });
  if (userId) params.append("userId", userId);
  if (action) params.append("action", action);
  if (robotName) params.append("robotName", robotName);
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  return request(`${API_BASE}/audit?${params}`);
}
