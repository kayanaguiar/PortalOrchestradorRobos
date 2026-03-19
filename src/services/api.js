const API_BASE = "/api";

async function request(endpoint, params = {}) {
  const url = new URL(endpoint, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

async function postRequest(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json();
}

// ─── Logs ────────────────────────────────────────

export async function fetchLogs({ top = 50, skip = 0, filter, orderby } = {}) {
  return request(`${API_BASE}/logs`, {
    "$top": top,
    "$skip": skip,
    "$filter": filter,
    "$orderby": orderby,
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

// ─── Process Versions ────────────────────────────

export async function fetchProcessVersions(processId, orchestratorId) {
  return request(`${API_BASE}/processes/${encodeURIComponent(processId)}/versions`, {
    orchestrator_id: orchestratorId,
  });
}

export async function updateProcessVersion(orchestratorId, releaseName, packageVersion) {
  return postRequest("/processes/update-version", { orchestratorId, releaseName, packageVersion });
}

// ─── Processes ───────────────────────────────────

export async function fetchProcesses() {
  return request(`${API_BASE}/processes`);
}

// ─── Sessions ────────────────────────────────────

export async function fetchSessions() {
  return request(`${API_BASE}/sessions`);
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
