import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Wifi,
  WifiOff,
  Plus,
  ArchiveRestore,
  Trash2,
  Save,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  HelpCircle,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { fetchOrchestrators, saveOrchestrators, testOrchestrator, saveSettings } from "../../services/api";

const SCOPES_NECESSARIOS = "OR.Robots.Read OR.Jobs.Read OR.Jobs.Write OR.Folders.Read OR.Audit.Read OR.Execution.Read OR.Execution.Write OR.Monitoring.Read OR.Administration.Write";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function SettingsPage({ pollingInterval, onPollingChange, searchTerm = "", archivedProcesses = new Set(), allRobots = [], onUnarchive }) {
  const [orchestrators, setOrchestrators] = useState([]);
  const [localInterval, setLocalInterval] = useState(pollingInterval);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showSecrets, setShowSecrets] = useState({});
  const [showHelp, setShowHelp] = useState(false);

  // Carrega orchestrators do backend com retry
  const [orchLoading, setOrchLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const data = await fetchOrchestrators();
          if (!cancelled) {
            setOrchestrators(Array.isArray(data) ? data : []);
            setOrchLoading(false);
          }
          return;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!cancelled) {
        setLoadError("Erro ao carregar configurações");
        setOrchLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
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

  const orchListRef = useRef(null);

  const addOrchestrator = () => {
    setOrchestrators((prev) => [
      {
        id: `orch-${Date.now()}`,
        name: "",
        baseUrl: "",
        folderId: "",
        clientId: "",
        clientSecret: "",
        status: "disconnected",
      },
      ...prev,
    ]);
    setTimeout(() => orchListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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
    <div className="space-y-6 pb-20">
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
            {orchLoading ? "CARREGANDO..." : `${orchestrators.length} CONFIGURADOS`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 text-xs font-medium hover:bg-white/5 hover:text-white/80 transition-all cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Como conectar?
          </button>
          <button
            onClick={addOrchestrator}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>
      </div>

      <div ref={orchListRef} className="space-y-4">
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

      {/* Archived processes */}
      {archivedProcesses.size > 0 && (
        <>
          <div>
            <h2 className="text-sm font-semibold text-white">Processos Arquivados</h2>
            <p className="text-[11px] text-white/30 mt-0.5 font-mono">
              {archivedProcesses.size} ARQUIVADOS — CLIQUE PARA RESTAURAR
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-surface-800/60 overflow-hidden divide-y divide-white/[0.03]">
            {Array.from(archivedProcesses).map((key) => {
              const robot = allRobots.find((r) => r.processKey === key);
              const name = robot?.name || key.split("::")[1] || key;
              const orchestrator = robot?.orchestrator || key.split("::")[0] || "—";
              return (
                <div key={key} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div>
                    <span className="text-sm text-white/70">{name}</span>
                    <p className="text-[11px] text-white/25 font-mono">{orchestrator}</p>
                  </div>
                  <button
                    onClick={() => onUnarchive?.(key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 transition-all cursor-pointer"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    Restaurar
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Save button — fixo no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-surface-900/95 backdrop-blur-sm">
        <div className="flex items-center justify-end gap-3 px-4 md:px-8 py-3 max-w-screen-xl ml-auto">
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

      {showHelp && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)} />
          <div className="relative w-full max-w-2xl rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-0 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-white">Como conectar um Orchestrator</h3>
                <p className="text-[11px] text-white/30 font-mono mt-0.5">CONFIGURAÇÃO NO UIPATH + CAMPOS DO PORTAL</p>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-white/20 hover:text-white/50 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5 text-sm text-white/70">
              {/* Passo 1 */}
              <div>
                <h4 className="font-semibold text-white/90 mb-1.5">1. Criar a External Application no UiPath</h4>
                <p className="text-white/50 text-[13px] leading-relaxed">
                  No Automation Cloud: <span className="text-white/70">Admin → Aplicativos Externos → Adicionar Aplicativo</span>.
                  Escolha o tipo <span className="font-mono text-accent">Confidential application</span> (aplicativo confidencial).
                </p>
              </div>

              {/* Passo 2 */}
              <div>
                <h4 className="font-semibold text-white/90 mb-1.5">2. Adicionar os escopos (Application Scope)</h4>
                <p className="text-white/50 text-[13px] leading-relaxed mb-2">
                  Em <span className="text-white/70">Recursos / Escopos</span>, adicione o recurso <span className="font-mono text-accent">Orchestrator API Access</span> e
                  marque os escopos abaixo. Importante: em <span className="text-white/70">Application Scope</span>, não User Scope.
                </p>
                <div className="rounded-lg bg-surface-900/60 border border-white/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <code className="text-[11px] font-mono text-white/60 leading-relaxed break-all">{SCOPES_NECESSARIOS}</code>
                    <button
                      onClick={() => navigator.clipboard?.writeText(SCOPES_NECESSARIOS)}
                      className="shrink-0 text-[10px] font-mono text-accent border border-accent/30 rounded px-2 py-1 hover:bg-accent/10 transition-all cursor-pointer"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              </div>

              {/* Passo 3 */}
              <div>
                <h4 className="font-semibold text-white/90 mb-1.5">3. Pegar as credenciais</h4>
                <p className="text-white/50 text-[13px] leading-relaxed">
                  Depois de salvar o aplicativo, o UiPath mostra o <span className="text-white/70">App ID</span> e o <span className="text-white/70">App Secret</span>.
                  O <span className="font-mono text-accent">App Secret aparece só uma vez</span> — copie e guarde na hora.
                </p>
              </div>

              {/* Passo 4 - mapeamento dos campos */}
              <div>
                <h4 className="font-semibold text-white/90 mb-2">4. Preencher os campos do portal</h4>
                <div className="space-y-2">
                  {[
                    { campo: "Nome", valor: "Livre — só pra você identificar (ex: \"Orchestrator Financeiro\")." },
                    { campo: "URL Base (OData)", valor: "https://cloud.uipath.com/{org}/{tenant}/orchestrator_/odata — troque {org} e {tenant} pelos seus (visível na URL do Orchestrator)." },
                    { campo: "Folder ID", valor: "ID da pasta (folder) que quer monitorar. Veja na URL ao abrir a pasta no Orchestrator, ou em Configurações da pasta." },
                    { campo: "Client ID", valor: "O App ID da External Application (passo 3)." },
                    { campo: "Client Secret", valor: "O App Secret da External Application (passo 3)." },
                  ].map((item) => (
                    <div key={item.campo} className="rounded-lg bg-surface-900/60 border border-white/5 p-3">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-accent mb-0.5">{item.campo}</p>
                      <p className="text-[13px] text-white/50 leading-relaxed break-words">{item.valor}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Passo 5 */}
              <div>
                <h4 className="font-semibold text-white/90 mb-1.5">5. Testar antes de salvar</h4>
                <p className="text-white/50 text-[13px] leading-relaxed">
                  Use o botão <span className="text-white/70">Testar</span> no card do orchestrator pra validar a conexão.
                  Se aparecer verde, clique em <span className="text-white/70">Salvar Configurações</span>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-5 pt-0 shrink-0">
              <button
                onClick={() => setShowHelp(false)}
                className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-light transition-all cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
