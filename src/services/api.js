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

export function getStoredUser() {
  const user = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (!user || !token) return null;
  return JSON.parse(user);
}

// ─── Logs ────────────────────────────────────────

export async function fetchLogs({ top = 50, skip = 0, filter, orderby, orchestratorId } = {}) {
  return request(`${API_BASE}/logs`, {
    "$top": top,
    "$skip": skip,
    "$filter": filter,
    "$orderby": orderby,
    orchestrator_id: orchestratorId,
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

export async function startJob(orchestratorId, releaseKey) {
  return postRequest("/jobs/start", { orchestratorId, releaseKey });
}

export async function stopJob(orchestratorId, jobId, strategy = "SoftStop") {
  return postRequest("/jobs/stop", { orchestratorId, jobId, strategy });
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
