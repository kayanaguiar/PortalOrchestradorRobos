import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  Globe,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchTriggers, setTriggerEnable } from "../../services/api";

function formatNextOccurrence(ts) {
  if (!ts) return "\u2014";
  const d = new Date(ts);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function TriggersPage({ addToast }) {
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [orchFilter, setOrchFilter] = useState("all");
  const [togglingIds, setTogglingIds] = useState(new Set());

  // Fetch triggers on mount
  useEffect(() => {
    setLoading(true);
    fetchTriggers()
      .then((data) => setTriggers(data.value || []))
      .catch(() => {
        setTriggers([]);
        addToast?.("error", "Erro ao carregar gatilhos");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  // Orchestrator names for filter
  const orchestratorNames = useMemo(() => {
    const names = new Map();
    for (const t of triggers) {
      if (t._orchestratorId && t._orchestratorName) {
        names.set(t._orchestratorId, t._orchestratorName);
      }
    }
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [triggers]);

  const search = searchTerm.toLowerCase().trim();

  const filteredTriggers = useMemo(() => {
    return triggers.filter((t) => {
      if (orchFilter !== "all" && t._orchestratorId !== orchFilter) return false;
      if (search) {
        const haystack = `${t.Name || ""} ${t.ReleaseName || ""} ${t.StartProcessCronSummary || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [triggers, orchFilter, search]);

  // Group by orchestrator
  const grouped = useMemo(() => {
    const groups = {};
    for (const t of filteredTriggers) {
      const key = t._orchestratorId || "unknown";
      if (!groups[key]) {
        groups[key] = { name: t._orchestratorName || key, triggers: [] };
      }
      groups[key].triggers.push(t);
    }
    // Sort groups by name
    return Object.entries(groups).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredTriggers]);

  const counts = useMemo(() => ({
    total: triggers.length,
    enabled: triggers.filter((t) => t.Enabled).length,
    disabled: triggers.filter((t) => !t.Enabled).length,
  }), [triggers]);

  const handleToggle = useCallback(async (trigger) => {
    const newEnabled = !trigger.Enabled;
    const triggerId = trigger.Id;
    const orchId = trigger._orchestratorId;

    // Optimistic update
    setTriggers((prev) =>
      prev.map((t) => (t.Id === triggerId && t._orchestratorId === orchId ? { ...t, Enabled: newEnabled } : t))
    );
    setTogglingIds((prev) => new Set([...prev, triggerId]));

    try {
      await setTriggerEnable(orchId, triggerId, newEnabled);
      addToast?.("success", `Gatilho "${trigger.Name}" ${newEnabled ? "habilitado" : "desabilitado"}`);
    } catch (err) {
      // Revert
      setTriggers((prev) =>
        prev.map((t) => (t.Id === triggerId && t._orchestratorId === orchId ? { ...t, Enabled: !newEnabled } : t))
      );
      addToast?.("error", `Erro ao alterar gatilho: ${err.message}`);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(triggerId);
        return next;
      });
    }
  }, [addToast]);

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Gatilhos", value: counts.total, color: "text-accent" },
          { label: "Habilitados", value: counts.enabled, color: "text-status-running" },
          { label: "Desabilitados", value: counts.disabled, color: "text-white/50" },
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
            placeholder="Buscar por nome, processo, agendamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-700/50 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 transition-all"
          />
        </div>

        {/* Orchestrator filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-white/20" />
          <select
            value={orchFilter}
            onChange={(e) => setOrchFilter(e.target.value)}
            className="bg-surface-700/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-accent/30 cursor-pointer"
          >
            <option value="all">Todos os orchestrators</option>
            {orchestratorNames.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        <span className="font-mono text-[11px] text-white/20">
          {filteredTriggers.length} resultado{filteredTriggers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-white/20 text-sm font-mono gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando gatilhos...
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredTriggers.length === 0 && (
        <div className="text-center py-16 text-white/20 text-sm font-mono">
          {search || orchFilter !== "all"
            ? "Nenhum gatilho encontrado para essa busca."
            : "Nenhum gatilho encontrado nos orchestrators."}
        </div>
      )}

      {/* Grouped triggers */}
      {!loading && grouped.map(([orchId, group], gi) => (
        <motion.div
          key={orchId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.1 }}
        >
          {/* Group header */}
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">{group.name}</h2>
            <p className="text-[11px] text-white/30 mt-0.5 font-mono">
              {group.triggers.length} GATILHO{group.triggers.length !== 1 ? "S" : ""}
            </p>
          </div>

          {/* Triggers list */}
          <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden divide-y divide-white/[0.03]">
            {group.triggers.map((trigger, i) => {
              const isToggling = togglingIds.has(trigger.Id);
              return (
                <motion.div
                  key={`${orchId}-${trigger.Id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: name + details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Timer className="w-4 h-4 text-accent/50 shrink-0" />
                        <span className="text-sm font-medium text-white/80 truncate">
                          {trigger.Name}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase shrink-0 ${
                          trigger.Enabled
                            ? "bg-status-running/15 text-status-running"
                            : "bg-white/5 text-white/30"
                        }`}>
                          {trigger.Enabled ? "Ativo" : "Inativo"}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap ml-6">
                        {/* Release name */}
                        <span className="text-xs text-white/40 font-mono truncate">
                          {trigger.ReleaseName || "\u2014"}
                        </span>

                        {/* Cron summary */}
                        {trigger.StartProcessCronSummary && (
                          <span className="flex items-center gap-1 text-[11px] text-white/30">
                            <Clock className="w-3 h-3" />
                            {trigger.StartProcessCronSummary}
                          </span>
                        )}

                        {/* Next occurrence */}
                        {trigger.StartProcessNextOccurrence && (
                          <span className="text-[11px] text-white/25 font-mono">
                            Prox: {formatNextOccurrence(trigger.StartProcessNextOccurrence)}
                          </span>
                        )}

                        {/* Timezone */}
                        {trigger.TimeZoneIana && (
                          <span className="flex items-center gap-1 text-[11px] text-white/20">
                            <Globe className="w-3 h-3" />
                            {trigger.TimeZoneIana}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: toggle + button */}
                    <div className="flex items-center gap-3 shrink-0">
                      {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />}
                      <button
                        onClick={() => handleToggle(trigger)}
                        disabled={isToggling}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 ${
                          trigger.Enabled
                            ? "border-status-running/30 text-status-running hover:bg-status-running/10"
                            : "border-white/10 text-white/30 hover:bg-white/5"
                        }`}
                      >
                        {trigger.Enabled ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Desabilitar</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5" /> Habilitar</>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
