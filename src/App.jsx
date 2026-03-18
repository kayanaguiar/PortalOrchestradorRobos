import { useState, useCallback, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsPanel from "./components/StatsPanel";
import RobotCard from "./components/RobotCard";
import ActivityTable from "./components/ActivityTable";
import RobotsPage from "./components/pages/RobotsPage";
import LogsPage from "./components/pages/LogsPage";
import SettingsPage from "./components/pages/SettingsPage";
import { useUiPathLogs, useUiPathJobs, useUiPathProcesses, useUiPathHealth } from "./hooks/useUiPathData";
import { startJob, stopJob, resumeJob } from "./services/api";

const pageConfig = {
  dashboard: { title: "Dashboard", subtitle: "VISÃO GERAL" },
  robots: { title: "Robôs", subtitle: "GERENCIAMENTO E DETALHES" },
  logs: { title: "Logs", subtitle: "/ODATA/ROBOTLOGS" },
  settings: { title: "Configurações", subtitle: "ORCHESTRATORS E CONEXÕES" },
};

function mapJobStatus(state) {
  switch (state) {
    case "Running": return "running";
    case "Pending": return "running";
    case "Suspended": return "paused";
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

  // Map ReleaseName -> Release Key (do /odata/Releases)
  const releaseKeyByName = {};
  for (const rel of releases) {
    releaseKeyByName[rel.Name] = rel.Key;
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
    return {
      id: `job-${job.Id}`,
      jobId: job.Id,
      releaseKey: releaseKeyByName[job.ReleaseName] || null,
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
      executionsToday: 0,
      successRate: 0,
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

  const { logs: apiLogs, loading: logsLoading, error: logsError, refresh: refreshLogs } = useUiPathLogs({ top: 50 });
  const { jobs: apiJobs, refresh: refreshJobs } = useUiPathJobs({ top: 50 });
  const { processes: apiReleases } = useUiPathProcesses();
  const { connected } = useUiPathHealth();

  const robots = useMemo(
    () => apiJobsToRobots(apiJobs, apiLogs, apiReleases),
    [apiJobs, apiLogs, apiReleases]
  );

  const activityLogs = useMemo(
    () => apiLogsToActivityFormat(apiLogs),
    [apiLogs]
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
        case "pause":
          if (robot.jobId) {
            await stopJob(robot.orchestratorId, robot.jobId, "SoftStop");
          }
          break;
        case "resume":
          if (robot.jobId) {
            await resumeJob(robot.orchestratorId, robot.jobId);
          }
          break;
      }
      await Promise.all([refreshJobs(), refreshLogs()]);
    } catch (err) {
      console.error(`Erro ao executar ${action}:`, err);
    } finally {
      setActionLoading(null);
    }
  }, [robots, refreshJobs, refreshLogs]);

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

  const page = pageConfig[activePage];
  const subtitle = activePage === "dashboard" ? dateStr.toUpperCase() : page.subtitle;

  return (
    <div className="min-h-screen hud-grid scanline">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />

      <main className="ml-64 p-8">
        <Header
          title={page.title}
          subtitle={subtitle}
          connected={connected}
          loading={logsLoading}
          onRefresh={refreshAll}
        />

        {!logsLoading && logsError && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-status-error/30 bg-status-error/10 text-status-error text-xs font-mono">
            Erro ao conectar na API — verifique se o servidor está rodando: cd server && python app.py
          </div>
        )}

        {activePage === "dashboard" && (
          <div className="space-y-6">
            <StatsPanel robots={robots} />

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">
                  Visão dos Robôs
                </h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {robots.map((robot, i) => (
                  <RobotCard
                    key={robot.id}
                    robot={robot}
                    index={i}
                    onAction={handleAction}
                    loading={actionLoading === robot.id}
                  />
                ))}
                {robots.length === 0 && !logsLoading && (
                  <div className="col-span-full text-center py-12 text-white/20 text-sm font-mono">
                    Nenhum job encontrado. Verifique as configurações dos Orchestrators.
                  </div>
                )}
              </div>
            </div>

            <ActivityTable logs={activityLogs} />
          </div>
        )}

        {activePage === "robots" && (
          <RobotsPage
            robots={robots}
            logHistory={{}}
            onAction={handleAction}
          />
        )}

        {activePage === "logs" && (
          <LogsPage
            robotLogs={activityLogs}
            logHistory={{}}
            robots={robots}
          />
        )}

        {activePage === "settings" && (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}
