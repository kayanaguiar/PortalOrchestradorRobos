import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Square,
  Zap,
  Search,
  Filter,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchJobs, fetchLogs } from "../../services/api";
import DatePicker from "../DatePicker";

const stateConfig = {
  Successful: { icon: CheckCircle2, color: "text-status-running", bg: "bg-status-running/15", label: "Concluído" },
  Faulted: { icon: XCircle, color: "text-status-error", bg: "bg-status-error/15", label: "Falhou" },
  Running: { icon: Zap, color: "text-accent", bg: "bg-accent/15", label: "Executando" },
  Stopped: { icon: Square, color: "text-white/40", bg: "bg-white/5", label: "Parado" },
  Pending: { icon: Clock, color: "text-status-paused", bg: "bg-status-paused/15", label: "Pendente" },
};

const PAGE_SIZE = 20;

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

function formatDuration(start, end) {
  if (!start || !end) return "—";
  const diff = Math.floor((new Date(end) - new Date(start)) / 1000);
  if (diff < 0) return "—";
  const h = String(Math.floor(diff / 3600)).padStart(2, "0");
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
  const s = String(diff % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function LogsPage({ robots, searchTerm: externalSearch }) {
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [robotFilter, setRobotFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(todayStr());
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedJobId, setExpandedJobId] = useState(null);

  // Sincroniza busca global
  useEffect(() => {
    if (externalSearch) setSearchTerm(externalSearch);
  }, [externalSearch]);
  const [jobLogs, setJobLogs] = useState({});
  const [jobLogsLoading, setJobLogsLoading] = useState(null);

  const toggleJobLogs = useCallback(async (job) => {
    if (expandedJobId === job.Id) {
      setExpandedJobId(null);
      return;
    }

    setExpandedJobId(job.Id);

    // Se já buscou, não busca de novo
    if (jobLogs[job.Id]) return;

    setJobLogsLoading(job.Id);
    try {
      // Filtra por ProcessName + data do job pra limitar o volume
      const jobDate = (job.CreationTime || "").split("T")[0];
      const dayStart = `${jobDate}T00:00:00Z`;
      const dayEnd = `${jobDate}T23:59:59Z`;
      const filter = `ProcessName eq '${job.ReleaseName}' and TimeStamp ge ${dayStart} and TimeStamp le ${dayEnd}`;
      const data = await fetchLogs({ top: 500, filter, orderby: "TimeStamp desc", orchestratorId: job._orchestratorId });
      const allLogs = data.value || [];
      // Filtra pelo JobKey no frontend e reordena cronologicamente
      const filtered = allLogs
        .filter((log) => log.JobKey === job.Key)
        .sort((a, b) => new Date(a.TimeStamp) - new Date(b.TimeStamp));
      setJobLogs((prev) => ({ ...prev, [job.Id]: filtered }));
    } catch {
      setJobLogs((prev) => ({ ...prev, [job.Id]: [] }));
    } finally {
      setJobLogsLoading(null);
    }
  }, [expandedJobId, jobLogs]);

  // Busca jobs filtrado por data
  useEffect(() => {
    setLoading(true);
    const dayStart = `${dateFilter}T00:00:00Z`;
    const dayEnd = `${dateFilter}T23:59:59Z`;
    const filter = `CreationTime ge ${dayStart} and CreationTime le ${dayEnd}`;
    fetchJobs({ top: 500, filter })
      .then((data) => setAllJobs(data.value || []))
      .catch(() => setAllJobs([]))
      .finally(() => setLoading(false));
  }, [dateFilter]);

  const processNames = useMemo(() => {
    const names = new Set(allJobs.map((j) => j.ReleaseName).filter(Boolean));
    return Array.from(names).sort();
  }, [allJobs]);

  const search = searchTerm.toLowerCase().trim();

  const filteredJobs = useMemo(() => {
    return allJobs.filter((job) => {
      if (statusFilter !== "all" && job.State !== statusFilter) return false;
      if (robotFilter !== "all" && job.ReleaseName !== robotFilter) return false;
      if (search) {
        const haystack = `${job.ReleaseName} ${job.Info || ""} ${job.HostMachineName || ""} ${job.Source || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [allJobs, statusFilter, robotFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const pagedJobs = filteredJobs.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const counts = useMemo(() => ({
    total: allJobs.length,
    successful: allJobs.filter((j) => j.State === "Successful").length,
    faulted: allJobs.filter((j) => j.State === "Faulted").length,
    stopped: allJobs.filter((j) => j.State === "Stopped").length,
    running: allJobs.filter((j) => j.State === "Running").length,
  }), [allJobs]);

  useEffect(() => setCurrentPage(0), [statusFilter, robotFilter, searchTerm, dateFilter]);

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total Jobs", value: counts.total, color: "text-accent" },
          { label: "Concluídos", value: counts.successful, color: "text-status-running" },
          { label: "Parados", value: counts.stopped, color: "text-white/50" },
          { label: "Com Falha", value: counts.faulted, color: "text-status-error" },
          { label: "Executando", value: counts.running, color: "text-status-paused" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-white/5 bg-surface-800/60 p-4"
          >
            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{item.label}</p>
            <p className={`font-mono text-2xl font-bold ${item.color}`}>{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            placeholder="Buscar por processo, máquina, info..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-700/50 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 transition-all"
          />
        </div>

        {/* Date */}
        <DatePicker value={dateFilter} onChange={setDateFilter} />

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-white/20" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-700/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-accent/30 cursor-pointer"
          >
            <option value="all">Todos os status</option>
            <option value="Successful">Concluído</option>
            <option value="Faulted">Falhou</option>
            <option value="Running">Executando</option>
            <option value="Stopped">Parado</option>
            <option value="Pending">Pendente</option>
          </select>
        </div>

        {/* Robot */}
        <select
          value={robotFilter}
          onChange={(e) => setRobotFilter(e.target.value)}
          className="bg-surface-700/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-accent/30 cursor-pointer"
        >
          <option value="all">Todos os robôs</option>
          {processNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <span className="font-mono text-[11px] text-white/20">
          {filteredJobs.length} resultado{filteredJobs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Jobs table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-white/5 grid grid-cols-[20px_100px_1fr_180px_120px_120px_140px] gap-3 text-[10px] uppercase tracking-wider text-white/30 font-mono">
          <span></span>
          <span>Status</span>
          <span>Processo</span>
          <span>Máquina</span>
          <span>Origem</span>
          <span>Duração</span>
          <span className="text-right">Início</span>
        </div>

        {loading && (
          <div className="px-5 py-12 text-center text-white/20 text-sm font-mono">
            Carregando jobs do dia...
          </div>
        )}

        {!loading && (
          <div className="divide-y divide-white/[0.03]">
            {pagedJobs.map((job, i) => {
              const cfg = stateConfig[job.State] || stateConfig.Stopped;
              const Icon = cfg.icon;
              const isExpanded = expandedJobId === job.Id;
              const logs = jobLogs[job.Id] || [];
              const isLoadingLogs = jobLogsLoading === job.Id;

              return (
                <div key={job.Id}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.4) }}
                    onClick={() => toggleJobLogs(job)}
                    className="px-5 py-3 grid grid-cols-[20px_100px_1fr_180px_120px_120px_140px] gap-3 items-center hover:bg-white/[0.03] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-center">
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-white/30" />
                        : <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                      }
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                        {cfg.label.toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-white/70 truncate block">
                        {job.ReleaseName}
                      </span>
                      {job.Info && (
                        <p className="text-[10px] text-white/20 font-mono truncate mt-0.5">
                          {job.Info}
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-xs text-white/30 truncate">
                      {job.HostMachineName || "—"}
                    </span>
                    <span className="font-mono text-xs text-white/30 truncate">
                      {job.Source || "—"}
                    </span>
                    <span className="font-mono text-xs text-white/30">
                      {formatDuration(job.StartTime, job.EndTime)}
                    </span>
                    <span className="font-mono text-[11px] text-white/20 text-right">
                      {formatDateTime(job.CreationTime)}
                    </span>
                  </motion.div>

                  {/* Expanded logs */}
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
                      {!isLoadingLogs && logs.map((log, j) => {
                        const levelBg = log.Level === "Error" ? "bg-status-error/15" : log.Level === "Warn" ? "bg-status-paused/15" : "bg-white/5";
                        const levelColor = log.Level === "Error" ? "text-status-error" : log.Level === "Warn" ? "text-status-paused" : "text-accent/60";
                        return (
                          <div
                            key={j}
                            className="px-5 pl-12 py-2 flex items-center gap-3 border-b border-white/[0.02]"
                          >
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${levelBg} ${levelColor}`}>
                              {log.Level}
                            </span>
                            <span className="font-mono text-xs text-white/50 flex-1 truncate">
                              {log.Message}
                            </span>
                            <span className="font-mono text-[10px] text-white/20 shrink-0">
                              {formatTime(log.TimeStamp)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {pagedJobs.length === 0 && (
              <div className="px-5 py-12 text-center text-white/20 text-sm">
                Nenhum job encontrado para este dia
              </div>
            )}
          </div>
        )}

        {!loading && filteredJobs.length > PAGE_SIZE && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[11px] text-white/30 font-mono">
              {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filteredJobs.length)} de {filteredJobs.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="w-7 h-7 rounded-md border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] text-white/30 font-mono px-2">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="w-7 h-7 rounded-md border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
