import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import StatsPanel from "./components/StatsPanel";
import SortableRobotCard from "./components/SortableRobotCard";
import ActivityTable from "./components/ActivityTable";
import RobotsPage from "./components/pages/RobotsPage";
import LogsPage from "./components/pages/LogsPage";
import SettingsPage from "./components/pages/SettingsPage";
import TriggersPage from "./components/pages/TriggersPage";
import UsersPage from "./components/pages/UsersPage";
import ChangePasswordModal from "./components/ChangePasswordModal";
import { useUiPathLogs, useUiPathJobs, useUiPathProcesses, useUiPathSessions, useUiPathHealth } from "./hooks/useUiPathData";
import useMediaQuery from "./hooks/useMediaQuery";
import ConfirmModal from "./components/ConfirmModal";
import Toast from "./components/Toast";
import { startJob, stopJob, fetchSettings, fetchProcessVersions, updateProcessVersion, fetchProcessUpdates, fetchArchivedProcesses, toggleArchivedProcess, login, logout, getStoredUser } from "./services/api";
import LoginPage from "./components/pages/LoginPage";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";

const pageConfig = {
  "/": { id: "dashboard", title: "Dashboard", subtitle: "VISÃO GERAL" },
  "/robots": { id: "robots", title: "Robôs", subtitle: "GERENCIAMENTO E DETALHES" },
  "/history": { id: "logs", title: "Histórico de Jobs", subtitle: "EXECUÇÕES DE TODOS OS ROBÔS" },
  "/triggers": { id: "triggers", title: "Gatilhos", subtitle: "AGENDAMENTOS E TRIGGERS" },
  "/users": { id: "users", title: "Usuários", subtitle: "GERENCIAMENTO DE ACESSOS" },
  "/settings": { id: "settings", title: "Configurações", subtitle: "ORCHESTRATORS E CONEXÕES" },
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

function buildRobots(releases, jobs, logs, updates = {}) {
  // Logs mais recentes por processo
  const latestLogByProcess = {};
  for (const log of logs) {
    const name = log.ProcessName;
    if (!latestLogByProcess[name] || new Date(log.TimeStamp) > new Date(latestLogByProcess[name].TimeStamp)) {
      latestLogByProcess[name] = log;
    }
  }

  // Execuções de hoje por processo
  const today = new Date().toISOString().split("T")[0];
  const statsByProcess = {};
  for (const job of jobs) {
    const name = job.ReleaseName || String(job.Id);
    if (!statsByProcess[name]) {
      statsByProcess[name] = { total: 0, successful: 0 };
    }
    if (job.CreationTime && job.CreationTime.startsWith(today)) {
      statsByProcess[name].total++;
      if (job.State === "Successful") statsByProcess[name].successful++;
    }
  }

  // Job mais recente por processo
  const latestJobByProcess = {};
  for (const job of jobs) {
    const key = `${job._orchestratorId}::${job.ReleaseName}`;
    const existing = latestJobByProcess[key];
    if (!existing || new Date(job.CreationTime) > new Date(existing.CreationTime)) {
      latestJobByProcess[key] = job;
    }
  }

  // Itera sobre RELEASES (processos), não jobs
  return releases.map((rel) => {
    const processKey = `${rel._orchestratorId}::${rel.Name}`;
    const job = latestJobByProcess[processKey] || null;
    const latestLog = latestLogByProcess[rel.Name] || null;
    const stats = statsByProcess[rel.Name] || { total: 0, successful: 0 };
    const successRate = stats.total > 0
      ? Math.round((stats.successful / stats.total) * 100 * 10) / 10
      : 0;
    const updateInfo = updates[rel.Name] || {};

    let status, state, lastLog, runtime, machine;
    const JOB_STATE_LABEL = {
      Successful: "Execução finalizada com sucesso",
      Stopped: "Execução interrompida",
      Faulted: "Execução finalizada com erro",
      Running: "Em execução",
      Pending: "Aguardando execução",
      Suspended: "Execução suspensa",
    };

    if (job) {
      status = mapJobStatus(job.State);
      state = job.State;
      lastLog = latestLog
        ? { Level: latestLog.Level, Message: latestLog.Message, Timestamp: latestLog.TimeStamp }
        : { Level: "Info", Message: JOB_STATE_LABEL[job.State] || job.State, Timestamp: job.EndTime || job.CreationTime };
      runtime = job.StartTime
        ? formatRuntime(new Date(job.StartTime), job.EndTime ? new Date(job.EndTime) : new Date())
        : "00:00:00";
      machine = job.HostMachineName || "—";
    } else {
      status = "inactive";
      state = null;
      lastLog = latestLog
        ? { Level: latestLog.Level, Message: latestLog.Message, Timestamp: latestLog.TimeStamp }
        : null;
      runtime = "—";
      machine = "—";
    }

    return {
      id: `rel-${rel._orchestratorId}-${rel.Id}`,
      jobId: job?.Id || null,
      releaseKey: rel.Key,
      releaseId: rel.Id,
      processVersion: rel.ProcessVersion,
      latestVersion: updateInfo.latestVersion || null,
      hasUpdate: updateInfo.hasUpdate === true,
      orchestratorId: rel._orchestratorId,
      orchestratorName: rel._orchestratorName,
      name: rel.Name,
      orchestrator: rel._orchestratorName || "UiPath Cloud",
      processKey: `${rel._orchestratorId}::${rel.Name}`,
      status,
      state,
      lastLog,
      runtime,
      startedAt: job?.StartTime || null,
      executionsToday: stats.total,
      successRate,
      machine,
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
  const [user, setUser] = useState(() => getStoredUser());
  const navigate = useNavigate();

  const handleLogin = async (email, password) => {
    const data = await login(email, password);
    setUser(data.user);
    navigate("/");
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    navigate("/");
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AuthenticatedApp user={user} onLogout={handleLogout} />;
}

function AuthenticatedApp({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const page = pageConfig[location.pathname] || pageConfig["/"];
  const activePage = page.id;
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Mobile
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("favoriteRobots") || "[]")); }
    catch { return new Set(); }
  });
  const toggleFavorite = useCallback((processKey) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(processKey)) next.delete(processKey); else next.add(processKey);
      localStorage.setItem("favoriteRobots", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => t === "dark" ? "light" : "dark"), []);

  const [actionLoading, setActionLoading] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(30);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(max-width: 1024px)").matches;
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }, []);
  const [logPageSize, setLogPageSize] = useState(5);
  const [searchTerm, setSearchTerm] = useState("");
  const [dismissedNotifications, setDismissedNotifications] = useState(new Set());
  const [accumulatedNotifications, setAccumulatedNotifications] = useState([]);
  const [archivedProcesses, setArchivedProcesses] = useState(new Set());

  // Carrega processos arquivados
  useEffect(() => {
    fetchArchivedProcesses()
      .then((data) => setArchivedProcesses(new Set(data.value || [])))
      .catch(() => {});
  }, []);
  // Card order (drag-and-drop)
  const [cardOrder, setCardOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cardOrder") || "[]"); }
    catch { return []; }
  });
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const [pendingAction, setPendingAction] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleRobotClick = useCallback((robotId) => {
    navigate(`/robots?selected=${robotId}`);
  }, [navigate]);

  // Carrega intervalo salvo no backend
  useEffect(() => {
    fetchSettings()
      .then((s) => setPollingInterval(s.pollingInterval || 30))
      .catch(() => {});
  }, []);

  const intervalMs = pollingInterval * 1000;

  const { logs: apiLogs, loading: logsLoading, error: logsError, refresh: refreshLogs, lastUpdated: logsLastUpdated } = useUiPathLogs({ top: 50, interval: intervalMs });
  const todayFilter = `CreationTime ge ${new Date().toISOString().split("T")[0]}T00:00:00Z`;
  const { jobs: apiJobs, loading: jobsLoading, refresh: refreshJobs, lastUpdated: jobsLastUpdated } = useUiPathJobs({ top: 200, filter: todayFilter, interval: intervalMs });
  const { processes: apiReleases, loading: processesLoading, refresh: refreshProcesses } = useUiPathProcesses(intervalMs);
  const { sessions: apiSessions, recentlyOffline, loading: sessionsLoading, refresh: refreshSessions } = useUiPathSessions(intervalMs);
  const { connected, orchestratorStatuses, loading: healthLoading, refresh: refreshHealth } = useUiPathHealth();

  // Updates de versão em background (roda só uma vez quando conecta)
  const [processUpdates, setProcessUpdates] = useState({});
  const refreshProcessUpdates = useCallback(() => {
    fetchProcessUpdates()
      .then((data) => {
        const map = {};
        for (const item of data.value || []) {
          map[item.name] = item;
        }
        setProcessUpdates(map);
      })
      .catch(() => {});
  }, []);

  // Busca updates na primeira conexão e a cada 60s
  const updatesTimerRef = useRef(null);
  useEffect(() => {
    if (!connected) return;
    refreshProcessUpdates();
    updatesTimerRef.current = setInterval(refreshProcessUpdates, 60000);
    return () => clearInterval(updatesTimerRef.current);
  }, [connected, refreshProcessUpdates]);

  const lastUpdated = useMemo(() => {
    const times = [logsLastUpdated, jobsLastUpdated].filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : null;
  }, [logsLastUpdated, jobsLastUpdated]);

  // Só espera o essencial: health + jobs + logs. O resto carrega em background.
  const initialLoading = healthLoading || logsLoading || jobsLoading;
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!initialLoading && connected) setHasLoadedOnce(true);
  }, [initialLoading, connected]);
  const dataReady = hasLoadedOnce;

  const robots = useMemo(
    () => buildRobots(apiReleases, apiJobs, apiLogs, processUpdates),
    [apiJobs, apiLogs, apiReleases, processUpdates]
  );

  const activityLogs = useMemo(
    () => apiLogsToActivityFormat(apiLogs),
    [apiLogs]
  );

  const search = searchTerm.toLowerCase().trim();

  // Filtra arquivados e busca
  const visibleRobots = useMemo(
    () => robots.filter((r) => !archivedProcesses.has(r.processKey)),
    [robots, archivedProcesses]
  );

  const filteredRobots = useMemo(
    () => search
      ? visibleRobots.filter((r) =>
          r.name.toLowerCase().includes(search) ||
          r.machine.toLowerCase().includes(search) ||
          r.orchestrator.toLowerCase().includes(search) ||
          r.lastLog?.Message?.toLowerCase().includes(search)
        )
      : visibleRobots,
    [visibleRobots, search]
  );

  // Ordena cards: usa ordem salva (drag) se existir, senão favoritos primeiro
  const sortedRobots = useMemo(() => {
    const list = [...filteredRobots];
    if (cardOrder.length > 0) {
      const orderMap = new Map(cardOrder.map((key, i) => [key, i]));
      list.sort((a, b) => {
        const ia = orderMap.has(a.processKey) ? orderMap.get(a.processKey) : Infinity;
        const ib = orderMap.has(b.processKey) ? orderMap.get(b.processKey) : Infinity;
        return ia - ib;
      });
    } else {
      list.sort((a, b) => (favorites.has(b.processKey) ? 1 : 0) - (favorites.has(a.processKey) ? 1 : 0));
    }
    return list;
  }, [filteredRobots, cardOrder, favorites]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const keys = sortedRobots.map((r) => r.processKey);
    const oldIndex = keys.indexOf(active.id);
    const newIndex = keys.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(keys, oldIndex, newIndex);
    setCardOrder(newOrder);
    localStorage.setItem("cardOrder", JSON.stringify(newOrder));
  }, [sortedRobots]);

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

  const executeAction = useCallback(async (robotId, action) => {
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
            console.error("Sem releaseKey para iniciar o job.");
          }
          break;
        case "stop":
          if (robot.jobId) {
            await stopJob(robot.orchestratorId, robot.jobId, "SoftStop");
          }
          break;
        case "kill":
          if (robot.jobId) {
            await stopJob(robot.orchestratorId, robot.jobId, "Kill");
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
      refreshProcessUpdates();
      const messages = {
        start: `Job "${robot.name}" iniciado com sucesso`,
        restart: `Job "${robot.name}" reiniciado com sucesso`,
        stop: `Job "${robot.name}" parado com sucesso`,
        kill: `Job "${robot.name}" encerrado`,
        update: `"${robot.name}" atualizado para a última versão`,
      };
      addToast("success", messages[action] || "Ação executada com sucesso");
    } catch (err) {
      const messages = {
        start: "Erro ao iniciar",
        restart: "Erro ao reiniciar",
        stop: "Erro ao parar",
        kill: "Erro ao encerrar",
        update: "Erro ao atualizar versão",
      };
      addToast("error", `${messages[action] || "Erro"}: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  }, [robots, refreshJobs, refreshLogs, refreshProcesses, addToast]);

  const archivedRef = useRef(archivedProcesses);
  archivedRef.current = archivedProcesses;

  const handleArchive = useCallback((processKey) => {
    const wasArchived = archivedRef.current.has(processKey);
    const next = new Set(archivedRef.current);
    if (wasArchived) next.delete(processKey);
    else next.add(processKey);
    setArchivedProcesses(next);
    addToast("success", wasArchived ? "Processo restaurado" : "Processo arquivado");

    toggleArchivedProcess(processKey).catch(() => {
      // Reverte
      const reverted = new Set(archivedRef.current);
      if (wasArchived) reverted.add(processKey);
      else reverted.delete(processKey);
      setArchivedProcesses(reverted);
      addToast("error", "Erro ao sincronizar");
    });
  }, [addToast]);

  const handleAction = useCallback((robotId, action) => {
    const robot = robots.find((r) => r.id === robotId);
    if (!robot) return;

    // Ações perigosas pedem confirmação
    if (action === "stop" || action === "kill" || action === "restart") {
      setPendingAction({ robotId, action, robotName: robot.name });
      return;
    }

    executeAction(robotId, action);
  }, [robots, executeAction]);

  const handleConfirmAction = useCallback(() => {
    if (pendingAction) {
      executeAction(pendingAction.robotId, pendingAction.action);
      setPendingAction(null);
    }
  }, [pendingAction, executeAction]);

  const handleCancelAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshLogs(), refreshJobs(), refreshProcesses(), refreshSessions(), refreshHealth()]);
      refreshProcessUpdates();
      addToast("success", "Dados atualizados");
    } catch {
      addToast("error", "Erro ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }, [refreshLogs, refreshJobs, refreshProcesses, refreshSessions, refreshHealth, refreshProcessUpdates, addToast]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Notificações — acumula ao longo da sessão
  useEffect(() => {
    setAccumulatedNotifications((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      const newItems = [];

      // Jobs com erro hoje
      for (const job of apiJobs) {
        if (job.State === "Faulted") {
          const id = `faulted-${job.Id}`;
          if (!existingIds.has(id)) {
            const matchedRobot = robots.find((r) => r.name === job.ReleaseName && r.orchestratorId === job._orchestratorId)
              || robots.find((r) => r.name === job.ReleaseName);
            newItems.push({
              id,
              type: "error",
              title: `Job falhou: ${job.ReleaseName}`,
              detail: job.Info || "Erro na execução",
              machine: job.HostMachineName || "",
              timestamp: job.EndTime || job.CreationTime,
              robotId: matchedRobot?.id || null,
            });
          }
        }
      }

      // Assistants que ficaram offline
      for (const assistant of recentlyOffline) {
        const perfil = assistant.machineName || assistant.hostMachineName;
        const id = `assistant-offline-${assistant.id}`;
        if (!existingIds.has(id)) {
          newItems.push({
            id,
            type: "warning",
            title: `Assistant offline: ${perfil}`,
            detail: `Perfil: ${perfil} — saiu do ar`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Orchestrators desconectados — atualiza estado (adiciona/remove)
      const orchIds = new Set();
      for (const orch of orchestratorStatuses) {
        if (!orch.connected) {
          const id = `orch-${orch.id}`;
          orchIds.add(id);
          if (!existingIds.has(id)) {
            newItems.push({
              id,
              type: "error",
              title: `Orchestrator desconectado: ${orch.name}`,
              detail: orch.error || "Falha na conexão",
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Remove notificações de orchestrators que reconectaram
      let filtered = prev.filter((n) => !n.id.startsWith("orch-") || orchIds.has(n.id));

      // Enriquece notificações de jobs que ainda não têm robotId
      let enriched = false;
      if (robots.length > 0) {
        filtered = filtered.map((n) => {
          if (n.id.startsWith("faulted-") && !n.robotId) {
            const releaseName = n.title.replace("Job falhou: ", "");
            const match = robots.find((r) => r.name === releaseName);
            if (match) {
              enriched = true;
              return { ...n, robotId: match.id };
            }
          }
          return n;
        });
      }

      if (newItems.length === 0 && filtered.length === prev.length && !enriched) return prev;

      const merged = [...filtered, ...newItems];
      merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return merged;
    });
  }, [apiJobs, recentlyOffline, orchestratorStatuses, robots]);

  const notifications = useMemo(
    () => accumulatedNotifications.filter((n) => !dismissedNotifications.has(n.id)),
    [accumulatedNotifications, dismissedNotifications]
  );

  const dismissNotification = useCallback((id) => {
    setDismissedNotifications((prev) => new Set([...prev, id]));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setDismissedNotifications(new Set(accumulatedNotifications.map((n) => n.id)));
  }, [accumulatedNotifications]);

  const handleNotificationClick = useCallback((notif) => {
    if (notif.robotId) {
      navigate(`/robots?selected=${notif.robotId}`);
    }
  }, [navigate]);

  const subtitle = activePage === "dashboard" ? dateStr.toUpperCase() : page.subtitle;

  // Tela de loading inicial — espera todos os dados carregarem
  if (!dataReady && !logsError) {
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
          <p className="font-mono text-xs text-white/30 mb-6">Não foi possível conectar ao servidor.</p>
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
      <Sidebar activePage={activePage} onNavigate={(id) => {
        const routes = { dashboard: "/", robots: "/robots", logs: "/history", triggers: "/triggers", users: "/users", settings: "/settings" };
        navigate(routes[id] || "/");
        if (isMobile) setMobileMenuOpen(false);
      }} collapsed={isMobile ? false : sidebarCollapsed} onToggle={toggleSidebar} userRole={user.role}
        isMobile={isMobile} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <main className={`p-4 md:p-8 transition-all duration-300 ${isMobile ? "ml-0" : sidebarCollapsed ? "ml-16" : "ml-64"}`}>
        <Header
          title={page.title}
          subtitle={subtitle}
          connected={connected}
          healthLoading={healthLoading}
          loading={logsLoading || refreshing}
          onRefresh={refreshAll}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          notifications={notifications}
          onDismissNotification={dismissNotification}
          onClearNotifications={clearAllNotifications}
          onNotificationClick={handleNotificationClick}
          lastUpdated={lastUpdated}
          user={user}
          onLogout={onLogout}
          onChangePassword={() => setShowChangePassword(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
          isMobile={isMobile}
          onMenuToggle={() => setMobileMenuOpen((o) => !o)}
        />

        <Routes>
          <Route path="/" element={
            <div className="space-y-6">
              <StatsPanel robots={visibleRobots} jobs={apiJobs} sessions={apiSessions} />
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white">Visão dos Robôs</h2>
                </div>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={sortedRobots.map((r) => r.processKey)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {sortedRobots.map((robot, i) => (
                        <SortableRobotCard
                          key={robot.id}
                          robot={robot}
                          index={i}
                          onAction={handleAction}
                          onArchive={handleArchive}
                          onClick={() => handleRobotClick(robot.id)}
                          loading={actionLoading === robot.id}
                          userRole={user.role}
                          isFavorite={favorites.has(robot.processKey)}
                          onToggleFavorite={toggleFavorite}
                        />
                      ))}
                      {filteredRobots.length === 0 && !logsLoading && (
                        <div className="col-span-full text-center py-12 text-white/20 text-sm font-mono">
                          {search ? "Nenhum robô encontrado para essa busca." : "Nenhum job encontrado. Verifique as configurações dos Orchestrators."}
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
              <ActivityTable logs={filteredLogs} pageSize={logPageSize} onPageSizeChange={setLogPageSize} />
            </div>
          } />
          <Route path="/robots" element={
            <RobotsPage
              robots={filteredRobots}
              onAction={handleAction}
              searchTerm={searchTerm}
              userRole={user.role}
              pollingInterval={pollingInterval}
            />
          } />
          <Route path="/history" element={
            <LogsPage robots={robots} searchTerm={searchTerm} />
          } />
          <Route path="/triggers" element={
            <TriggersPage addToast={addToast} userRole={user.role} />
          } />
          {user.role === "admin" && (
            <Route path="/users" element={
              <UsersPage addToast={addToast} />
            } />
          )}
          <Route path="/settings" element={
            <SettingsPage
              pollingInterval={pollingInterval}
              onPollingChange={setPollingInterval}
              searchTerm={searchTerm}
              archivedProcesses={archivedProcesses}
              allRobots={robots}
              onUnarchive={handleArchive}
            />
          } />
          <Route path="*" element={
            <div className="text-center py-20 text-white/20 text-sm font-mono">
              Página não encontrada
            </div>
          } />
        </Routes>
      </main>

      <ConfirmModal
        open={!!pendingAction}
        title={
          pendingAction?.action === "kill" ? "Encerrar robô"
          : pendingAction?.action === "stop" ? "Parar robô"
          : "Reiniciar robô"
        }
        message={
          pendingAction?.action === "kill"
            ? `Tem certeza que deseja ENCERRAR o robô "${pendingAction?.robotName}"?\n\nO processo será interrompido imediatamente (Kill), sem esperar um ponto seguro. Dados em processamento podem ser perdidos.`
            : pendingAction?.action === "stop"
              ? `Tem certeza que deseja PARAR o robô "${pendingAction?.robotName}"?\n\nO robô será parado de forma segura (SoftStop), finalizando a atividade atual antes de encerrar.`
              : `Tem certeza que deseja REINICIAR o robô "${pendingAction?.robotName}"?\n\nUm novo job será iniciado para este processo.`
        }
        confirmLabel={
          pendingAction?.action === "kill" ? "Encerrar"
          : pendingAction?.action === "stop" ? "Parar"
          : "Reiniciar"
        }
        variant="danger"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />

      <Toast toasts={toasts} onDismiss={removeToast} />

      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onSuccess={(msg) => addToast("success", msg)}
      />
    </div>
  );
}
