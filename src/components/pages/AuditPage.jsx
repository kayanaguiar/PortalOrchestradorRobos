import { useState, useEffect, useCallback } from "react";
import {
  Play,
  Square,
  XOctagon,
  RotateCcw,
  ArrowUpCircle,
  User,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchAuditLogs, fetchUsers } from "../../services/api";
import CustomSelect from "../CustomSelect";
import DatePicker from "../DatePicker";

const PAGE_SIZE = 25;

const actionConfig = {
  start: { icon: Play, label: "Iniciou", color: "text-status-running", bg: "bg-status-running/15" },
  restart: { icon: RotateCcw, label: "Reiniciou", color: "text-accent", bg: "bg-accent/15" },
  stop: { icon: Square, label: "Parou", color: "text-status-paused", bg: "bg-status-paused/15" },
  cancel: { icon: XOctagon, label: "Cancelou", color: "text-status-paused", bg: "bg-status-paused/15" },
  kill: { icon: XOctagon, label: "Encerrou", color: "text-status-error", bg: "bg-status-error/15" },
  update: { icon: ArrowUpCircle, label: "Atualizou", color: "text-accent", bg: "bg-accent/15" },
};

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
}

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({
    userId: "",
    action: "",
    robotName: "",
    from: "",
    to: "",
  });

  // Carrega lista de usuários para o seletor
  useEffect(() => {
    fetchUsers().then((data) => setUsers(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const load = useCallback(async (p, currentFilters) => {
    setLoading(true);
    try {
      const params = { top: PAGE_SIZE, skip: p * PAGE_SIZE };
      if (currentFilters.userId) params.userId = currentFilters.userId;
      if (currentFilters.action) params.action = currentFilters.action;
      if (currentFilters.robotName) params.robotName = currentFilters.robotName;
      if (currentFilters.from) params.from = `${currentFilters.from}T00:00:00`;
      if (currentFilters.to) params.to = `${currentFilters.to}T23:59:59`;
      const data = await fetchAuditLogs(params);
      setLogs(data.value || []);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, filters);
  }, [page, filters, load]);

  const updateFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({ userId: "", action: "", robotName: "", from: "", to: "" });
    setPage(0);
  };

  const hasActiveFilters = filters.userId || filters.action || filters.robotName || filters.from || filters.to;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/5 bg-surface-800/60 p-4"
      >
        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Total de Registros</p>
        <p className="font-mono text-2xl font-bold text-accent">{total}</p>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden"
      >
        <div className="px-4 sm:px-5 py-4 border-b border-white/5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Histórico de Ações</h2>
              <p className="text-[11px] text-white/30 mt-0.5 font-mono">
                QUEM FEZ O QUE E QUANDO
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-[11px] font-mono text-white/40 hover:text-white/70 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
                Limpar filtros
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <CustomSelect
              value={filters.userId}
              onChange={(v) => updateFilter("userId", v)}
              placeholder="Todos os usuários"
              options={[
                { value: "", label: "Todos os usuários" },
                ...users.map((u) => ({ value: u.id, label: u.name })),
              ]}
              className="w-full"
            />
            <CustomSelect
              value={filters.action}
              onChange={(v) => updateFilter("action", v)}
              placeholder="Todas as ações"
              options={[
                { value: "", label: "Todas as ações" },
                { value: "start", label: "Iniciar" },
                { value: "restart", label: "Reiniciar" },
                { value: "stop", label: "Parar" },
                { value: "cancel", label: "Cancelar" },
                { value: "kill", label: "Encerrar" },
                { value: "update", label: "Atualizar" },
              ]}
              className="w-full"
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 pointer-events-none" />
              <input
                type="text"
                value={filters.robotName}
                onChange={(e) => updateFilter("robotName", e.target.value)}
                placeholder="Robô..."
                className="w-full bg-surface-900/60 border border-white/5 rounded-lg pl-8 pr-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 transition-all"
              />
            </div>
            <DatePicker
              value={filters.from}
              onChange={(v) => updateFilter("from", v)}
              placeholder="De"
              clearable
              max={filters.to || undefined}
            />
            <DatePicker
              value={filters.to}
              onChange={(v) => updateFilter("to", v)}
              placeholder="Até"
              clearable
              min={filters.from || undefined}
            />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-white/20 text-sm font-mono gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando...
          </div>
        )}

        {!loading && logs.length === 0 && (
          <div className="text-center py-16 text-white/20 text-sm font-mono">
            Nenhuma ação registrada ainda
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="divide-y divide-white/[0.03]">
            {logs.map((log, i) => {
              const cfg = actionConfig[log.action] || actionConfig.start;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="px-4 sm:px-5 py-3.5 flex items-start sm:items-center gap-3 sm:gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Action icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium text-white/80 truncate">
                        {log.robotName}
                      </span>
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-1 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-white/30">
                        <User className="w-3 h-3" />
                        {log.userName}
                      </span>
                      {log.orchestratorName && (
                        <span className="text-[11px] text-white/20 font-mono truncate">
                          {log.orchestratorName}
                        </span>
                      )}
                      {/* Timestamp inline em mobile */}
                      <span className="sm:hidden font-mono text-[10px] text-white/20">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp à direita só em desktop */}
                  <span className="hidden sm:block font-mono text-[11px] text-white/20 shrink-0">
                    {formatDateTime(log.createdAt)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 sm:px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-[11px] text-white/30 font-mono">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-7 h-7 rounded-lg border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] text-white/40 font-mono px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="w-7 h-7 rounded-lg border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
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
