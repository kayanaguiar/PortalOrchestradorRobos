import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Monitor,
  Clock,
  TrendingUp,
  Zap,
  Play,
  Square,
  XOctagon,
  RotateCcw,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Server,
  Loader2,
  Search,
  Plus,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchLogs, fetchJobs, fetchPackages, fetchOrchestrators, createRelease } from "../../services/api";
import DatePicker from "../DatePicker";
import CustomSelect from "../CustomSelect";
import { createPortal } from "react-dom";

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

export default function RobotsPage({ robots, onAction, searchTerm: externalSearch }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRobotId, setSelectedRobotId] = useState(searchParams.get("selected") || null);
  const [robotJobs, setRobotJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [expandedJobKey, setExpandedJobKey] = useState(null);
  const [jobLogs, setJobLogs] = useState({});
  const [jobLogsLoading, setJobLogsLoading] = useState(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [logSearchTerm, setLogSearchTerm] = useState("");

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
      const data = await fetchLogs({ top: 500, filter, orderby: "TimeStamp desc", orchestratorId: selectedRobot.orchestratorId });
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
    setSearchParams({});
  };

  // ─── Criar Processo ──────────────────────────
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [packages, setPackages] = useState([]);
  const [orchList, setOrchList] = useState([]);
  const [createForm, setCreateForm] = useState({ orchestratorId: "", packageId: "", name: "", version: "" });
  const [createSaving, setCreateSaving] = useState(false);

  const openCreateModal = useCallback(async () => {
    setShowCreateModal(true);
    setCreateForm({ orchestratorId: "", packageId: "", name: "", version: "" });
    try {
      const [pkgData, orchData] = await Promise.all([fetchPackages(), fetchOrchestrators()]);
      setPackages(pkgData.value || []);
      setOrchList(Array.isArray(orchData) ? orchData : []);
    } catch {}
  }, []);

  const selectedPackage = packages.find((p) =>
    p.Id === createForm.packageId && p._orchestratorId === createForm.orchestratorId
  );

  const handleCreate = useCallback(async () => {
    if (!createForm.orchestratorId || !selectedPackage) return;
    setCreateSaving(true);
    try {
      await createRelease({
        orchestratorId: createForm.orchestratorId,
        name: createForm.name || selectedPackage.Title,
        processKey: selectedPackage.Id,
        processVersion: selectedPackage.Version,
        entryPointPath: selectedPackage.MainEntryPointPath || "Main.xaml",
      });
      setShowCreateModal(false);
      // Recarrega a página
      window.location.reload();
    } catch (err) {
      alert(`Erro ao criar processo: ${err.message}`);
    } finally {
      setCreateSaving(false);
    }
  }, [createForm, selectedPackage]);

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
                <>
                  <ActionBtn icon={Square} label="Parar" variant="warning" onClick={() => onAction(selectedRobot.id, "stop")} />
                  <ActionBtn icon={XOctagon} label="Encerrar" variant="danger" onClick={() => onAction(selectedRobot.id, "kill")} />
                </>
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
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
            <div className="shrink-0">
              <h3 className="text-sm font-semibold text-white">Execuções</h3>
              <p className="text-[11px] text-white/30 mt-0.5 font-mono">
                {executions.length} EXECUÇÕES
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                <input
                  type="text"
                  value={logSearchTerm}
                  onChange={(e) => setLogSearchTerm(e.target.value)}
                  placeholder="Buscar nos logs..."
                  className="bg-surface-900/60 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white/60 placeholder:text-white/15 focus:outline-none focus:border-accent/30 w-48 transition-all"
                />
              </div>
              <DatePicker value={dateFilter} onChange={setDateFilter} />
            </div>
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
                    {!isLoadingLogs && logs.filter((log) =>
                      !logSearchTerm || log.Message?.toLowerCase().includes(logSearchTerm.toLowerCase())
                    ).map((log, j) => (
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
    <div>
      <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Todos os Robôs</h2>
          <p className="text-[11px] text-white/30 mt-0.5 font-mono">
            {robots.length} ROBÔS — CLIQUE PARA VER LOGS
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Processo
        </button>
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
              onClick={() => { setSelectedRobotId(robot.id); setSearchParams({ selected: robot.id }); }}
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

    {/* Modal Criar Processo */}
    {showCreateModal && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
        <div className="relative w-full max-w-lg mx-4 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-white">Novo Processo</h3>
            <button onClick={() => setShowCreateModal(false)} className="text-white/20 hover:text-white/50 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Orchestrator</label>
              <CustomSelect
                value={createForm.orchestratorId}
                onChange={(v) => setCreateForm((f) => ({ ...f, orchestratorId: v, packageId: "", name: "", version: "" }))}
                placeholder="Selecionar orchestrator..."
                options={orchList.map((o) => ({ value: o.id, label: o.name }))}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Pacote (publicado no feed)</label>
              <CustomSelect
                value={createForm.packageId}
                onChange={(v) => {
                  const pkg = packages.find((p) => p.Id === v && p._orchestratorId === createForm.orchestratorId);
                  setCreateForm((f) => ({
                    ...f,
                    packageId: v,
                    name: pkg?.Title || v,
                    version: pkg?.Version || "",
                  }));
                }}
                placeholder="Selecionar pacote..."
                options={packages
                  .filter((p) => p._orchestratorId === createForm.orchestratorId)
                  .map((p) => ({ value: p.Id, label: p.Title, subtitle: `v${p.Version} — ${p.Description || "Sem descrição"}` }))}
                className="w-full"
              />
            </div>

            {selectedPackage && (
              <>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Nome do Processo</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>

                <div className="p-3 rounded-lg bg-surface-900/60 border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Detalhes do Pacote</p>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div><span className="text-white/30">Versão:</span> <span className="text-white/60">{selectedPackage.Version}</span></div>
                    <div><span className="text-white/30">Framework:</span> <span className="text-white/60">{selectedPackage.TargetFramework}</span></div>
                    <div><span className="text-white/30">Autor:</span> <span className="text-white/60">{selectedPackage.Authors}</span></div>
                    <div><span className="text-white/30">Entry Point:</span> <span className="text-white/60">{selectedPackage.MainEntryPointPath}</span></div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={createSaving || !createForm.orchestratorId || !selectedPackage}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-light cursor-pointer disabled:opacity-50"
            >
              {createSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Criar Processo
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
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
  warning: "border-status-paused/30 text-status-paused hover:bg-status-paused/10",
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
