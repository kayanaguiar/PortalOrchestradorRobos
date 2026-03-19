import { useState, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchOrchestrators, saveOrchestrators, testOrchestrator, saveSettings } from "../../services/api";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function SettingsPage({ pollingInterval, onPollingChange, searchTerm = "" }) {
  const [orchestrators, setOrchestrators] = useState([]);
  const [localInterval, setLocalInterval] = useState(pollingInterval);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showSecrets, setShowSecrets] = useState({});

  // Carrega orchestrators do backend
  useEffect(() => {
    fetchOrchestrators()
      .then((data) => setOrchestrators(data))
      .catch(() => setLoadError("Backend offline — inicie o servidor Python"));
  }, []);

  const updateOrch = (id, field, value) => {
    setOrchestrators((prev) =>
      prev.map((o) => (o.id === id ? { ...o, [field]: value } : o))
    );
  };

  const removeOrchestrator = (id) => {
    setOrchestrators((prev) => prev.filter((o) => o.id !== id));
  };

  const toggleSecret = (id) => {
    setShowSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const addOrchestrator = () => {
    setOrchestrators((prev) => [
      ...prev,
      {
        id: `orch-${Date.now()}`,
        name: "",
        baseUrl: "",
        folderId: "",
        clientId: "",
        clientSecret: "",
        status: "disconnected",
      },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await Promise.all([
        saveOrchestrators(orchestrators),
        saveSettings({ pollingInterval: localInterval }),
      ]);
      onPollingChange(localInterval);
      setSaveStatus("ok");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleTest = async (orch) => {
    setTestingId(orch.id);
    try {
      const result = await testOrchestrator(orch);
      setTestResults((prev) => ({ ...prev, [orch.id]: result }));
      if (result.connected) {
        updateOrch(orch.id, "status", "connected");
      } else {
        updateOrch(orch.id, "status", "error");
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [orch.id]: { connected: false, detail: "Falha na conexão" },
      }));
      updateOrch(orch.id, "status", "error");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="px-4 py-3 rounded-lg border border-status-paused/30 bg-status-paused/10 text-status-paused text-xs font-mono">
          {loadError}
        </div>
      )}

      {/* General settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/5 bg-surface-800/60 p-6"
      >
        <h2 className="text-sm font-semibold text-white mb-4">Configurações Gerais</h2>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-white/30 mb-2 block">
            Intervalo de Atualização (segundos)
          </label>
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-white/20" />
            <input
              type="number"
              value={localInterval}
              onChange={(e) => setLocalInterval(Number(e.target.value))}
              min={5}
              max={300}
              className="bg-surface-700/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 font-mono w-24 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
            />
            <span className="text-xs text-white/30">
              Polling a cada {localInterval}s nos Orchestrators
            </span>
          </div>
        </div>
      </motion.div>

      {/* Orchestrators */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Orchestrators</h2>
          <p className="text-[11px] text-white/30 mt-0.5 font-mono">
            {orchestrators.length} CONFIGURADOS
          </p>
        </div>
        <button
          onClick={addOrchestrator}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar
        </button>
      </div>

      <div className="space-y-4">
        {orchestrators.filter((o) => {
          if (!searchTerm) return true;
          const s = searchTerm.toLowerCase();
          return o.name?.toLowerCase().includes(s) || o.baseUrl?.toLowerCase().includes(s);
        }).map((orch, i) => {
          const isConnected = orch.status === "connected";
          const testResult = testResults[orch.id];
          const isTesting = testingId === orch.id;
          return (
            <motion.div
              key={orch.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="rounded-xl border border-white/5 bg-surface-800/60 p-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isConnected ? "bg-status-running/10" : "bg-status-error/10"}`}>
                    {isConnected ? (
                      <Wifi className="w-5 h-5 text-status-running" />
                    ) : (
                      <WifiOff className="w-5 h-5 text-status-error" />
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-white">
                      {orch.name || "Novo Orchestrator"}
                    </span>
                    <span className={`ml-2 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase ${
                      isConnected
                        ? "bg-status-running/15 text-status-running"
                        : orch.status === "error"
                          ? "bg-status-error/15 text-status-error"
                          : "bg-white/5 text-white/30"
                    }`}>
                      {isConnected ? "Conectado" : orch.status === "error" ? "Erro" : "Não testado"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest(orch)}
                    disabled={isTesting || !orch.baseUrl || !orch.folderId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/20 text-accent text-xs hover:bg-accent/10 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Testar
                  </button>
                  <button
                    onClick={() => removeOrchestrator(orch.id)}
                    className="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center text-white/20 hover:text-status-error hover:border-status-error/20 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2 ${
                  testResult.connected
                    ? "bg-status-running/10 text-status-running"
                    : "bg-status-error/10 text-status-error"
                }`}>
                  {testResult.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {testResult.connected
                    ? `Conectado — ${testResult.logCount || 0} logs disponíveis`
                    : `Falha: ${testResult.detail || "Erro desconhecido"}`}
                </div>
              )}

              {/* Config fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Nome</label>
                  <input
                    type="text"
                    value={orch.name}
                    onChange={(e) => updateOrch(orch.id, "name", e.target.value)}
                    placeholder="Ex: Orchestrator Financeiro"
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 placeholder:text-white/15 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">URL Base (OData)</label>
                  <input
                    type="text"
                    value={orch.baseUrl}
                    onChange={(e) => updateOrch(orch.id, "baseUrl", e.target.value)}
                    placeholder="https://cloud.uipath.com/org/tenant/orchestrator_/odata"
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 font-mono text-xs placeholder:text-white/15 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Folder ID</label>
                  <input
                    type="text"
                    value={orch.folderId}
                    onChange={(e) => updateOrch(orch.id, "folderId", e.target.value)}
                    placeholder="Ex: 7602685"
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 font-mono placeholder:text-white/15 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Client ID</label>
                  <input
                    type="text"
                    value={orch.clientId || ""}
                    onChange={(e) => updateOrch(orch.id, "clientId", e.target.value)}
                    placeholder="Ex: 1073ff9e-80e5-..."
                    className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 text-sm text-white/70 font-mono text-xs placeholder:text-white/15 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5 block">Client Secret</label>
                  <div className="relative">
                    <input
                      type={showSecrets[orch.id] ? "text" : "password"}
                      value={orch.clientSecret || ""}
                      onChange={(e) => updateOrch(orch.id, "clientSecret", e.target.value)}
                      placeholder="Cole o client secret aqui"
                      className="w-full bg-surface-900/60 border border-white/5 rounded-lg px-3 py-2 pr-9 text-sm text-white/70 font-mono text-xs placeholder:text-white/15 focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/20"
                    />
                    <button
                      onClick={() => toggleSecret(orch.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 cursor-pointer"
                    >
                      {showSecrets[orch.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        {saveStatus === "ok" && (
          <span className="flex items-center gap-1.5 text-xs text-status-running font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" /> Salvo com sucesso
          </span>
        )}
        {saveStatus === "error" && (
          <span className="flex items-center gap-1.5 text-xs text-status-error font-mono">
            <XCircle className="w-3.5 h-3.5" /> Erro ao salvar
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-light transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
