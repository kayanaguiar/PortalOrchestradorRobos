import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  KeyRound,
  Folder,
  Type,
  Hash,
  ToggleLeft,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import {
  fetchAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  fetchOrchestrators,
  fetchFolders,
} from "../../services/api";
import ConfirmModal from "../ConfirmModal";
import CustomSelect from "../CustomSelect";

const assetKey = (a) => `${a._orchestratorId}::${a.Id}`;

const TYPE_META = {
  Text: { label: "Texto", icon: Type, color: "text-accent" },
  Integer: { label: "Inteiro", icon: Hash, color: "text-status-running" },
  Bool: { label: "Booleano", icon: ToggleLeft, color: "text-status-paused" },
  Credential: { label: "Credencial", icon: Lock, color: "text-status-error" },
};

const TYPE_OPTIONS = [
  { value: "Text", label: "Texto" },
  { value: "Integer", label: "Inteiro" },
  { value: "Bool", label: "Booleano" },
  { value: "Credential", label: "Credencial" },
];

function displayValue(a) {
  switch (a.ValueType) {
    case "Text": return a.StringValue || a.Value || "—";
    case "Integer": return String(a.IntValue ?? 0);
    case "Bool": return a.BoolValue ? "Verdadeiro" : "Falso";
    case "Credential": return "••••••••";
    default: return a.Value || "—";
  }
}

export default function AssetsPage({ addToast, userRole }) {
  const canWrite = userRole !== "viewer";

  const [assets, setAssets] = useState([]);
  const [failedOrchs, setFailedOrchs] = useState([]);
  const [orchestrators, setOrchestrators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [orchFilter, setOrchFilter] = useState("all");

  const [editing, setEditing] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [folderOptions, setFolderOptions] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAssets(), fetchOrchestrators()])
      .then(([assetsData, orchData]) => {
        setAssets(assetsData.value || []);
        setFailedOrchs(assetsData.failed || []);
        setOrchestrators(orchData || []);
      })
      .catch(() => {
        setAssets([]);
        addToast?.("error", "Erro ao carregar assets");
      })
      .finally(() => setLoading(false));
  }, [addToast]);

  const orchestratorNames = useMemo(() => {
    const names = new Map();
    for (const o of orchestrators) names.set(o.id, o.name);
    for (const a of assets) {
      if (a._orchestratorId && a._orchestratorName) names.set(a._orchestratorId, a._orchestratorName);
    }
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orchestrators, assets]);

  // Só orchestrators COM o scope (que não estão em failed) podem receber criação.
  const createOrchestratorNames = useMemo(() => {
    const failedIds = new Set(failedOrchs.map((o) => o.id));
    return orchestratorNames.filter(([id]) => !failedIds.has(id));
  }, [orchestratorNames, failedOrchs]);

  const search = searchTerm.toLowerCase().trim();

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (orchFilter !== "all" && a._orchestratorId !== orchFilter) return false;
      if (search) {
        const haystack = `${a.Name || ""} ${a.Description || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [assets, orchFilter, search]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const a of filteredAssets) {
      const key = a._orchestratorId || "unknown";
      if (!groups[key]) groups[key] = { name: a._orchestratorName || key, assets: [] };
      groups[key].assets.push(a);
    }
    return Object.entries(groups).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filteredAssets]);

  const loadFolders = useCallback(async (orchestratorId) => {
    if (!orchestratorId) { setFolderOptions([]); return; }
    setFoldersLoading(true);
    try {
      const data = await fetchFolders(orchestratorId);
      const opts = data.value || [];
      setFolderOptions(opts);
      setForm((f) => (f ? { ...f, folderId: opts[0]?.id || "" } : f));
    } catch {
      setFolderOptions([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const emptyValues = { stringValue: "", intValue: 0, boolValue: false, credentialUsername: "", credentialPassword: "" };

  const openCreate = useCallback(() => {
    const orchId = createOrchestratorNames[0]?.[0] || "";
    setIsCreating(true);
    setEditing({});
    setFolderOptions([]);
    setForm({ orchestratorId: orchId, folderId: "", name: "", description: "", valueType: "Text", valueScope: "Global", ...emptyValues });
    loadFolders(orchId);
  }, [createOrchestratorNames, loadFolders]);

  const openEdit = useCallback((asset) => {
    setIsCreating(false);
    setEditing(asset);
    setForm({
      orchestratorId: asset._orchestratorId,
      folderId: asset._folderId,
      name: asset.Name || "",
      description: asset.Description || "",
      valueType: asset.ValueType,
      valueScope: asset.ValueScope,
      stringValue: asset.StringValue || "",
      intValue: asset.IntValue ?? 0,
      boolValue: !!asset.BoolValue,
      credentialUsername: "",
      credentialPassword: "",
    });
  }, []);

  const buildValuePayload = useCallback((f) => {
    const p = {};
    if (f.valueType === "Text") p.stringValue = f.stringValue;
    else if (f.valueType === "Integer") p.intValue = parseInt(f.intValue) || 0;
    else if (f.valueType === "Bool") p.boolValue = !!f.boolValue;
    else if (f.valueType === "Credential") {
      p.credentialUsername = f.credentialUsername ? f.credentialUsername : null;
      p.credentialPassword = f.credentialPassword ? f.credentialPassword : null;
    }
    return p;
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;
    if (!form.name.trim()) { addToast?.("error", "Informe o nome do asset"); return; }
    if (isCreating && !form.folderId) { addToast?.("error", "Selecione a pasta (folder)"); return; }
    setSaving(true);
    try {
      if (isCreating) {
        await createAsset({
          orchestratorId: form.orchestratorId,
          folderId: form.folderId,
          name: form.name,
          description: form.description,
          valueType: form.valueType,
          valueScope: form.valueScope,
          ...buildValuePayload(form),
        });
        addToast?.("success", `Asset "${form.name}" criado`);
      } else {
        await updateAsset({
          orchestratorId: form.orchestratorId,
          folderId: form.folderId,
          assetId: editing.Id,
          name: form.name,
          description: form.description,
          valueType: form.valueType,
          ...buildValuePayload(form),
        });
        addToast?.("success", `Asset "${form.name}" atualizado`);
      }
      const data = await fetchAssets();
      setAssets(data.value || []);
      setFailedOrchs(data.failed || []);
      setEditing(null);
    } catch (err) {
      addToast?.("error", `Erro ao salvar asset: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }, [form, isCreating, editing, buildValuePayload, addToast]);

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteAsset(pendingDelete._orchestratorId, pendingDelete._folderId, pendingDelete.Id, pendingDelete.Name);
      setAssets((prev) => prev.filter((a) => assetKey(a) !== assetKey(pendingDelete)));
      addToast?.("success", `Asset "${pendingDelete.Name}" excluído`);
    } catch (err) {
      addToast?.("error", `Erro ao excluir: ${err.message}`);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }, [pendingDelete, addToast]);

  const isCredential = form?.valueType === "Credential";

  return (
    <div className="space-y-6">
      {/* Counters */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[
          { label: "Total de Assets", value: assets.length, color: "text-accent" },
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
            {filteredAssets.length} resultado{filteredAssets.length !== 1 ? "s" : ""}
          </span>
          {canWrite && (
            <button
              onClick={openCreate}
              disabled={createOrchestratorNames.length === 0}
              title={createOrchestratorNames.length === 0 ? "Nenhum orchestrator com o scope OR.Assets" : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Novo Asset
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
              {failedOrchs.length} orchestrator{failedOrchs.length !== 1 ? "s" : ""} não retornaram os assets
            </p>
            <p className="text-[11px] text-white/40 mt-0.5">
              Provável falta do scope <span className="font-mono text-white/60">OR.Assets</span> na External Application. Veja em Configurações → "Como conectar?".
            </p>
            <p className="text-[11px] text-white/30 mt-1 font-mono truncate">
              {failedOrchs.map((o) => o.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-white/20 text-sm font-mono gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando assets...
        </div>
      )}

      {!loading && filteredAssets.length === 0 && (
        <div className="text-center py-16 text-white/20 text-sm font-mono">
          {search || orchFilter !== "all"
            ? "Nenhum asset encontrado para essa busca."
            : "Nenhum asset encontrado nos orchestrators."}
        </div>
      )}

      {/* Grouped assets */}
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
              {group.assets.length} ASSET{group.assets.length !== 1 ? "S" : ""}
            </p>
          </div>

          <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden divide-y divide-white/[0.03]">
            {group.assets.map((asset) => {
              const meta = TYPE_META[asset.ValueType] || TYPE_META.Text;
              const Icon = meta.icon;
              return (
                <div key={assetKey(asset)} className="px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} />
                        <span className="text-sm font-medium text-white/80 truncate">{asset.Name}</span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 bg-white/5 ${meta.color}`}>
                          {meta.label.toUpperCase()}
                        </span>
                        {asset.ValueScope === "PerRobot" && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 bg-white/5 text-white/40">
                            POR ROBÔ
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap ml-6">
                        {asset._folderName && (
                          <span className="flex items-center gap-1 text-[11px] text-white/30 font-mono" title="Pasta (folder)">
                            <Folder className="w-3 h-3" /> {asset._folderName}
                          </span>
                        )}
                        <span className="text-xs text-white/60 font-mono truncate">
                          {asset.ValueScope === "PerRobot" ? "valor por robô" : displayValue(asset)}
                        </span>
                        {asset.Description && (
                          <span className="text-xs text-white/40 truncate">{asset.Description}</span>
                        )}
                      </div>
                    </div>

                    {canWrite && (
                      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:shrink-0">
                        <button
                          onClick={() => openEdit(asset)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs font-medium hover:bg-white/5 hover:text-white/80 transition-all cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => setPendingDelete(asset)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-status-error/20 text-status-error/60 text-xs font-medium hover:bg-status-error/10 hover:text-status-error transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {/* Confirm: excluir asset */}
      <ConfirmModal
        open={!!pendingDelete}
        title="Excluir asset"
        message={`Tem certeza que deseja EXCLUIR o asset "${pendingDelete?.Name}"?\n\nEsta ação não pode ser desfeita.`}
        confirmLabel={deleting ? "Excluindo..." : "Excluir"}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Modal: criar/editar asset */}
      {editing && form && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 md:p-6 pb-0 shrink-0">
              <h3 className="text-sm font-semibold text-white">{isCreating ? "Novo Asset" : "Editar Asset"}</h3>
              <button onClick={() => setEditing(null)} className="text-white/20 hover:text-white/50 cursor-pointer">
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
                        value={form.orchestratorId}
                        onChange={(v) => { setForm((f) => ({ ...f, orchestratorId: v, folderId: "" })); loadFolders(v); }}
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
                        value={form.folderId}
                        onChange={(v) => setForm((f) => ({ ...f, folderId: v }))}
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
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>

                {isCreating ? (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Tipo</label>
                    <CustomSelect
                      value={form.valueType}
                      onChange={(v) => setForm((f) => ({ ...f, valueType: v }))}
                      options={TYPE_OPTIONS}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Tipo</label>
                      <div className="w-full bg-surface-900/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/40">
                        {TYPE_META[form.valueType]?.label || form.valueType}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Escopo</label>
                      <div className="w-full bg-surface-900/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/40">
                        {form.valueScope === "PerRobot" ? "Por robô" : "Global"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Aviso pra assets PerRobot legados (não criáveis em folder moderno) */}
                {!isCreating && form.valueScope === "PerRobot" && (
                  <p className="text-[11px] text-white/40 bg-white/5 rounded-lg px-3 py-2">
                    Asset por robô (folder clássico): os valores individuais por robô são definidos no Orchestrator.
                  </p>
                )}

                {form.valueType === "Text" && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Valor (texto)</label>
                    <input
                      type="text"
                      value={form.stringValue}
                      onChange={(e) => setForm((f) => ({ ...f, stringValue: e.target.value }))}
                      className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                )}

                {form.valueType === "Integer" && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Valor (inteiro)</label>
                    <input
                      type="number"
                      value={form.intValue}
                      onChange={(e) => setForm((f) => ({ ...f, intValue: e.target.value }))}
                      className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                )}

                {form.valueType === "Bool" && (
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider text-white/30">Valor (booleano)</label>
                    <button
                      onClick={() => setForm((f) => ({ ...f, boolValue: !f.boolValue }))}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
                        form.boolValue
                          ? "border-status-running/30 text-status-running bg-status-running/10"
                          : "border-white/10 text-white/30 bg-white/5"
                      }`}
                    >
                      {form.boolValue ? "Verdadeiro" : "Falso"}
                    </button>
                  </div>
                )}

                {isCredential && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Usuário</label>
                      <input
                        type="text"
                        value={form.credentialUsername}
                        onChange={(e) => setForm((f) => ({ ...f, credentialUsername: e.target.value }))}
                        placeholder={isCreating ? "" : "deixe em branco para manter o atual"}
                        className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Senha</label>
                      <input
                        type="password"
                        value={form.credentialPassword}
                        onChange={(e) => setForm((f) => ({ ...f, credentialPassword: e.target.value }))}
                        placeholder={isCreating ? "" : "deixe em branco para manter a atual"}
                        className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Descrição</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 md:p-6 pt-0 shrink-0">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
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
