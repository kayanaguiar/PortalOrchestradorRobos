import { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Filter,
} from "lucide-react";
import { motion } from "motion/react";

const levelConfig = {
  Info: { icon: CheckCircle2, color: "text-status-running", bg: "bg-white/5" },
  Warn: { icon: AlertTriangle, color: "text-status-paused", bg: "bg-status-paused/15" },
  Error: { icon: XCircle, color: "text-status-error", bg: "bg-status-error/15" },
};

function formatDateTime(ts) {
  const d = new Date(ts);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

export default function LogsPage({ robotLogs, logHistory, robots }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [robotFilter, setRobotFilter] = useState("all");

  // Combine all logs from both sources into one sorted list
  const allLogs = useMemo(() => {
    const fromGlobal = robotLogs.map((log) => ({
      ...log,
      source: "global",
    }));

    const fromHistory = Object.entries(logHistory).flatMap(([robotId, logs]) => {
      const robot = robots.find((r) => r.id === robotId);
      return logs.map((log) => ({
        ...log,
        ProcessName: log.ProcessName || robot?.name?.replace(/ /g, "_") || "Unknown",
        RobotName: log.RobotName || robot?.machine || "Unknown",
        source: "history",
      }));
    });

    // Merge and deduplicate by Id
    const merged = new Map();
    [...fromGlobal, ...fromHistory].forEach((log) => {
      if (!merged.has(log.Id)) {
        merged.set(log.Id, log);
      }
    });

    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)
    );
  }, [robotLogs, logHistory, robots]);

  // Get unique process names for filter
  const processNames = useMemo(() => {
    const names = new Set(allLogs.map((l) => l.ProcessName));
    return Array.from(names).sort();
  }, [allLogs]);

  // Apply filters
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (levelFilter !== "all" && log.Level !== levelFilter) return false;
      if (robotFilter !== "all" && log.ProcessName !== robotFilter) return false;
      if (searchTerm && !log.Message.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [allLogs, levelFilter, robotFilter, searchTerm]);

  // Counts
  const counts = useMemo(() => ({
    total: allLogs.length,
    info: allLogs.filter((l) => l.Level === "Info").length,
    warn: allLogs.filter((l) => l.Level === "Warn").length,
    error: allLogs.filter((l) => l.Level === "Error").length,
  }), [allLogs]);

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: counts.total, color: "text-accent" },
          { label: "Info", value: counts.info, color: "text-status-running" },
          { label: "Warn", value: counts.warn, color: "text-status-paused" },
          { label: "Error", value: counts.error, color: "text-status-error" },
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
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            placeholder="Buscar na mensagem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-700/50 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-white/20" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-surface-700/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-accent/30 cursor-pointer"
          >
            <option value="all">Todos os níveis</option>
            <option value="Info">Info</option>
            <option value="Warn">Warn</option>
            <option value="Error">Error</option>
          </select>
        </div>

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

        <span className="font-mono text-[11px] text-white/20 ml-2">
          {filteredLogs.length} resultado{filteredLogs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Log table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden"
      >
        {/* Table header */}
        <div className="px-5 py-3 border-b border-white/5 grid grid-cols-[80px_1fr_180px_140px] gap-4 text-[10px] uppercase tracking-wider text-white/30 font-mono">
          <span>Nível</span>
          <span>Mensagem</span>
          <span>Processo</span>
          <span className="text-right">Data/Hora</span>
        </div>

        <div className="divide-y divide-white/[0.03] max-h-[calc(100vh-420px)] overflow-y-auto">
          {filteredLogs.map((log, i) => {
            const cfg = levelConfig[log.Level] || levelConfig.Info;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={`${log.Id}-${log.source}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.5) }}
                className="px-5 py-3 grid grid-cols-[80px_1fr_180px_140px] gap-4 items-center hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                    {log.Level.toUpperCase()}
                  </span>
                </div>
                <span className="font-mono text-xs text-white/60 truncate">{log.Message}</span>
                <span className="font-mono text-xs text-white/30 truncate">{log.ProcessName}</span>
                <span className="font-mono text-[11px] text-white/20 text-right">
                  {formatDateTime(log.Timestamp)}
                </span>
              </motion.div>
            );
          })}
          {filteredLogs.length === 0 && (
            <div className="px-5 py-12 text-center text-white/20 text-sm">
              Nenhum log encontrado com os filtros aplicados
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
