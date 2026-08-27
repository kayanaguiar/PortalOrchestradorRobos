import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Filter,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Layers,
  RotateCcw,
  ShieldCheck,
  Hash,
  AlertTriangle,
  Folder,
} from "lucide-react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  fetchQueues,
  fetchQueueItems,
  fetchQueueItemCounts,
  createQueue,
  updateQueue,
  deleteQueue,
  addQueueItem,
  retryQueueItem,
  deleteQueueItem,
  deleteQueueItemsBatch,
  fetchOrchestrators,
  fetchFolders,
} from "../../services/api";
import ConfirmModal from "../ConfirmModal";
import CustomSelect from "../CustomSelect";
import Checkbox from "../Checkbox";

const STATUS_META = {
  New: { label: "Novo", color: "text-accent", bg: "bg-accent/15" },
  InProgress: { label: "Em progresso", color: "text-status-paused", bg: "bg-status-paused/15" },
  Failed: { label: "Falhou", color: "text-status-error", bg: "bg-status-error/15" },
  Successful: { label: "Sucesso", color: "text-status-running", bg: "bg-status-running/15" },
  Abandoned: { label: "Abandonado", color: "text-white/40", bg: "bg-white/5" },
  Retried: { label: "Retentado", color: "text-status-paused", bg: "bg-status-paused/15" },
  Deleted: { label: "Excluído", color: "text-white/30", bg: "bg-white/5" },
};
const STATUS_ORDER = ["New", "InProgress", "Failed", "Successful", "Abandoned", "Retried", "Deleted"];
const RETRYABLE = new Set(["Failed", "Abandoned"]);
const ITEMS_PAGE_SIZE = 25;
const PRIORITIES = [
  { value: "Low", label: "Baixa" },
  { value: "Normal", label: "Normal" },
  { value: "High", label: "Alta" },
];

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

const queueKey = (q) => `${q._orchestratorId}::${q.Id}`;

function InfoField({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[9px] uppercase tracking-wider text-white/25 mb-0.5">{label}</p>
      <div className="text-xs text-white/70 truncate">{children}</div>
    </div>
  );
}

function InfoBool({ label, value }) {
  return (
    <InfoField label={label}>
      <span className={value ? "text-status-running" : "text-white/30"}>
        {value ? "Sim" : "Não"}
      </span>
    </InfoField>
  );
}

function ContentGrid({ data }) {
  const entries = data && typeof data === "object" ? Object.entries(data) : [];
  if (!entries.length) return <p className="text-[11px] text-white/25 font-mono">— vazio —</p>;
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col sm:flex-row sm:gap-2">
          <span className="text-[11px] font-mono text-white/40 sm:w-44 shrink-0 sm:truncate" title={k}>{k}</span>
          <span className="text-[11px] font-mono text-white/70 break-all min-w-0">
            {v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ItemDetails({ item }) {
  const exc = item.ProcessingException;
  const output = item.Output || item.OutputData;
  return (
    <div className="px-3 pb-3 pl-8 space-y-3 bg-surface-900/40">
      <div>
        <p className="text-[9px] uppercase tracking-wider text-white/25 mb-1.5">Conteúdo (SpecificContent)</p>
        <ContentGrid data={item.SpecificContent} />
      </div>

      {output && typeof output === "object" && Object.keys(output).length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/25 mb-1.5">Output</p>
          <ContentGrid data={output} />
        </div>
      )}

      {exc && (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-status-error/60 mb-1">Exceção</p>
          <p className="text-[11px] text-status-error break-words font-mono">
            {item.ProcessingExceptionType ? `[${item.ProcessingExceptionType}] ` : ""}
            {typeof exc === "object" ? (exc.Reason || exc.Details || JSON.stringify(exc)) : String(exc)}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-white/30 pt-1">
        <span>Início: {item.StartProcessing ? formatDateTime(item.StartProcessing) : "—"}</span>
        <span>Fim: {item.EndProcessing ? formatDateTime(item.EndProcessing) : "—"}</span>
        <span>Tentativa: {item.RetryNumber ?? 0}</span>
        {item.Progress && <span>Progresso: {item.Progress}</span>}
        <span>Key: {item.Key}</span>
      </div>
    </div>
  );
}

export default function QueuesPage({ addToast, userRole }) {
  const canWrite = userRole !== "viewer";

  const [queues, setQueues] = useState([]);
  const [failedOrchs, setFailedOrchs] = useState([]);
  const [orchestrators, setOrchestrators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [orchFilter, setOrchFilter] = useState("all");

  // Estado das transações por fila (key = orchId::queueId)
  const [expandedKey, setExpandedKey] = useState(null);
  const [itemsByKey, setItemsByKey] = useState({});
  const [countsByKey, setCountsByKey] = useState({});
  const [statusByKey, setStatusByKey] = useState({});
  const [itemsLoadingKey, setItemsLoadingKey] = useState(null);
  const [itemActionId, setItemActionId] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemPage, setItemPage] = useState(0);
  const [itemTotal, setItemTotal] = useState(0);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [pendingBatchDelete, setPendingBatchDelete] = useState(null);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // Modais
  const [editingQueue, setEditingQueue] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [queueForm, setQueueForm] = useState(null);
  const [savingQueue, setSavingQueue] = useState(false);
  const [folderOptions, setFolderOptions] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const [addItemQueue, setAddItemQueue] = useState(null);
  const [itemForm, setItemForm] = useState(null);
  const [addingItem, setAddingItem] = useState(false);

  const [pendingDeleteQueue, setPendingDeleteQueue] = useState(null);
  const [deletingQueue, setDeletingQueue] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchQueues(), fetchOrchestrators()])
      .then(([queuesData, orchData]) => {
        setQueues(queuesData.value || []);
        setFailedOrchs(queuesData.failed || []);
        setOrchestrators(orchData || []);
      })
      .catch(() => {
        setQueues([]);
        addToast?.("error", "Erro ao carregar filas");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  const orchestratorNames = useMemo(() => {
    const names = new Map();
    for (const o of orchestrators) names.set(o.id, o.name);
    for (const q of queues) {
      if (q._orchestratorId && q._orchestratorName) names.set(q._orchestratorId, q._orchestratorName);
    }
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orchestrators, queues]);

  // Só orchestrators COM o scope (que não estão em failed) podem receber criação.
  const createOrchestratorNames = useMemo(() => {
    const failedIds = new Set(failedOrchs.map((o) => o.id));
    return orchestratorNames.filter(([id]) => !failedIds.has(id));
  }, [orchestratorNames, failedOrchs]);

  const search = searchTerm.toLowerCase().trim();

  const filteredQueues = useMemo(() => {
    return queues.filter((q) => {
      if (orchFilter !== "all" && q._orchestratorId !== orchFilter) return false;
      if (search) {
        const haystack = `${q.Name || ""} ${q.Description || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [queues, orchFilter, search]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const q of filteredQueues) {
      const key = q._orchestratorId || "unknown";
      if (!groups[key]) groups[key] = { name: q._orchestratorName || key, queues: [] };
      groups[key].queues.push(q);
    }
    return Object.entries(groups).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredQueues]);

  // ─── Transações ──────────────────────────────

  const expandedQueue = useMemo(
    () => queues.find((q) => queueKey(q) === expandedKey) || null,
    [queues, expandedKey]
  );

  const loadCounts = useCallback(async (queue) => {
    const key = queueKey(queue);
    try {
      const countsData = await fetchQueueItemCounts(queue.Id, queue._orchestratorId, queue._folderId);
      setCountsByKey((prev) => ({ ...prev, [key]: countsData.counts || {} }));
    } catch { /* contadores são secundários — silencioso */ }
  }, []);

  const loadItems = useCallback(async (queue, { status = "all", search = "", page = 0, silent = false } = {}) => {
    const key = queueKey(queue);
    if (!silent) setItemsLoadingKey(key);  // silent = atualização em background (polling), sem spinner
    try {
      const data = await fetchQueueItems(queue.Id, queue._orchestratorId, queue._folderId, {
        status, reference: search, top: ITEMS_PAGE_SIZE, skip: page * ITEMS_PAGE_SIZE,
      });
      setItemsByKey((prev) => ({ ...prev, [key]: data.value || [] }));
      setItemTotal(data["@odata.count"] || 0);
    } catch (err) {
      if (!silent) {
        setItemsByKey((prev) => ({ ...prev, [key]: [] }));
        setItemTotal(0);
        addToast?.("error", `Erro ao carregar transações: ${err.message}`);
      }
    } finally {
      if (!silent) setItemsLoadingKey(null);
    }
  }, [addToast]);

  // Recarrega itens (página atual) + contadores — em background (sem flash de loading).
  // Usado após ações e pelo polling da fila aberta.
  const refreshItems = useCallback((queue) => {
    const key = queueKey(queue);
    loadCounts(queue);
    loadItems(queue, { status: statusByKey[key] || "all", search: itemSearch, page: itemPage, silent: true });
  }, [loadCounts, loadItems, statusByKey, itemSearch, itemPage]);

  const toggleExpand = useCallback((queue) => {
    const key = queueKey(queue);
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    setItemSearch("");
    setItemPage(0);
    setExpandedItemId(null);
    setSelectedItems(new Set());
    loadCounts(queue);
    loadItems(queue, { status: statusByKey[key] || "all", search: "", page: 0 });
  }, [expandedKey, statusByKey, loadCounts, loadItems]);

  const handleStatusFilter = useCallback((queue, status) => {
    const key = queueKey(queue);
    const next = statusByKey[key] === status ? "all" : status;
    setStatusByKey((prev) => ({ ...prev, [key]: next }));
    setItemPage(0);
    loadItems(queue, { status: next, search: itemSearch, page: 0 });
  }, [statusByKey, itemSearch, loadItems]);

  const goToPage = useCallback((queue, page) => {
    const key = queueKey(queue);
    setItemPage(page);
    loadItems(queue, { status: statusByKey[key] || "all", search: itemSearch, page });
  }, [statusByKey, itemSearch, loadItems]);

  const toggleItemSelected = useCallback((id) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback((pageItems) => {
    setSelectedItems((prev) => {
      const allSel = pageItems.length > 0 && pageItems.every((it) => prev.has(it.Id));
      const next = new Set(prev);
      pageItems.forEach((it) => { if (allSel) next.delete(it.Id); else next.add(it.Id); });
      return next;
    });
  }, []);

  // Seleciona TODAS as transações que casam o filtro atual (todas as páginas),
  // buscando os ids de uma vez (o checkbox do topo só marca a página visível).
  const selectAllMatching = useCallback(async (queue) => {
    const key = queueKey(queue);
    setSelectingAll(true);
    try {
      const data = await fetchQueueItems(queue.Id, queue._orchestratorId, queue._folderId, {
        status: statusByKey[key] || "all", reference: itemSearch, top: itemTotal, skip: 0,
      });
      setSelectedItems(new Set((data.value || []).map((it) => it.Id)));
    } catch (err) {
      addToast?.("error", `Erro ao selecionar todas: ${err.message}`);
    } finally {
      setSelectingAll(false);
    }
  }, [statusByKey, itemSearch, itemTotal, addToast]);

  const handleBatchDeleteItems = useCallback(async () => {
    if (!pendingBatchDelete) return;
    const { queue, ids } = pendingBatchDelete;
    setDeletingBatch(true);
    try {
      const res = await deleteQueueItemsBatch(queue._orchestratorId, queue._folderId, ids);
      addToast?.("success", `${res.deleted} transação${res.deleted !== 1 ? "ões" : ""} excluída${res.deleted !== 1 ? "s" : ""}`);
      if (res.failed?.length) addToast?.("error", `${res.failed.length} não puderam ser excluídas`);
      setSelectedItems(new Set());
      refreshItems(queue);
    } catch (err) {
      addToast?.("error", `Erro ao excluir: ${err.message}`);
    } finally {
      setDeletingBatch(false);
      setPendingBatchDelete(null);
    }
  }, [pendingBatchDelete, refreshItems, addToast]);

  // Busca por referência (debounce)
  useEffect(() => {
    if (!expandedQueue) return;
    const key = queueKey(expandedQueue);
    const t = setTimeout(() => {
      setItemPage(0);
      loadItems(expandedQueue, { status: statusByKey[key] || "all", search: itemSearch, page: 0 });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSearch]);

  // Polling suave: enquanto uma fila está expandida, atualiza contadores + itens a cada 15s
  // (em background, sem flash de loading), pra acompanhar a fila andando sem F5.
  const pollRef = useRef(() => {});
  pollRef.current = () => { if (expandedQueue) refreshItems(expandedQueue); };
  useEffect(() => {
    if (!expandedKey) return;
    const t = setInterval(() => pollRef.current(), 15000);
    return () => clearInterval(t);
  }, [expandedKey]);

  // ─── CRUD da fila ────────────────────────────

  const loadFolders = useCallback(async (orchestratorId) => {
    if (!orchestratorId) { setFolderOptions([]); return; }
    setFoldersLoading(true);
    try {
      const data = await fetchFolders(orchestratorId);
      const opts = data.value || [];
      setFolderOptions(opts);
      setQueueForm((f) => (f ? { ...f, folderId: opts[0]?.id || "" } : f));
    } catch {
      setFolderOptions([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const openCreate = useCallback(() => {
    const orchId = createOrchestratorNames[0]?.[0] || "";
    setIsCreating(true);
    setEditingQueue({});
    setFolderOptions([]);
    setQueueForm({
      orchestratorId: orchId,
      folderId: "",
      name: "",
      description: "",
      maxNumberOfRetries: 0,
      acceptAutomaticallyRetry: false,
      enforceUniqueReference: false,
      encrypted: false,
    });
    loadFolders(orchId);
  }, [createOrchestratorNames, loadFolders]);

  const openEdit = useCallback((queue) => {
    setIsCreating(false);
    setEditingQueue(queue);
    setQueueForm({
      orchestratorId: queue._orchestratorId,
      folderId: queue._folderId,
      name: queue.Name || "",
      description: queue.Description || "",
      maxNumberOfRetries: queue.MaxNumberOfRetries ?? 0,
      acceptAutomaticallyRetry: !!queue.AcceptAutomaticallyRetry,
      enforceUniqueReference: !!queue.EnforceUniqueReference,
      encrypted: !!queue.Encrypted,
    });
  }, []);

  const handleSaveQueue = useCallback(async () => {
    if (!queueForm) return;
    if (!queueForm.name.trim()) {
      addToast?.("error", "Informe o nome da fila");
      return;
    }
    if (isCreating && !queueForm.folderId) {
      addToast?.("error", "Selecione a pasta (folder) da fila");
      return;
    }
    setSavingQueue(true);
    try {
      if (isCreating) {
        await createQueue(queueForm);
        addToast?.("success", `Fila "${queueForm.name}" criada`);
      } else {
        await updateQueue({ ...queueForm, queueId: editingQueue.Id });
        addToast?.("success", `Fila "${queueForm.name}" atualizada`);
      }
      const data = await fetchQueues();
      setQueues(data.value || []);
      setFailedOrchs(data.failed || []);
      setEditingQueue(null);
    } catch (err) {
      addToast?.("error", `Erro ao salvar fila: ${err.message}`);
    } finally {
      setSavingQueue(false);
    }
  }, [queueForm, isCreating, editingQueue, addToast]);

  const handleDeleteQueue = useCallback(async () => {
    if (!pendingDeleteQueue) return;
    setDeletingQueue(true);
    try {
      await deleteQueue(pendingDeleteQueue._orchestratorId, pendingDeleteQueue._folderId, pendingDeleteQueue.Id, pendingDeleteQueue.Name);
      setQueues((prev) => prev.filter((q) => queueKey(q) !== queueKey(pendingDeleteQueue)));
      addToast?.("success", `Fila "${pendingDeleteQueue.Name}" excluída`);
    } catch (err) {
      addToast?.("error", `Erro ao excluir: ${err.message}`);
    } finally {
      setDeletingQueue(false);
      setPendingDeleteQueue(null);
    }
  }, [pendingDeleteQueue, addToast]);

  // ─── Transações: add / retry / delete ────────

  const openAddItem = useCallback((queue) => {
    setAddItemQueue(queue);
    setItemForm({ reference: "", priority: "Normal", content: [{ key: "", value: "" }] });
  }, []);

  const handleAddItem = useCallback(async () => {
    if (!addItemQueue || !itemForm) return;
    setAddingItem(true);
    try {
      const specificContent = {};
      for (const row of itemForm.content) {
        if (row.key.trim()) specificContent[row.key.trim()] = row.value;
      }
      await addQueueItem({
        orchestratorId: addItemQueue._orchestratorId,
        folderId: addItemQueue._folderId,
        queueName: addItemQueue.Name,
        priority: itemForm.priority,
        reference: itemForm.reference.trim() || null,
        specificContent,
      });
      addToast?.("success", "Transação adicionada");
      setAddItemQueue(null);
      refreshItems(addItemQueue);
    } catch (err) {
      addToast?.("error", `Erro ao adicionar transação: ${err.message}`);
    } finally {
      setAddingItem(false);
    }
  }, [addItemQueue, itemForm, refreshItems, addToast]);

  const handleRetryItem = useCallback(async (queue, item) => {
    setItemActionId(item.Id);
    try {
      const res = await retryQueueItem(queue._orchestratorId, queue._folderId, item.Id);
      if (res?.suffixed) {
        addToast?.("success", `Reprocessada com nova referência: "${res.reference}" (a fila exige referência única)`);
      } else {
        addToast?.("success", "Transação reenfileirada para reprocessamento");
      }
      refreshItems(queue);
    } catch (err) {
      addToast?.("error", `Erro ao reprocessar: ${err.message}`);
    } finally {
      setItemActionId(null);
    }
  }, [refreshItems, addToast]);

  const handleDeleteItem = useCallback(async () => {
    if (!pendingDeleteItem) return;
    const { queue, item } = pendingDeleteItem;
    setDeletingItem(true);
    try {
      await deleteQueueItem(queue._orchestratorId, queue._folderId, item.Id);
      addToast?.("success", "Transação excluída");
      refreshItems(queue);
    } catch (err) {
      addToast?.("error", `Erro ao excluir transação: ${err.message}`);
    } finally {
      setDeletingItem(false);
      setPendingDeleteItem(null);
    }
  }, [pendingDeleteItem, refreshItems, addToast]);

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[
          { label: "Total de Filas", value: queues.length, color: "text-accent" },
          { label: "Orchestrators", value: orchestratorNames.length, color: "text-white/50" },
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
        <div className="relative flex-1 sm:max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            placeholder="Buscar por nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-700/50 border border-white/5 rounded-lg pl-9 pr-4 py-2 text-sm text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 transition-all"
          />
        </div>

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
            {filteredQueues.length} resultado{filteredQueues.length !== 1 ? "s" : ""}
          </span>
          {canWrite && (
            <button
              onClick={openCreate}
              disabled={createOrchestratorNames.length === 0}
              title={createOrchestratorNames.length === 0 ? "Nenhum orchestrator com o scope OR.Queues" : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Nova Fila
            </button>
          )}
        </div>
      </div>

      {/* Aviso de orchestrators sem permissão (403 = falta scope OR.Queues.Read) */}
      {!loading && failedOrchs.length > 0 && (
        <div className="rounded-xl border border-status-paused/30 bg-status-paused/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-status-paused shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-status-paused">
              {failedOrchs.length} orchestrator{failedOrchs.length !== 1 ? "s" : ""} não retornaram as filas
            </p>
            <p className="text-[11px] text-white/40 mt-0.5">
              Provável falta do scope <span className="font-mono text-white/60">OR.Queues.Read</span> / <span className="font-mono text-white/60">OR.Queues.Write</span> na External Application. Veja o passo a passo em Configurações → "Como conectar?".
            </p>
            <p className="text-[11px] text-white/30 mt-1 font-mono truncate">
              {failedOrchs.map((o) => o.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-white/20 text-sm font-mono gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando filas...
        </div>
      )}

      {!loading && filteredQueues.length === 0 && (
        <div className="text-center py-16 text-white/20 text-sm font-mono">
          {search || orchFilter !== "all"
            ? "Nenhuma fila encontrada para essa busca."
            : "Nenhuma fila encontrada nos orchestrators."}
        </div>
      )}

      {/* Grouped queues */}
      {!loading && grouped.map(([orchId, group], gi) => (
        <motion.div
          key={orchId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.1 }}
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-white">{group.name}</h2>
            <p className="text-[11px] text-white/30 mt-0.5 font-mono">
              {group.queues.length} FILA{group.queues.length !== 1 ? "S" : ""}
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden divide-y divide-white/[0.03]">
            {group.queues.map((queue) => {
              const key = queueKey(queue);
              const isExpanded = expandedKey === key;
              const items = itemsByKey[key] || [];
              const counts = countsByKey[key] || {};
              const activeStatus = statusByKey[key] || "all";
              const isItemsLoading = itemsLoadingKey === key;

              return (
                <div key={key}>
                  {/* Queue row */}
                  <div
                    onClick={() => toggleExpand(queue)}
                    className="px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                          <Layers className="w-4 h-4 text-accent/50 shrink-0" />
                          <span className="text-sm font-medium text-white/80 truncate">{queue.Name}</span>
                          {queue.EnforceUniqueReference && (
                            <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40 shrink-0" title="Referência única obrigatória">
                              <ShieldCheck className="w-3 h-3" /> REF ÚNICA
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap ml-6">
                          {queue._folderName && (
                            <span className="flex items-center gap-1 text-[11px] text-white/30 font-mono" title="Pasta (folder)">
                              <Folder className="w-3 h-3" /> {queue._folderName}
                            </span>
                          )}
                          {queue.Description && (
                            <span className="text-xs text-white/40 truncate">{queue.Description}</span>
                          )}
                          <span className="flex items-center gap-1 text-[11px] text-white/25 font-mono">
                            <RotateCcw className="w-3 h-3" /> {queue.MaxNumberOfRetries ?? 0} retries
                          </span>
                        </div>
                      </div>

                      {canWrite && (
                        <div
                          className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => openAddItem(queue)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> Item
                          </button>
                          <button
                            onClick={() => openEdit(queue)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs font-medium hover:bg-white/5 hover:text-white/80 transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={() => setPendingDeleteQueue(queue)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-status-error/20 text-status-error/60 text-xs font-medium hover:bg-status-error/10 hover:text-status-error transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded: transações */}
                  {isExpanded && (
                    <div className="bg-surface-900/40 border-t border-white/[0.03] px-4 sm:px-5 py-4 space-y-3">
                      {/* Detalhes da fila */}
                      <div className="rounded-lg border border-white/5 bg-surface-800/40 p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5">
                          {queue.Description && (
                            <InfoField label="Descrição" className="col-span-2 sm:col-span-3 lg:col-span-4">
                              {queue.Description}
                            </InfoField>
                          )}
                          <InfoField label="Pasta">{queue._folderName || "—"}</InfoField>
                          <InfoField label="Criada em">{formatDateTime(queue.CreationTime)}</InfoField>
                          <InfoField label="Máx. retries">{queue.MaxNumberOfRetries ?? 0}</InfoField>
                          <InfoBool label="Retry automático" value={queue.AcceptAutomaticallyRetry} />
                          <InfoBool label="Retenta abandonadas" value={queue.RetryAbandonedItems} />
                          <InfoBool label="Referência única" value={queue.EnforceUniqueReference} />
                          <InfoBool label="Criptografada" value={queue.Encrypted} />
                          <InfoField label="SLA (min)">{queue.SlaInMinutes || "—"}</InfoField>
                          <InfoField label="Risco SLA (min)">{queue.RiskSlaInMinutes || "—"}</InfoField>
                          <InfoField label="ID">{queue.Id}</InfoField>
                          <InfoField label="Key" className="col-span-2">
                            <span className="font-mono truncate block" title={queue.Key}>{queue.Key}</span>
                          </InfoField>
                        </div>
                      </div>

                      {/* Status count chips (clicáveis = filtro) */}
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_ORDER.map((st) => {
                          const meta = STATUS_META[st];
                          const n = counts[st] ?? 0;
                          const selected = activeStatus === st;
                          return (
                            <button
                              key={st}
                              onClick={() => handleStatusFilter(queue, st)}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer border ${
                                selected
                                  ? `${meta.bg} ${meta.color} border-current/30`
                                  : "border-white/5 text-white/30 hover:text-white/60 hover:border-white/10"
                              }`}
                            >
                              {meta.label}
                              <span className="font-bold">{n}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Busca por referência */}
                      <div className="relative sm:max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                        <input
                          type="text"
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          placeholder="Buscar por referência..."
                          className="w-full bg-surface-800/60 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                        />
                      </div>

                      {isItemsLoading && (
                        <div className="flex items-center gap-2 text-white/20 text-xs font-mono py-4">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando transações...
                        </div>
                      )}

                      {!isItemsLoading && items.length === 0 && (
                        <div className="text-white/15 text-xs font-mono py-4">
                          Nenhuma transação {activeStatus !== "all" ? `com status "${STATUS_META[activeStatus]?.label}"` : ""} nesta fila.
                        </div>
                      )}

                      {!isItemsLoading && items.length > 0 && (
                        <div className="rounded-lg border border-white/5 overflow-hidden divide-y divide-white/[0.03]">
                          {/* Barra de seleção em lote */}
                          {canWrite && (
                            <div className="px-3 py-2 flex items-center gap-3 bg-surface-800/40 flex-wrap">
                              <Checkbox
                                checked={items.length > 0 && items.every((it) => selectedItems.has(it.Id))}
                                indeterminate={items.some((it) => selectedItems.has(it.Id)) && !items.every((it) => selectedItems.has(it.Id))}
                                onChange={() => toggleSelectAllOnPage(items)}
                                title="Selecionar todas desta página"
                              />
                              <span className="text-[10px] text-white/40 font-mono">
                                {selectedItems.size > 0 ? `${selectedItems.size} selecionada${selectedItems.size !== 1 ? "s" : ""}` : "Selecionar transações"}
                              </span>

                              {/* Selecionar TODAS as que casam o filtro (todas as páginas) */}
                              {items.length > 0 && items.every((it) => selectedItems.has(it.Id)) && itemTotal > items.length && selectedItems.size < itemTotal && (
                                <button
                                  onClick={() => selectAllMatching(queue)}
                                  disabled={selectingAll}
                                  className="text-[10px] font-mono text-accent hover:text-accent-light transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {selectingAll ? "Selecionando..." : `Selecionar todas as ${itemTotal}`}
                                </button>
                              )}
                              {itemTotal > 0 && selectedItems.size >= itemTotal && (
                                <span className="text-[10px] font-mono text-status-running">todas as {itemTotal} selecionadas</span>
                              )}

                              {selectedItems.size > 0 && (
                                <div className="ml-auto flex items-center gap-2">
                                  <button
                                    onClick={() => setSelectedItems(new Set())}
                                    className="text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                                  >
                                    Limpar
                                  </button>
                                  <button
                                    onClick={() => setPendingBatchDelete({ queue, ids: [...selectedItems] })}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-status-error/30 text-status-error text-[10px] font-medium hover:bg-status-error/10 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" /> Excluir selecionadas
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          {items.map((item) => {
                            const meta = STATUS_META[item.Status] || { label: item.Status, color: "text-white/40", bg: "bg-white/5" };
                            const acting = itemActionId === item.Id;
                            const isItemOpen = expandedItemId === item.Id;
                            return (
                              <div key={item.Id}>
                                <div
                                  onClick={() => setExpandedItemId(isItemOpen ? null : item.Id)}
                                  className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 hover:bg-white/[0.02] cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {canWrite && (
                                      <Checkbox
                                        checked={selectedItems.has(item.Id)}
                                        onChange={() => toggleItemSelected(item.Id)}
                                      />
                                    )}
                                    {isItemOpen
                                      ? <ChevronDown className="w-3 h-3 text-white/30 shrink-0" />
                                      : <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />}
                                    <Hash className="w-3 h-3 text-white/20 shrink-0" />
                                    <span className="text-xs text-white/70 font-mono truncate">
                                      {item.Reference || `#${item.Id}`}
                                    </span>
                                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${meta.bg} ${meta.color}`}>
                                      {meta.label.toUpperCase()}
                                    </span>
                                    {item.Priority && item.Priority !== "Normal" && (
                                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40 shrink-0">
                                        {item.Priority === "High" ? "ALTA" : "BAIXA"}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-[10px] text-white/20 font-mono">
                                      {formatDateTime(item.CreationTime)}
                                    </span>
                                    {canWrite && (
                                      <div className="flex items-center gap-1.5">
                                        {RETRYABLE.has(item.Status) && (
                                          <button
                                            onClick={() => handleRetryItem(queue, item)}
                                            disabled={acting}
                                            title="Reprocessar (cria nova transação)"
                                            className="flex items-center gap-1 px-2 py-1 rounded border border-status-paused/30 text-status-paused text-[10px] font-medium hover:bg-status-paused/10 transition-all cursor-pointer disabled:opacity-50"
                                          >
                                            {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                            Retry
                                          </button>
                                        )}
                                        <button
                                          onClick={() => setPendingDeleteItem({ queue, item })}
                                          className="flex items-center px-2 py-1 rounded border border-status-error/20 text-status-error/60 text-[10px] font-medium hover:bg-status-error/10 hover:text-status-error transition-all cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {isItemOpen && <ItemDetails item={item} />}
                              </div>
                            );
                          })}
                          {/* Paginação */}
                          <div className="px-3 py-2 flex items-center justify-between gap-3">
                            <span className="text-[10px] text-white/25 font-mono">
                              {itemPage * ITEMS_PAGE_SIZE + 1}–{Math.min((itemPage + 1) * ITEMS_PAGE_SIZE, itemTotal)} de {itemTotal}
                            </span>
                            {itemTotal > ITEMS_PAGE_SIZE && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => goToPage(queue, itemPage - 1)}
                                  disabled={itemPage === 0}
                                  className="w-6 h-6 rounded-md border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                </button>
                                <span className="text-[10px] text-white/30 font-mono px-1">
                                  {itemPage + 1} / {Math.ceil(itemTotal / ITEMS_PAGE_SIZE)}
                                </span>
                                <button
                                  onClick={() => goToPage(queue, itemPage + 1)}
                                  disabled={(itemPage + 1) * ITEMS_PAGE_SIZE >= itemTotal}
                                  className="w-6 h-6 rounded-md border border-white/5 flex items-center justify-center text-white/30 hover:text-white/60 hover:border-white/10 transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* Confirm: excluir fila */}
      <ConfirmModal
        open={!!pendingDeleteQueue}
        title="Excluir fila"
        message={`Tem certeza que deseja EXCLUIR a fila "${pendingDeleteQueue?.Name}"?\n\nEsta ação não pode ser desfeita. A fila e suas transações serão removidas do Orchestrator.`}
        confirmLabel={deletingQueue ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleDeleteQueue}
        onCancel={() => setPendingDeleteQueue(null)}
      />

      {/* Confirm: excluir transação */}
      <ConfirmModal
        open={!!pendingDeleteItem}
        title="Excluir transação"
        message={`Excluir a transação "${pendingDeleteItem?.item?.Reference || `#${pendingDeleteItem?.item?.Id}`}"?\n\nEsta ação não pode ser desfeita.`}
        confirmLabel={deletingItem ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleDeleteItem}
        onCancel={() => setPendingDeleteItem(null)}
      />

      {/* Confirm: excluir transações em lote */}
      <ConfirmModal
        open={!!pendingBatchDelete}
        title="Excluir transações selecionadas"
        message={`Excluir ${pendingBatchDelete?.ids?.length || 0} transação${(pendingBatchDelete?.ids?.length || 0) !== 1 ? "ões" : ""} selecionada${(pendingBatchDelete?.ids?.length || 0) !== 1 ? "s" : ""}?\n\nEsta ação não pode ser desfeita.`}
        confirmLabel={deletingBatch ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleBatchDeleteItems}
        onCancel={() => setPendingBatchDelete(null)}
      />

      {/* Modal: criar/editar fila */}
      {editingQueue && queueForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingQueue(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 md:p-6 pb-0 shrink-0">
              <h3 className="text-sm font-semibold text-white">{isCreating ? "Nova Fila" : "Editar Fila"}</h3>
              <button onClick={() => setEditingQueue(null)} className="text-white/20 hover:text-white/50 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 md:p-6">
              <div className="space-y-4">
                {isCreating && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Orchestrator</label>
                      <CustomSelect
                        value={queueForm.orchestratorId}
                        onChange={(v) => { setQueueForm((f) => ({ ...f, orchestratorId: v, folderId: "" })); loadFolders(v); }}
                        placeholder="Selecionar orchestrator..."
                        options={createOrchestratorNames.map(([id, name]) => ({ value: id, label: name }))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">
                        Pasta (folder){foldersLoading ? " — carregando..." : ""}
                      </label>
                      <CustomSelect
                        value={queueForm.folderId}
                        onChange={(v) => setQueueForm((f) => ({ ...f, folderId: v }))}
                        placeholder={foldersLoading ? "Carregando folders..." : "Selecionar folder..."}
                        options={folderOptions.map((f) => ({ value: f.id, label: f.name }))}
                        className="w-full"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Nome</label>
                  <input
                    type="text"
                    value={queueForm.name}
                    disabled={!isCreating}
                    onChange={(e) => setQueueForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {!isCreating && (
                    <p className="text-[10px] text-white/25 mt-1">O nome da fila não pode ser alterado após a criação.</p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Descrição</label>
                  <textarea
                    value={queueForm.description}
                    onChange={(e) => setQueueForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 resize-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Máx. de tentativas (retries)</label>
                  <input
                    type="number"
                    min={0}
                    value={queueForm.maxNumberOfRetries}
                    onChange={(e) => setQueueForm((f) => ({ ...f, maxNumberOfRetries: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>

                <div className="space-y-2">
                  {[
                    { key: "acceptAutomaticallyRetry", label: "Retentar automaticamente" },
                    { key: "enforceUniqueReference", label: "Exigir referência única" },
                    ...(isCreating ? [{ key: "encrypted", label: "Criptografar conteúdo" }] : []),
                  ].map((opt) => (
                    <div key={opt.key} className="flex items-center justify-between">
                      <label className="text-xs text-white/50">{opt.label}</label>
                      <button
                        onClick={() => setQueueForm((f) => ({ ...f, [opt.key]: !f[opt.key] }))}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
                          queueForm[opt.key]
                            ? "border-status-running/30 text-status-running bg-status-running/10"
                            : "border-white/10 text-white/30 bg-white/5"
                        }`}
                      >
                        {queueForm[opt.key] ? "Sim" : "Não"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 md:p-6 pt-0 shrink-0">
              <button
                onClick={() => setEditingQueue(null)}
                className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveQueue}
                disabled={savingQueue}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-light cursor-pointer disabled:opacity-50"
              >
                {savingQueue && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: adicionar transação */}
      {addItemQueue && itemForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddItemQueue(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 md:p-6 pb-0 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-white">Nova Transação</h3>
                <p className="text-[11px] text-white/30 font-mono mt-0.5">{addItemQueue.Name}</p>
              </div>
              <button onClick={() => setAddItemQueue(null)} className="text-white/20 hover:text-white/50 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 md:p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Referência (opcional)</label>
                  <input
                    type="text"
                    value={itemForm.reference}
                    onChange={(e) => setItemForm((f) => ({ ...f, reference: e.target.value }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Prioridade</label>
                  <CustomSelect
                    value={itemForm.priority}
                    onChange={(v) => setItemForm((f) => ({ ...f, priority: v }))}
                    options={PRIORITIES}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-white/30">Conteúdo (SpecificContent)</label>
                    <button
                      onClick={() => setItemForm((f) => ({ ...f, content: [...f.content, { key: "", value: "" }] }))}
                      className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-light cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Campo
                    </button>
                  </div>
                  <div className="space-y-2">
                    {itemForm.content.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="chave"
                          value={row.key}
                          onChange={(e) => setItemForm((f) => {
                            const content = [...f.content];
                            content[idx] = { ...content[idx], key: e.target.value };
                            return { ...f, content };
                          })}
                          className="flex-1 min-w-0 bg-surface-900/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white/70 font-mono focus:outline-none focus:border-accent/30"
                        />
                        <input
                          type="text"
                          placeholder="valor"
                          value={row.value}
                          onChange={(e) => setItemForm((f) => {
                            const content = [...f.content];
                            content[idx] = { ...content[idx], value: e.target.value };
                            return { ...f, content };
                          })}
                          className="flex-1 min-w-0 bg-surface-900/60 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white/70 font-mono focus:outline-none focus:border-accent/30"
                        />
                        <button
                          onClick={() => setItemForm((f) => ({ ...f, content: f.content.filter((_, i) => i !== idx) }))}
                          className="text-white/20 hover:text-status-error cursor-pointer shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-white/25 mt-1.5">Os valores são enviados como texto.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 md:p-6 pt-0 shrink-0">
              <button
                onClick={() => setAddItemQueue(null)}
                className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddItem}
                disabled={addingItem}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-light cursor-pointer disabled:opacity-50"
              >
                {addingItem && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
