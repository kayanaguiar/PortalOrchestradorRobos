import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Users, Plus, Pencil, Trash2, Shield, Eye, Wrench, X, Check, Share2, Radio, UserX, UserCheck } from "lucide-react";
import { fetchUsers, createUser, updateUser, deleteUser, reactivateUser, fetchUserOrchestrators, saveUserOrchestrators } from "../../services/api";
import ConfirmModal from "../ConfirmModal";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "text-accent" },
  operator: { label: "Operador", icon: Wrench, color: "text-status-running" },
  viewer: { label: "Visualizador", icon: Eye, color: "text-white/40" },
};

const ROLE_OPTIONS = [
  { value: "admin", label: "Administrador" },
  { value: "operator", label: "Operador" },
  { value: "viewer", label: "Visualizador" },
];

function UserForm({ initial, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(initial?.role || "viewer");

  const isEdit = !!initial;

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { name, email, role };
    if (!isEdit) data.password = password;
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-surface-700/30 border border-white/5 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full bg-surface-900/80 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-accent/40 transition-all"
            placeholder="Nome completo"
          />
        </div>
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-surface-900/80 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-accent/40 transition-all"
            placeholder="usuario@email.com"
          />
        </div>
        {!isEdit && (
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-surface-900/80 border border-white/[0.06] rounded-lg px-3 py-2.5 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-accent/40 transition-all"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">Perfil</label>
          <div className="flex gap-2">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  role === opt.value
                    ? "bg-accent/15 border-accent/30 text-accent"
                    : "bg-surface-900/60 border-white/[0.06] text-white/40 hover:border-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar Usuário"}
        </button>
      </div>
    </form>
  );
}

function SharePanel({ user, onClose, addToast }) {
  const [shared, setShared] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUserOrchestrators(user.id)
      .then((data) => {
        setShared(data.shared || []);
        setAvailable(data.available || []);
      })
      .catch((err) => addToast?.("error", err.message))
      .finally(() => setLoading(false));
  }, [user.id]);

  const toggle = (orchId) => {
    setShared((prev) =>
      prev.includes(orchId) ? prev.filter((id) => id !== orchId) : [...prev, orchId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserOrchestrators(user.id, shared);
      addToast?.("success", `Orchestrators compartilhados com ${user.name}`);
      onClose();
    } catch (err) {
      addToast?.("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  // Orchestrators que NÃO são do próprio user
  const othersOrchs = available.filter((o) => o.ownerId !== user.id);

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-surface-700/30 border border-white/5 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-white">
            Compartilhar orchestrators com {user.name}
          </span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-4 text-white/20 font-mono text-xs">Carregando...</div>
      ) : othersOrchs.length === 0 ? (
        <div className="text-center py-4 text-white/20 text-xs">
          Nenhum orchestrator de outros usuários disponível
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-white/20 tracking-wider uppercase">
            Selecione os orchestrators que este usuário pode acessar
          </p>
          {othersOrchs.map((orch) => {
            const isShared = shared.includes(orch.id);
            return (
              <button
                key={orch.id}
                onClick={() => toggle(orch.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all cursor-pointer ${
                  isShared
                    ? "bg-accent/10 border-accent/30"
                    : "bg-surface-900/60 border-white/[0.04] hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Radio className={`w-4 h-4 ${isShared ? "text-accent" : "text-white/20"}`} />
                  <span className={`text-sm ${isShared ? "text-accent font-medium" : "text-white/60"}`}>
                    {orch.name}
                  </span>
                </div>
                {isShared && <Check className="w-4 h-4 text-accent" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </motion.div>
  );
}

export default function UsersPage({ addToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sharingUser, setSharingUser] = useState(null);

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err) {
      addToast?.("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (data) => {
    setSaving(true);
    try {
      await createUser(data);
      addToast?.("success", "Usuário criado com sucesso");
      setShowForm(false);
      loadUsers();
    } catch (err) {
      addToast?.("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data) => {
    setSaving(true);
    try {
      await updateUser(editingUser.id, data);
      addToast?.("success", "Usuário atualizado com sucesso");
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      addToast?.("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await deleteUser(deleteTarget.id);
      addToast?.("success", "Usuário inativado com sucesso");
      setDeleteTarget(null);
      loadUsers();
    } catch (err) {
      addToast?.("error", err.message);
      setDeleteTarget(null);
    }
  };

  const handleReactivate = async (userId) => {
    try {
      await reactivateUser(userId);
      addToast?.("success", "Usuário reativado com sucesso");
      loadUsers();
    } catch (err) {
      addToast?.("error", err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Usuários</h2>
            <p className="font-mono text-[10px] text-white/20 tracking-wider uppercase">
              {users.length} cadastrado{users.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {!showForm && !editingUser && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <UserForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving} />
        </motion.div>
      )}

      {/* Edit form */}
      {editingUser && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <UserForm initial={editingUser} onSave={handleUpdate} onCancel={() => setEditingUser(null)} saving={saving} />
        </motion.div>
      )}

      {/* Share panel */}
      {sharingUser && (
        <SharePanel user={sharingUser} onClose={() => setSharingUser(null)} addToast={addToast} />
      )}

      {/* Users list */}
      {loading ? (
        <div className="text-center py-12 text-white/20 font-mono text-sm">Carregando...</div>
      ) : (
        <div className="space-y-2">
          {users.map((user, i) => {
            const roleConf = ROLE_CONFIG[user.role] || ROLE_CONFIG.viewer;
            const RoleIcon = roleConf.icon;
            return (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`flex items-center justify-between bg-surface-800/60 border rounded-xl px-5 py-4 group transition-all ${
                  user.active === false ? "border-white/[0.02] opacity-50" : "border-white/[0.04] hover:border-white/[0.08]"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                    user.active === false ? "bg-white/5 border-white/10" : "bg-accent/10 border-accent/20"
                  }`}>
                    <span className={`font-bold text-xs ${user.active === false ? "text-white/30" : "text-accent"}`}>
                      {user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${user.active === false ? "text-white/40" : "text-white/80"}`}>{user.name}</p>
                      {user.active === false && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-status-error/10 text-status-error/60 uppercase">Inativo</span>
                      )}
                    </div>
                    <p className="text-xs text-white/30 font-mono">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-1.5 ${roleConf.color}`}>
                    <RoleIcon className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{roleConf.label}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {user.active !== false ? (
                      <>
                        <button
                          onClick={() => { setSharingUser(user); setEditingUser(null); setShowForm(false); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-accent hover:bg-accent/10 transition-all cursor-pointer"
                          title="Compartilhar Orchestrators"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingUser(user); setShowForm(false); setSharingUser(null); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-accent hover:bg-accent/10 transition-all cursor-pointer"
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-status-error hover:bg-status-error/10 transition-all cursor-pointer"
                          title="Inativar"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReactivate(user.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-status-running hover:bg-status-running/10 transition-all cursor-pointer"
                        title="Reativar"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Roles description */}
      <div className="bg-surface-800/40 border border-white/[0.04] rounded-xl p-5">
        <p className="font-mono text-[10px] text-white/20 tracking-wider uppercase mb-3">Permissões por Perfil</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-accent">
              <Shield className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Administrador</span>
            </div>
            <p className="text-[11px] text-white/30">Acesso total: usuários, orchestrators, configurações e todas as ações</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-status-running">
              <Wrench className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Operador</span>
            </div>
            <p className="text-[11px] text-white/30">Iniciar, parar, reiniciar robôs, gerenciar gatilhos e atualizar versões</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-white/40">
              <Eye className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Visualizador</span>
            </div>
            <p className="text-[11px] text-white/30">Apenas visualização: dashboard, robôs, logs e gatilhos (sem ações)</p>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Inativar usuário"
        message={`Tem certeza que deseja inativar o usuário "${deleteTarget?.name}"?\n\nO usuário não poderá mais fazer login. Os orchestrators dele serão transferidos para você. Você pode reativá-lo depois.`}
        confirmLabel="Inativar"
        variant="danger"
        onConfirm={handleDeactivate}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
