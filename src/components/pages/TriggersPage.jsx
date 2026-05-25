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
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { fetchTriggers, setTriggerEnable, updateTrigger, createTrigger, deleteTrigger, fetchProcesses } from "../../services/api";
import ConfirmModal from "../ConfirmModal";
import TimezoneSelect from "../TimezoneSelect";
import CustomSelect from "../CustomSelect";
import CronBuilder from "../CronBuilder";

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
  const [editingTrigger, setEditingTrigger] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", startProcessCron: "", timeZoneId: "E. South America Standard Time", enabled: true, orchestratorId: "", releaseKey: "" });
  const [saving, setSaving] = useState(false);
  const [processes, setProcesses] = useState([]);
  const [togglingIds, setTogglingIds] = useState(new Set());

  // Fetch triggers e processos on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTriggers(), fetchProcesses()])
      .then(([triggersData, processesData]) => {
        setTriggers(triggersData.value || []);
        setProcesses(processesData.value || []);
      })
      .catch(() => {
        setTriggers([]);
        addToast?.("error", "Erro ao carregar gatilhos");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  // Orchestrator names — combina triggers + processes para incluir todos
  const orchestratorNames = useMemo(() => {
    const names = new Map();
    for (const t of triggers) {
      if (t._orchestratorId && t._orchestratorName) {
        names.set(t._orchestratorId, t._orchestratorName);
      }
    }
    for (const p of processes) {
      if (p._orchestratorId && p._orchestratorName) {
        names.set(p._orchestratorId, p._orchestratorName);
      }
    }
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [triggers, processes]);

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

  const openEdit = useCallback((trigger) => {
    setIsCreating(false);
    setEditingTrigger(trigger);
    setEditForm({
      name: trigger.Name || "",
      startProcessCron: trigger.StartProcessCron || "",
      timeZoneId: trigger.TimeZoneId || "E. South America Standard Time",
      enabled: trigger.Enabled,
      orchestratorId: trigger._orchestratorId || "",
      releaseKey: trigger.ReleaseKey || "",
    });
  }, []);

  const openCreate = useCallback(() => {
    setIsCreating(true);
    setEditingTrigger({});
    setEditForm({
      name: "",
      startProcessCron: "0 0/30 8-18 ? * MON-FRI *",
      timeZoneId: "E. South America Standard Time",
      enabled: true,
      orchestratorId: orchestratorNames[0]?.[0] || "",
      releaseKey: "",
    });
  }, [orchestratorNames]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTrigger) return;
    setSaving(true);
    try {
      if (isCreating) {
        await createTrigger({
          orchestratorId: editForm.orchestratorId,
          name: editForm.name,
          releaseKey: editForm.releaseKey,
          startProcessCron: editForm.startProcessCron,
          timeZoneId: editForm.timeZoneId,
          enabled: editForm.enabled,
        });
        // Recarrega triggers
        const data = await fetchTriggers();
        setTriggers(data.value || []);
        addToast?.("success", `Gatilho "${editForm.name}" criado`);
      } else {
        await updateTrigger(editingTrigger._orchestratorId, editingTrigger.Id, editForm);
        setTriggers((prev) =>
          prev.map((t) =>
            t.Id === editingTrigger.Id && t._orchestratorId === editingTrigger._orchestratorId
              ? { ...t, Name: editForm.name, StartProcessCron: editForm.startProcessCron, TimeZoneId: editForm.timeZoneId, Enabled: editForm.enabled }
              : t
          )
        );
        addToast?.("success", `Gatilho "${editForm.name}" atualizado`);
      }
      setEditingTrigger(null);
    } catch (err) {
      addToast?.("error", `Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [editingTrigger, isCreating, editForm, addToast]);

  // Delete trigger
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteTrigger(pendingDelete._orchestratorId, pendingDelete.Id);
      setTriggers((prev) => prev.filter((t) => !(t.Id === pendingDelete.Id && t._orchestratorId === pendingDelete._orchestratorId)));
      addToast?.("success", `Gatilho "${pendingDelete.Name}" excluído`);
    } catch (err) {
      addToast?.("error", `Erro ao excluir: ${err.message}`);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }, [pendingDelete, addToast]);

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
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
            className="rounded-xl border border-white/5 bg-surface-800/60 p-3 sm:p-4"
          >
            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{item.label}</p>
            <p className={`font-mono text-2xl font-bold ${item.color}`}>{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-stretch sm:items-center gap-2 sm:gap-3 flex-col sm:flex-row sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-md w-full">
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
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-white/20 shrink-0" />
          <CustomSelect
            value={orchFilter}
            onChange={setOrchFilter}
            placeholder="Filtrar orchestrator..."
            options={[
              { value: "all", label: "Todos os orchestrators" },
              ...orchestratorNames.map(([id, name]) => ({ value: id, label: name })),
            ]}
            className="flex-1 sm:flex-none sm:min-w-[14rem]"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-start sm:ml-auto gap-3">
          <span className="font-mono text-[11px] text-white/20">
            {filteredTriggers.length} resultado{filteredTriggers.length !== 1 ? "s" : ""}
          </span>

          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
          >
            <Timer className="w-3.5 h-3.5" /> Novo Gatilho
          </button>
        </div>
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
                  className="px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                    {/* Left: name + details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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

                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap ml-6">
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

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0">
                      {isToggling && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/30" />}
                      <button
                        onClick={() => openEdit(trigger)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
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
                      <button
                        onClick={() => setPendingDelete(trigger)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-status-error/20 text-status-error/60 text-xs font-medium hover:bg-status-error/10 hover:text-status-error transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!pendingDelete}
        title="Excluir gatilho"
        message={`Tem certeza que deseja EXCLUIR o gatilho "${pendingDelete?.Name}"?\n\nEsta ação não pode ser desfeita. O agendamento será removido permanentemente do Orchestrator.`}
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Edit modal */}
      {editingTrigger && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingTrigger(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
            {/* Header fixo */}
            <div className="flex items-center justify-between p-4 md:p-6 pb-0 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-white">{isCreating ? "Novo Gatilho" : "Editar Gatilho"}</h3>
                {!isCreating && <p className="text-[11px] text-white/30 font-mono mt-0.5">{editingTrigger.ReleaseName}</p>}
              </div>
              <button onClick={() => setEditingTrigger(null)} className="text-white/20 hover:text-white/50 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="overflow-y-auto flex-1 p-4 md:p-6">
              <div className="space-y-4">
                {/* Orchestrator + Robô (só na criação) */}
                {isCreating && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Orchestrator</label>
                      <CustomSelect
                        value={editForm.orchestratorId}
                        onChange={(v) => setEditForm((f) => ({ ...f, orchestratorId: v, releaseKey: "" }))}
                        placeholder="Selecionar orchestrator..."
                        options={orchestratorNames.map(([id, name]) => ({ value: id, label: name }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Robô / Processo</label>
                      <CustomSelect
                        value={editForm.releaseKey}
                        onChange={(v) => setEditForm((f) => ({ ...f, releaseKey: v }))}
                        placeholder="Selecionar processo..."
                        options={processes
                          .filter((p) => p._orchestratorId === editForm.orchestratorId)
                          .map((p) => ({ value: p.Key, label: p.Name, subtitle: `v${p.ProcessVersion}` }))}
                        className="w-full"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Nome</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>

                <CronBuilder
                  value={editForm.startProcessCron}
                  onChange={(v) => setEditForm((f) => ({ ...f, startProcessCron: v }))}
                />

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Fuso Horário</label>
                  <TimezoneSelect
                    value={editForm.timeZoneId}
                    onChange={(v) => setEditForm((f) => ({ ...f, timeZoneId: v }))}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-[10px] uppercase tracking-wider text-white/30">Habilitado</label>
                  <button
                    onClick={() => setEditForm((f) => ({ ...f, enabled: !f.enabled }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      editForm.enabled
                        ? "border-status-running/30 text-status-running bg-status-running/10"
                        : "border-white/10 text-white/30 bg-white/5"
                    }`}
                  >
                    {editForm.enabled ? "Sim" : "Não"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer fixo */}
            <div className="flex justify-end gap-2 p-4 md:p-6 pt-0 shrink-0">
              <button
                onClick={() => setEditingTrigger(null)}
                className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-light cursor-pointer disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
