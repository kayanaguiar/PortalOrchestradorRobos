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
} from "lucide-react";
import { motion } from "motion/react";
import { fetchAuditLogs } from "../../services/api";

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

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs({ top: PAGE_SIZE, skip: p * PAGE_SIZE });
      setLogs(data.value || []);
      setTotal(data.total || 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

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
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Histórico de Ações</h2>
          <p className="text-[11px] text-white/30 mt-0.5 font-mono">
            QUEM FEZ O QUE E QUANDO
          </p>
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
                  className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
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
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-[11px] text-white/30">
                        <User className="w-3 h-3" />
                        {log.userName}
                      </span>
                      {log.orchestratorName && (
                        <span className="text-[11px] text-white/20 font-mono">
                          {log.orchestratorName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <span className="font-mono text-[11px] text-white/20 shrink-0">
                    {formatDateTime(log.createdAt)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
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
