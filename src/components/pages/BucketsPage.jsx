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
  Database,
  Folder,
  Download,
  Upload,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  fetchBuckets,
  fetchBucketFiles,
  createBucket,
  updateBucket,
  deleteBucket,
  deleteBucketFile,
  uploadBucketFile,
  downloadBucketFile,
  fetchOrchestrators,
  fetchFolders,
} from "../../services/api";
import ConfirmModal from "../ConfirmModal";
import CustomSelect from "../CustomSelect";

const bucketKey = (b) => `${b._orchestratorId}::${b.Id}`;

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function BucketsPage({ addToast, userRole }) {
  const canWrite = userRole !== "viewer";

  const [buckets, setBuckets] = useState([]);
  const [failedOrchs, setFailedOrchs] = useState([]);
  const [orchestrators, setOrchestrators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [orchFilter, setOrchFilter] = useState("all");

  const [expandedKey, setExpandedKey] = useState(null);
  const [filesByKey, setFilesByKey] = useState({});
  const [filesLoadingKey, setFilesLoadingKey] = useState(null);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [fileActionPath, setFileActionPath] = useState(null);

  const [editingBucket, setEditingBucket] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [bucketForm, setBucketForm] = useState(null);
  const [savingBucket, setSavingBucket] = useState(false);
  const [folderOptions, setFolderOptions] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const [pendingDeleteBucket, setPendingDeleteBucket] = useState(null);
  const [deletingBucket, setDeletingBucket] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] = useState(null);
  const [deletingFile, setDeletingFile] = useState(false);

  const uploadInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBuckets(), fetchOrchestrators()])
      .then(([bucketsData, orchData]) => {
        setBuckets(bucketsData.value || []);
        setFailedOrchs(bucketsData.failed || []);
        setOrchestrators(orchData || []);
      })
      .catch(() => {
        setBuckets([]);
        addToast?.("error", "Erro ao carregar buckets");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  const orchestratorNames = useMemo(() => {
    const names = new Map();
    for (const o of orchestrators) names.set(o.id, o.name);
    for (const b of buckets) {
      if (b._orchestratorId && b._orchestratorName) names.set(b._orchestratorId, b._orchestratorName);
    }
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orchestrators, buckets]);

  // Só orchestrators COM o scope (que não estão em failed) podem receber criação.
  const createOrchestratorNames = useMemo(() => {
    const failedIds = new Set(failedOrchs.map((o) => o.id));
    return orchestratorNames.filter(([id]) => !failedIds.has(id));
  }, [orchestratorNames, failedOrchs]);

  const search = searchTerm.toLowerCase().trim();

  const filteredBuckets = useMemo(() => {
    return buckets.filter((b) => {
      if (orchFilter !== "all" && b._orchestratorId !== orchFilter) return false;
      if (search) {
        const haystack = `${b.Name || ""} ${b.Description || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [buckets, orchFilter, search]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const b of filteredBuckets) {
      const key = b._orchestratorId || "unknown";
      if (!groups[key]) groups[key] = { name: b._orchestratorName || key, buckets: [] };
      groups[key].buckets.push(b);
    }
    return Object.entries(groups).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredBuckets]);

  // ─── Arquivos ────────────────────────────────

  const loadFiles = useCallback(async (bucket) => {
    const key = bucketKey(bucket);
    setFilesLoadingKey(key);
    try {
      const data = await fetchBucketFiles(bucket.Id, bucket._orchestratorId, bucket._folderId, "/");
      setFilesByKey((prev) => ({ ...prev, [key]: data.value || [] }));
    } catch (err) {
      setFilesByKey((prev) => ({ ...prev, [key]: [] }));
      addToast?.("error", `Erro ao carregar arquivos: ${err.message}`);
    } finally {
      setFilesLoadingKey(null);
    }
  }, [addToast]);

  const toggleExpand = useCallback((bucket) => {
    const key = bucketKey(bucket);
    if (expandedKey === key) { setExpandedKey(null); return; }
    setExpandedKey(key);
    if (!filesByKey[key]) loadFiles(bucket);
  }, [expandedKey, filesByKey, loadFiles]);

  // ─── CRUD do bucket ──────────────────────────

  const loadFolders = useCallback(async (orchestratorId) => {
    if (!orchestratorId) { setFolderOptions([]); return; }
    setFoldersLoading(true);
    try {
      const data = await fetchFolders(orchestratorId);
      const opts = data.value || [];
      setFolderOptions(opts);
      setBucketForm((f) => (f ? { ...f, folderId: opts[0]?.id || "" } : f));
    } catch {
      setFolderOptions([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const openCreate = useCallback(() => {
    const orchId = createOrchestratorNames[0]?.[0] || "";
    setIsCreating(true);
    setEditingBucket({});
    setFolderOptions([]);
    setBucketForm({ orchestratorId: orchId, folderId: "", name: "", description: "" });
    loadFolders(orchId);
  }, [createOrchestratorNames, loadFolders]);

  const openEdit = useCallback((bucket) => {
    setIsCreating(false);
    setEditingBucket(bucket);
    setBucketForm({
      orchestratorId: bucket._orchestratorId,
      folderId: bucket._folderId,
      name: bucket.Name || "",
      description: bucket.Description || "",
    });
  }, []);

  const handleSaveBucket = useCallback(async () => {
    if (!bucketForm) return;
    if (!bucketForm.name.trim()) { addToast?.("error", "Informe o nome do bucket"); return; }
    if (isCreating && !bucketForm.folderId) { addToast?.("error", "Selecione a pasta (folder)"); return; }
    setSavingBucket(true);
    try {
      if (isCreating) {
        await createBucket(bucketForm);
        addToast?.("success", `Bucket "${bucketForm.name}" criado`);
      } else {
        await updateBucket({ ...bucketForm, bucketId: editingBucket.Id });
        addToast?.("success", `Bucket "${bucketForm.name}" atualizado`);
      }
      const data = await fetchBuckets();
      setBuckets(data.value || []);
      setFailedOrchs(data.failed || []);
      setEditingBucket(null);
    } catch (err) {
      addToast?.("error", `Erro ao salvar bucket: ${err.message}`);
    } finally {
      setSavingBucket(false);
    }
  }, [bucketForm, isCreating, editingBucket, addToast]);

  const handleDeleteBucket = useCallback(async () => {
    if (!pendingDeleteBucket) return;
    setDeletingBucket(true);
    try {
      await deleteBucket(pendingDeleteBucket._orchestratorId, pendingDeleteBucket._folderId, pendingDeleteBucket.Id, pendingDeleteBucket.Name);
      setBuckets((prev) => prev.filter((b) => bucketKey(b) !== bucketKey(pendingDeleteBucket)));
      addToast?.("success", `Bucket "${pendingDeleteBucket.Name}" excluído`);
    } catch (err) {
      addToast?.("error", `Erro ao excluir: ${err.message}`);
    } finally {
      setDeletingBucket(false);
      setPendingDeleteBucket(null);
    }
  }, [pendingDeleteBucket, addToast]);

  // ─── Arquivos: upload / download / delete ────

  const triggerUpload = useCallback((bucket) => {
    uploadTargetRef.current = bucket;
    uploadInputRef.current?.click();
  }, []);

  const handleUploadChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    const bucket = uploadTargetRef.current;
    if (!file || !bucket) return;
    const key = bucketKey(bucket);
    setUploadingKey(key);
    try {
      await uploadBucketFile({
        bucketId: bucket.Id,
        orchestratorId: bucket._orchestratorId,
        folderId: bucket._folderId,
        path: file.name,
        file,
      });
      addToast?.("success", `"${file.name}" enviado`);
      loadFiles(bucket);
    } catch (err) {
      addToast?.("error", `Erro no upload: ${err.message}`);
    } finally {
      setUploadingKey(null);
    }
  }, [loadFiles, addToast]);

  const handleDownload = useCallback(async (bucket, file) => {
    const path = file.FullPath || file.Path;
    setFileActionPath(path);
    try {
      await downloadBucketFile({
        bucketId: bucket.Id,
        orchestratorId: bucket._orchestratorId,
        folderId: bucket._folderId,
        path,
      });
    } catch (err) {
      addToast?.("error", `Erro no download: ${err.message}`);
    } finally {
      setFileActionPath(null);
    }
  }, [addToast]);

  const handleDeleteFile = useCallback(async () => {
    if (!pendingDeleteFile) return;
    const { bucket, file } = pendingDeleteFile;
    const path = file.FullPath || file.Path;
    setDeletingFile(true);
    try {
      await deleteBucketFile(bucket._orchestratorId, bucket._folderId, bucket.Id, path);
      addToast?.("success", "Arquivo excluído");
      loadFiles(bucket);
    } catch (err) {
      addToast?.("error", `Erro ao excluir arquivo: ${err.message}`);
    } finally {
      setDeletingFile(false);
      setPendingDeleteFile(null);
    }
  }, [pendingDeleteFile, loadFiles, addToast]);

  return (
    <div className="space-y-6">
      <input ref={uploadInputRef} type="file" className="hidden" onChange={handleUploadChange} />

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[
          { label: "Total de Buckets", value: buckets.length, color: "text-accent" },
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
            {filteredBuckets.length} resultado{filteredBuckets.length !== 1 ? "s" : ""}
          </span>
          {canWrite && (
            <button
              onClick={openCreate}
              disabled={createOrchestratorNames.length === 0}
              title={createOrchestratorNames.length === 0 ? "Nenhum orchestrator com o scope OR.Buckets" : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Novo Bucket
            </button>
          )}
        </div>
      </div>

      {/* Aviso de orchestrators sem permissão */}
      {!loading && failedOrchs.length > 0 && (
        <div className="rounded-xl border border-status-paused/30 bg-status-paused/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-status-paused shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-status-paused">
              {failedOrchs.length} orchestrator{failedOrchs.length !== 1 ? "s" : ""} não retornaram os buckets
            </p>
            <p className="text-[11px] text-white/40 mt-0.5">
              Provável falta do scope <span className="font-mono text-white/60">OR.Buckets</span> na External Application. Veja em Configurações → "Como conectar?".
            </p>
            <p className="text-[11px] text-white/30 mt-1 font-mono truncate">
              {failedOrchs.map((o) => o.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-white/20 text-sm font-mono gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando buckets...
        </div>
      )}

      {!loading && filteredBuckets.length === 0 && (
        <div className="text-center py-16 text-white/20 text-sm font-mono">
          {search || orchFilter !== "all"
            ? "Nenhum bucket encontrado para essa busca."
            : "Nenhum bucket encontrado nos orchestrators."}
        </div>
      )}

      {/* Grouped buckets */}
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
              {group.buckets.length} BUCKET{group.buckets.length !== 1 ? "S" : ""}
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden divide-y divide-white/[0.03]">
            {group.buckets.map((bucket) => {
              const key = bucketKey(bucket);
              const isExpanded = expandedKey === key;
              const files = filesByKey[key] || [];
              const isFilesLoading = filesLoadingKey === key;
              const isUploading = uploadingKey === key;

              return (
                <div key={key}>
                  <div
                    onClick={() => toggleExpand(bucket)}
                    className="px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
                          <Database className="w-4 h-4 text-accent/50 shrink-0" />
                          <span className="text-sm font-medium text-white/80 truncate">{bucket.Name}</span>
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap ml-6">
                          {bucket._folderName && (
                            <span className="flex items-center gap-1 text-[11px] text-white/30 font-mono" title="Pasta (folder)">
                              <Folder className="w-3 h-3" /> {bucket._folderName}
                            </span>
                          )}
                          {bucket.Description && (
                            <span className="text-xs text-white/40 truncate">{bucket.Description}</span>
                          )}
                        </div>
                      </div>

                      {canWrite && (
                        <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => triggerUpload(bucket)}
                            disabled={isUploading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Enviar
                          </button>
                          <button
                            onClick={() => openEdit(bucket)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs font-medium hover:bg-white/5 hover:text-white/80 transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={() => setPendingDeleteBucket(bucket)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-status-error/20 text-status-error/60 text-xs font-medium hover:bg-status-error/10 hover:text-status-error transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded: arquivos */}
                  {isExpanded && (
                    <div className="bg-surface-900/40 border-t border-white/[0.03] px-4 sm:px-5 py-4">
                      {isFilesLoading && (
                        <div className="flex items-center gap-2 text-white/20 text-xs font-mono py-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando arquivos...
                        </div>
                      )}

                      {!isFilesLoading && files.length === 0 && (
                        <div className="text-white/15 text-xs font-mono py-2">
                          Bucket vazio. {canWrite ? 'Use "Enviar" para adicionar um arquivo.' : ""}
                        </div>
                      )}

                      {!isFilesLoading && files.length > 0 && (
                        <div className="rounded-lg border border-white/5 overflow-hidden divide-y divide-white/[0.03]">
                          {files.map((file) => {
                            const path = file.FullPath || file.Path;
                            const acting = fileActionPath === path;
                            return (
                              <div key={path} className="px-3 py-2.5 flex items-center gap-3 hover:bg-white/[0.02]">
                                <FileText className="w-3.5 h-3.5 text-white/20 shrink-0" />
                                <span className="text-xs text-white/70 font-mono truncate flex-1 min-w-0">{path}</span>
                                {file.LastModified && (
                                  <span className="text-[10px] text-white/30 font-mono shrink-0 hidden sm:inline">{formatDateTime(file.LastModified)}</span>
                                )}
                                <span className="text-[10px] text-white/25 font-mono shrink-0">{formatSize(file.Size)}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => handleDownload(bucket, file)}
                                    disabled={acting}
                                    title="Baixar"
                                    className="flex items-center gap-1 px-2 py-1 rounded border border-accent/30 text-accent text-[10px] font-medium hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                  </button>
                                  {canWrite && (
                                    <button
                                      onClick={() => setPendingDeleteFile({ bucket, file })}
                                      title="Excluir"
                                      className="flex items-center px-2 py-1 rounded border border-status-error/20 text-status-error/60 text-[10px] font-medium hover:bg-status-error/10 hover:text-status-error transition-all cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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

      {/* Confirm: excluir bucket */}
      <ConfirmModal
        open={!!pendingDeleteBucket}
        title="Excluir bucket"
        message={`Tem certeza que deseja EXCLUIR o bucket "${pendingDeleteBucket?.Name}"?\n\nEsta ação não pode ser desfeita. O bucket e seus arquivos serão removidos do Orchestrator.`}
        confirmLabel={deletingBucket ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleDeleteBucket}
        onCancel={() => setPendingDeleteBucket(null)}
      />

      {/* Confirm: excluir arquivo */}
      <ConfirmModal
        open={!!pendingDeleteFile}
        title="Excluir arquivo"
        message={`Excluir o arquivo "${pendingDeleteFile?.file?.FullPath || pendingDeleteFile?.file?.Path}"?\n\nEsta ação não pode ser desfeita.`}
        confirmLabel={deletingFile ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleDeleteFile}
        onCancel={() => setPendingDeleteFile(null)}
      />

      {/* Modal: criar/editar bucket */}
      {editingBucket && bucketForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingBucket(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 md:p-6 pb-0 shrink-0">
              <h3 className="text-sm font-semibold text-white">{isCreating ? "Novo Bucket" : "Editar Bucket"}</h3>
              <button onClick={() => setEditingBucket(null)} className="text-white/20 hover:text-white/50 cursor-pointer">
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
                        value={bucketForm.orchestratorId}
                        onChange={(v) => { setBucketForm((f) => ({ ...f, orchestratorId: v, folderId: "" })); loadFolders(v); }}
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
                        value={bucketForm.folderId}
                        onChange={(v) => setBucketForm((f) => ({ ...f, folderId: v }))}
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
                    value={bucketForm.name}
                    onChange={(e) => setBucketForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Descrição</label>
                  <textarea
                    value={bucketForm.description}
                    onChange={(e) => setBucketForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 md:p-6 pt-0 shrink-0">
              <button
                onClick={() => setEditingBucket(null)}
                className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveBucket}
                disabled={savingBucket}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-light cursor-pointer disabled:opacity-50"
              >
                {savingBucket && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
