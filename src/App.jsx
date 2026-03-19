import { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsPanel from "./components/StatsPanel";
import RobotCard from "./components/RobotCard";
import ActivityTable from "./components/ActivityTable";
import RobotsPage from "./components/pages/RobotsPage";
import LogsPage from "./components/pages/LogsPage";
import SettingsPage from "./components/pages/SettingsPage";
import { useUiPathLogs, useUiPathJobs, useUiPathProcesses, useUiPathSessions, useUiPathHealth } from "./hooks/useUiPathData";
import { startJob, stopJob, fetchSettings, fetchProcessVersions, updateProcessVersion } from "./services/api";

const pageConfig = {
  dashboard: { title: "Dashboard", subtitle: "VISÃO GERAL" },
  robots: { title: "Robôs", subtitle: "GERENCIAMENTO E DETALHES" },
  logs: { title: "Histórico de Jobs", subtitle: "EXECUÇÕES DE TODOS OS ROBÔS" },
  settings: { title: "Configurações", subtitle: "ORCHESTRATORS E CONEXÕES" },
};

function mapJobStatus(state) {
  switch (state) {
    case "Running": return "running";
    case "Pending": return "running";
    case "Suspended": return "stopped";
    case "Successful": return "stopped";
    case "Stopped": return "stopped";
    case "Faulted": return "error";
    default: return "stopped";
  }
}

function apiJobsToRobots(jobs, logs, releases) {
  const latestLogByProcess = {};
  for (const log of logs) {
    const name = log.ProcessName;
    if (!latestLogByProcess[name] || new Date(log.TimeStamp) > new Date(latestLogByProcess[name].TimeStamp)) {
      latestLogByProcess[name] = log;
    }
  }

  // Map ReleaseName -> Release info (do /odata/Releases)
  const releaseInfoByName = {};
  for (const rel of releases) {
    releaseInfoByName[rel.Name] = {
      key: rel.Key,
      id: rel.Id,
      version: rel.ProcessVersion,
      latestVersion: rel._latestVersion,
      hasUpdate: rel._hasUpdate === true,
      orchestratorId: rel._orchestratorId,
    };
  }

  // Conta execuções de hoje e taxa de sucesso por processo
  const today = new Date().toISOString().split("T")[0];
  const statsByProcess = {};
  for (const job of jobs) {
    const name = job.ReleaseName || String(job.Id);
    if (!statsByProcess[name]) {
      statsByProcess[name] = { total: 0, successful: 0 };
    }
    if (job.CreationTime && job.CreationTime.startsWith(today)) {
      statsByProcess[name].total++;
      if (job.State === "Successful") {
        statsByProcess[name].successful++;
      }
    }
  }

  // Agrupa jobs por processo, pega o mais recente
  const latestJobByProcess = {};
  for (const job of jobs) {
    const key = `${job._orchestratorId}::${job.ReleaseName || job.Id}`;
    const existing = latestJobByProcess[key];
    if (!existing || new Date(job.CreationTime) > new Date(existing.CreationTime)) {
      latestJobByProcess[key] = job;
    }
  }

  return Object.values(latestJobByProcess).map((job) => {
    const latestLog = latestLogByProcess[job.ReleaseName] || null;
    const stats = statsByProcess[job.ReleaseName] || { total: 0, successful: 0 };
    const successRate = stats.total > 0
      ? Math.round((stats.successful / stats.total) * 100 * 10) / 10
      : 0;

    const releaseInfo = releaseInfoByName[job.ReleaseName] || {};

    return {
      id: `job-${job.Id}`,
      jobId: job.Id,
      releaseKey: releaseInfo.key || null,
      releaseId: releaseInfo.id || null,
      processVersion: releaseInfo.version || null,
      latestVersion: releaseInfo.latestVersion || null,
      hasUpdate: releaseInfo.hasUpdate || false,
      orchestratorId: job._orchestratorId,
      name: job.ReleaseName || `Job ${job.Id}`,
      orchestrator: job._orchestratorName || "UiPath Cloud",
      processKey: job.Key,
      status: mapJobStatus(job.State),
      state: job.State,
      lastLog: latestLog
        ? { Level: latestLog.Level, Message: latestLog.Message, Timestamp: latestLog.TimeStamp }
        : { Level: "Info", Message: job.Info || "—", Timestamp: job.CreationTime },
      runtime: job.StartTime
        ? formatRuntime(new Date(job.StartTime), job.EndTime ? new Date(job.EndTime) : new Date())
        : "00:00:00",
      startedAt: job.StartTime,
      executionsToday: stats.total,
      successRate,
      machine: job.HostMachineName || "—",
    };
  });
}

function formatRuntime(start, end) {
  const diff = Math.floor((end - start) / 1000);
  const h = String(Math.floor(diff / 3600)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
  const s = String(diff % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function apiLogsToActivityFormat(logs) {
  return logs.map((log, i) => ({
    Id: log.Id || i,
    Level: log.Level,
    Message: log.Message,
    Timestamp: log.TimeStamp,
    ProcessName: log.ProcessName,
    RobotName: log.RobotName,
    JobKey: log.JobKey,
  }));
}

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [actionLoading, setActionLoading] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(30);
  const [selectedRobotId, setSelectedRobotId] = useState(null);
  const [logPageSize, setLogPageSize] = useState(5);
  const [searchTerm, setSearchTerm] = useState("");
  const [dismissedNotifications, setDismissedNotifications] = useState(new Set());

  const handleRobotClick = useCallback((robotId) => {
    setSelectedRobotId(robotId);
    setActivePage("robots");
  }, []);

  // Carrega intervalo salvo no backend
  useEffect(() => {
    fetchSettings()
      .then((s) => setPollingInterval(s.pollingInterval || 30))
      .catch(() => {});
  }, []);

  const intervalMs = pollingInterval * 1000;

  const { logs: apiLogs, loading: logsLoading, error: logsError, refresh: refreshLogs } = useUiPathLogs({ top: logPageSize, interval: intervalMs });
  const todayFilter = `CreationTime ge ${new Date().toISOString().split("T")[0]}T00:00:00Z`;
  const { jobs: apiJobs, loading: jobsLoading, refresh: refreshJobs } = useUiPathJobs({ top: 200, filter: todayFilter, interval: intervalMs });
  const { processes: apiReleases, loading: processesLoading, refresh: refreshProcesses } = useUiPathProcesses();
  const { sessions: apiSessions, loading: sessionsLoading } = useUiPathSessions();
  const { connected, loading: healthLoading } = useUiPathHealth();

  const initialLoading = healthLoading || logsLoading || jobsLoading || processesLoading || sessionsLoading;

  const robots = useMemo(
    () => apiJobsToRobots(apiJobs, apiLogs, apiReleases),
    [apiJobs, apiLogs, apiReleases]
  );

  const activityLogs = useMemo(
    () => apiLogsToActivityFormat(apiLogs),
    [apiLogs]
  );

  const search = searchTerm.toLowerCase().trim();

  const filteredRobots = useMemo(
    () => search
      ? robots.filter((r) =>
          r.name.toLowerCase().includes(search) ||
          r.machine.toLowerCase().includes(search) ||
          r.orchestrator.toLowerCase().includes(search) ||
          r.lastLog?.Message?.toLowerCase().includes(search)
        )
      : robots,
    [robots, search]
  );

  const filteredLogs = useMemo(
    () => search
      ? activityLogs.filter((l) =>
          l.ProcessName?.toLowerCase().includes(search) ||
          l.Message?.toLowerCase().includes(search) ||
          l.RobotName?.toLowerCase().includes(search)
        )
      : activityLogs,
    [activityLogs, search]
  );

  const handleAction = useCallback(async (robotId, action) => {
    const robot = robots.find((r) => r.id === robotId);
    if (!robot?.orchestratorId) return;

    setActionLoading(robotId);
    try {
      switch (action) {
        case "start":
        case "restart":
          if (robot.releaseKey) {
            await startJob(robot.orchestratorId, robot.releaseKey);
          } else {
            console.error("Sem releaseKey para iniciar o job. Verifique /api/processes.");
          }
          break;
        case "stop":
          if (robot.jobId) {
            await stopJob(robot.orchestratorId, robot.jobId);
          }
          break;
        case "update":
          if (robot.name) {
            const versions = await fetchProcessVersions(robot.name, robot.orchestratorId);
            const latest = versions?.value?.[0];
            if (latest?.Version) {
              await updateProcessVersion(robot.orchestratorId, robot.name, latest.Version);
            }
          }
          break;
      }
      await Promise.all([refreshJobs(), refreshLogs(), refreshProcesses()]);
    } catch (err) {
      console.error(`Erro ao executar ${action}:`, err);
    } finally {
      setActionLoading(null);
    }
  }, [robots, refreshJobs, refreshLogs, refreshProcesses]);

  const refreshAll = useCallback(() => {
    refreshLogs();
    refreshJobs();
  }, [refreshLogs, refreshJobs]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Notificações
  const allNotifications = useMemo(() => {
    const items = [];

    // Jobs com erro hoje
    const faultedJobs = apiJobs.filter((j) => j.State === "Faulted");
    for (const job of faultedJobs) {
      items.push({
        id: `faulted-${job.Id}`,
        type: "error",
        title: `Job falhou: ${job.ReleaseName}`,
        detail: job.Info || "Erro na execução",
        machine: job.HostMachineName || "",
        timestamp: job.EndTime || job.CreationTime,
      });
    }

    // Assistants desconectados (só os que têm máquina identificável)
    const disconnectedAssistants = apiSessions.filter(
      (s) => s.Source === "Assistant" && s.State === "Disconnected" && s.HostMachineName
    );
    for (const session of disconnectedAssistants) {
      const perfil = session.MachineName || session.HostMachineName;
      items.push({
        id: `assistant-${session.Id}`,
        type: "warning",
        title: `Assistant offline: ${perfil}`,
        detail: `Perfil: ${perfil}`,
        timestamp: session.ReportingTime,
      });
    }

    items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return items;
  }, [apiJobs, apiSessions]);

  const notifications = useMemo(
    () => allNotifications.filter((n) => !dismissedNotifications.has(n.id)),
    [allNotifications, dismissedNotifications]
  );

  const dismissNotification = useCallback((id) => {
    setDismissedNotifications((prev) => new Set([...prev, id]));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setDismissedNotifications(new Set(allNotifications.map((n) => n.id)));
  }, [allNotifications]);

  const page = pageConfig[activePage];
  const subtitle = activePage === "dashboard" ? dateStr.toUpperCase() : page.subtitle;

  // Tela de loading inicial
  if (initialLoading) {
    return (
      <div className="min-h-screen hud-grid scanline flex items-center justify-center">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-accent/20 flex items-center justify-center mx-auto glow-accent">
              <svg className="w-8 h-8 text-accent animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="2" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                <path d="m4.93 4.93 2.83 2.83m8.48 8.48 2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
              </svg>
            </div>
            <div className="absolute -top-1 -right-1 left-0 right-0 mx-auto w-20 h-20 rounded-2xl border border-accent/20 animate-ping opacity-20" />
          </div>
          <h1 className="font-display text-xl font-bold text-white mb-2">RoboCommand</h1>
          <p className="font-mono text-xs text-white/30 mb-6">CONECTANDO AOS ORCHESTRATORS...</p>
          <div className="flex items-center justify-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  // Tela de erro de conexão
  if (!connected && logsError) {
    return (
      <div className="min-h-screen hud-grid scanline flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-status-error/20 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-status-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="font-display text-xl font-bold text-white mb-2">Sem Conexão</h1>
          <p className="font-mono text-xs text-white/30 mb-4">Não foi possível conectar ao servidor.</p>
          <p className="font-mono text-[11px] text-white/20 mb-6 bg-surface-800/60 rounded-lg p-3 border border-white/5">
            cd server && python app.py
          </p>
          <button
            onClick={refreshAll}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-all cursor-pointer"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen hud-grid scanline">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <main className="ml-64 p-8">
        <Header
          title={page.title}
          subtitle={subtitle}
          connected={connected}
          healthLoading={healthLoading}
          loading={logsLoading}
          onRefresh={refreshAll}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          notifications={notifications}
          onDismissNotification={dismissNotification}
          onClearNotifications={clearAllNotifications}
        />

        {activePage === "dashboard" && (
          <div className="space-y-6">
            <StatsPanel robots={robots} jobs={apiJobs} sessions={apiSessions} />

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Visão dos Robôs
                </h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRobots.map((robot, i) => (
                  <RobotCard
                    key={robot.id}
                    robot={robot}
                    index={i}
                    onAction={handleAction}
                    onClick={() => handleRobotClick(robot.id)}
                    loading={actionLoading === robot.id}
                  />
                ))}
                {filteredRobots.length === 0 && !logsLoading && (
                  <div className="col-span-full text-center py-12 text-white/20 text-sm font-mono">
                    {search ? "Nenhum robô encontrado para essa busca." : "Nenhum job encontrado. Verifique as configurações dos Orchestrators."}
                  </div>
                )}
              </div>
            </div>

            <ActivityTable logs={filteredLogs} pageSize={logPageSize} onPageSizeChange={setLogPageSize} />
          </div>
        )}

        {activePage === "robots" && (
          <RobotsPage
            robots={robots}
            onAction={handleAction}
            initialSelectedId={selectedRobotId}
            onClearSelection={() => setSelectedRobotId(null)}
          />
        )}

        {activePage === "logs" && (
          <LogsPage robots={robots} />
        )}

        {activePage === "settings" && (
          <SettingsPage pollingInterval={pollingInterval} onPollingChange={setPollingInterval} />
        )}
      </main>
    </div>
  );
}
