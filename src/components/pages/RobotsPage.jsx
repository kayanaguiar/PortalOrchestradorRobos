import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Monitor,
  Clock,
  TrendingUp,
  Zap,
  Play,
  Square,
  RotateCcw,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Server,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchLogs, fetchJobs } from "../../services/api";
import DatePicker from "../DatePicker";

const statusConfig = {
  running: {
    label: "Executando",
    color: "text-status-running",
    bg: "bg-status-running",
    dotClass: "pulse-running",
  },
  stopped: {
    label: "Parado",
    color: "text-status-stopped",
    bg: "bg-status-stopped",
    dotClass: "",
  },
  error: {
    label: "Erro",
    color: "text-status-error",
    bg: "bg-status-error",
    dotClass: "pulse-running",
  },
};

const levelColors = {
  Info: "text-accent/60",
  Warn: "text-status-paused",
  Error: "text-status-error",
};

const levelBg = {
  Info: "bg-white/5",
  Warn: "bg-status-paused/15",
  Error: "bg-status-error/15",
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

export default function RobotsPage({ robots, onAction, initialSelectedId, onClearSelection }) {
  const [selectedRobotId, setSelectedRobotId] = useState(initialSelectedId || null);
  const [robotJobs, setRobotJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [expandedJobKey, setExpandedJobKey] = useState(null);
  const [jobLogs, setJobLogs] = useState({});
  const [jobLogsLoading, setJobLogsLoading] = useState(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (initialSelectedId) setSelectedRobotId(initialSelectedId);
  }, [initialSelectedId]);

  const selectedRobot = robots.find((r) => r.id === selectedRobotId);

  // Busca só os Jobs ao selecionar robô ou mudar data (leve)
  useEffect(() => {
    if (!selectedRobot) {
      setRobotJobs([]);
      return;
    }

    setJobsLoading(true);
    setExpandedJobKey(null);
    setJobLogs({});
    const dayStart = `${dateFilter}T00:00:00Z`;
    const dayEnd = `${dateFilter}T23:59:59Z`;
    const jobsFilter = `ReleaseName eq '${selectedRobot.name}' and CreationTime ge ${dayStart} and CreationTime le ${dayEnd}`;
    fetchJobs({ top: 200, filter: jobsFilter })
      .then((data) => setRobotJobs(data.value || []))
      .catch(() => setRobotJobs([]))
      .finally(() => setJobsLoading(false));
  }, [selectedRobot?.id, selectedRobot?.name, dateFilter]);

  // Execuções derivadas dos Jobs (sem precisar de logs)
  const executions = useMemo(() => {
    return robotJobs
      .map((job) => ({
        jobKey: job.Key,
        jobId: job.Id,
        jobState: job.State,
        firstTimestamp: job.StartTime || job.CreationTime,
        lastTimestamp: job.EndTime || job.StartTime || job.CreationTime,
        info: job.Info,
        source: job.Source,
      }))
      .sort((a, b) => new Date(b.firstTimestamp) - new Date(a.firstTimestamp));
  }, [robotJobs]);

  // Busca logs sob demanda ao expandir uma execução
  const toggleJob = useCallback(async (execution) => {
    if (expandedJobKey === execution.jobKey) {
      setExpandedJobKey(null);
      return;
    }

    setExpandedJobKey(execution.jobKey);

    if (jobLogs[execution.jobKey]) return;

    setJobLogsLoading(execution.jobKey);
    try {
      const jobDate = (execution.firstTimestamp || "").split("T")[0];
      const dayStart = `${jobDate}T00:00:00Z`;
      const dayEnd = `${jobDate}T23:59:59Z`;
      const filter = `ProcessName eq '${selectedRobot.name}' and TimeStamp ge ${dayStart} and TimeStamp le ${dayEnd}`;
      const data = await fetchLogs({ top: 1000, filter, orderby: "TimeStamp desc" });
      const allLogs = data.value || [];
      const filtered = allLogs
        .filter((log) => log.JobKey === execution.jobKey)
        .sort((a, b) => new Date(a.TimeStamp) - new Date(b.TimeStamp));
      setJobLogs((prev) => ({ ...prev, [execution.jobKey]: filtered }));
    } catch {
      setJobLogs((prev) => ({ ...prev, [execution.jobKey]: [] }));
    } finally {
      setJobLogsLoading(null);
    }
  }, [expandedJobKey, jobLogs, selectedRobot?.name]);

  const handleBack = () => {
    setSelectedRobotId(null);
    onClearSelection?.();
  };

  // ─── Detail View ───────────────────────────────
  if (selectedRobot) {
    const config = statusConfig[selectedRobot.status] || statusConfig.stopped;
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-6 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar para lista
        </button>

        {/* Robot header */}
        <div className="rounded-xl border border-white/5 bg-surface-800/60 p-6 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${config.bg} ${config.dotClass}`} />
                <span className={`font-mono text-xs uppercase tracking-widest ${config.color}`}>
                  {config.label}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white">{selectedRobot.name}</h2>
              <p className="text-white/30 text-sm mt-1 font-mono">{selectedRobot.orchestrator}</p>
            </div>
            <div className="flex gap-2">
              {selectedRobot.status === "running" && (
                <ActionBtn icon={Square} label="Parar" variant="danger" onClick={() => onAction(selectedRobot.id, "stop")} />
              )}
              {selectedRobot.status === "stopped" && (
                <ActionBtn icon={Play} label="Iniciar" variant="success" onClick={() => onAction(selectedRobot.id, "start")} />
              )}
              {selectedRobot.status === "error" && (
                <>
                  <ActionBtn icon={RotateCcw} label="Reiniciar" variant="accent" onClick={() => onAction(selectedRobot.id, "restart")} />
                  <ActionBtn icon={Square} label="Parar" variant="danger" onClick={() => onAction(selectedRobot.id, "stop")} />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard icon={Monitor} label="Máquina" value={selectedRobot.machine} />
            <InfoCard icon={Clock} label="Runtime" value={selectedRobot.runtime} />
            <InfoCard icon={Zap} label="Execuções Hoje" value={selectedRobot.executionsToday} />
            <InfoCard icon={TrendingUp} label="Taxa de Sucesso" value={`${selectedRobot.successRate}%`} />
          </div>
        </div>

        {/* Logs by execution */}
        <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Execuções</h3>
              <p className="text-[11px] text-white/30 mt-0.5 font-mono">
                {executions.length} EXECUÇÕES — CLIQUE PARA VER LOGS
              </p>
            </div>
            <DatePicker value={dateFilter} onChange={setDateFilter} />
          </div>

          {jobsLoading && (
            <div className="px-5 py-8 text-center text-white/20 text-sm font-mono">
              Carregando execuções...
            </div>
          )}

          {!jobsLoading && executions.length === 0 && (
            <div className="px-5 py-8 text-center text-white/20 text-sm font-mono">
              Nenhuma execução encontrada neste dia
            </div>
          )}

          {!jobsLoading && executions.map((execution, i) => {
            const isExpanded = expandedJobKey === execution.jobKey;
            const logs = jobLogs[execution.jobKey] || [];
            const isLoadingLogs = jobLogsLoading === execution.jobKey;
            const hasLogError = logs.some((l) => l.Level === "Error");

            return (
              <div key={execution.jobKey}>
                {/* Execution header */}
                <div
                  onClick={() => toggleJob(execution)}
                  className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer border-b border-white/[0.03]"
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
                  }
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    execution.jobState === "Faulted" ? "bg-status-error"
                    : execution.jobState === "Running" ? "bg-status-running pulse-running"
                    : execution.jobState === "Successful" ? "bg-status-running"
                    : "bg-status-stopped"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white/70">
                        {formatDateTime(execution.firstTimestamp)}
                      </span>
                      <span className="text-white/20">→</span>
                      <span className="text-xs text-white/50">
                        {formatTime(execution.lastTimestamp)}
                      </span>
                      {execution.jobState === "Faulted" && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-status-error/15 text-status-error">FALHOU</span>
                      )}
                      {execution.jobState === "Successful" && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-status-running/15 text-status-running">CONCLUÍDO</span>
                      )}
                      {execution.jobState === "Running" && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent">EXECUTANDO</span>
                      )}
                      {execution.jobState === "Stopped" && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/30">PARADO</span>
                      )}
                      {hasLogError && execution.jobState !== "Faulted" && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-status-paused/15 text-status-paused">ERRO NO LOG</span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/20 font-mono mt-0.5 truncate">
                      Job: {execution.jobKey.substring(0, 8)}...
                      {execution.source && ` — ${execution.source}`}
                      {logs.length > 0 && ` — ${logs.length} logs`}
                    </p>
                  </div>
                </div>

                {/* Expanded logs (carregados sob demanda) */}
                {isExpanded && (
                  <div className="bg-surface-900/40 border-t border-white/[0.03]">
                    {isLoadingLogs && (
                      <div className="px-5 py-4 flex items-center gap-2 text-white/20 text-xs font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Carregando logs...
                      </div>
                    )}
                    {!isLoadingLogs && logs.length === 0 && (
                      <div className="px-5 py-4 text-white/15 text-xs font-mono">
                        Nenhum log encontrado para este job
                      </div>
                    )}
                    {!isLoadingLogs && logs.map((log, j) => (
                      <div
                        key={j}
                        className="px-5 pl-14 py-2 flex items-center gap-3 border-b border-white/[0.02]"
                      >
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${levelBg[log.Level] || levelBg.Info} ${levelColors[log.Level] || levelColors.Info}`}>
                          {log.Level}
                        </span>
                        <span className="font-mono text-xs text-white/50 flex-1 truncate">
                          {log.Message}
                        </span>
                        <span className="font-mono text-[10px] text-white/20 shrink-0">
                          {formatTime(log.TimeStamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  }

  // ─── List View ─────────────────────────────────
  return (
    <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-white">Todos os Robôs</h2>
        <p className="text-[11px] text-white/30 mt-0.5 font-mono">
          {robots.length} ROBÔS — CLIQUE PARA VER LOGS
        </p>
      </div>
      <div className="divide-y divide-white/[0.03]">
        {robots.map((robot, i) => {
          const config = statusConfig[robot.status] || statusConfig.stopped;
          return (
            <motion.div
              key={robot.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => setSelectedRobotId(robot.id)}
              className="px-5 py-4 flex items-center gap-5 hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.bg} ${config.dotClass}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{robot.name}</span>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${config.color}`}>
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-white/25 font-mono mt-0.5">{robot.orchestrator}</p>
              </div>
              <div className="hidden md:block flex-1 min-w-0">
                <p className="font-mono text-xs text-white/40 truncate">
                  {robot.lastLog?.Message ?? "—"}
                </p>
              </div>
              <div className="hidden lg:flex items-center gap-1.5 text-white/20">
                <Server className="w-3 h-3" />
                <span className="font-mono text-xs">{robot.machine}</span>
              </div>
              <div className="hidden xl:flex items-center gap-4 text-white/30 font-mono text-xs">
                <span>{robot.executionsToday} exec</span>
                <span>{robot.successRate}%</span>
              </div>
              <span className="font-mono text-xs text-white/20">{robot.runtime}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="p-3 rounded-lg bg-surface-900/60 border border-white/5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-white/20" />
        <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-mono text-sm text-white/80">{value}</p>
    </div>
  );
}

const variantStyles = {
  success: "border-status-running/30 text-status-running hover:bg-status-running/10",
  danger: "border-status-error/30 text-status-error hover:bg-status-error/10",
  accent: "border-accent/30 text-accent hover:bg-accent/10",
};

function ActionBtn({ icon: Icon, label, onClick, variant }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-medium transition-all duration-200 cursor-pointer ${variantStyles[variant]}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
