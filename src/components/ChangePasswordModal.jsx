import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X, Eye, EyeOff, Lock, AlertCircle } from "lucide-react";
import { changePassword } from "../services/api";

export default function ChangePasswordModal({ open, onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      onSuccess?.("Senha alterada com sucesso");
      handleClose();
    } catch (err) {
      setError(err.message || "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-surface-800 border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
      >
        {/* Top line */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-60" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-white">Alterar Senha</span>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">Senha Atual</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full bg-surface-900/80 border border-white/[0.06] rounded-xl px-4 py-3 pr-11 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-accent/40 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors cursor-pointer"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">Nova Senha</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-surface-900/80 border border-white/[0.06] rounded-xl px-4 py-3 pr-11 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-accent/40 transition-all"
                placeholder="Mínimo 6 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">Confirmar Nova Senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-surface-900/80 border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-accent/40 transition-all"
              placeholder="Repita a nova senha"
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-status-error/10 border border-status-error/20"
            >
              <AlertCircle className="w-4 h-4 text-status-error shrink-0" />
              <span className="text-xs text-status-error/80">{error}</span>
            </motion.div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-xl text-sm text-white/40 hover:text-white/60 hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Alterando..." : "Alterar Senha"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}
