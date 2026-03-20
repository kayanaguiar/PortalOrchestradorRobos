import { useState } from "react";
import { motion } from "motion/react";
import { Radio, Eye, EyeOff, LogIn, Shield, AlertCircle } from "lucide-react";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState(() => localStorage.getItem("rememberedEmail") || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(() => !!localStorage.getItem("rememberedEmail"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Preencha todos os campos");
      return;
    }
    if (rememberEmail) {
      localStorage.setItem("rememberedEmail", email);
    } else {
      localStorage.removeItem("rememberedEmail");
    }
    setError("");
    setLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message || "Credenciais inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 hud-grid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/[0.03] rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[420px] relative"
      >
        {/* Card */}
        <div className="bg-surface-800/70 backdrop-blur-2xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-2xl shadow-black/40">

          {/* Top accent line */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-60" />

          {/* Header / Brand */}
          <div className="pt-10 pb-6 px-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
              className="inline-flex relative mb-5"
            >
              <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center glow-accent border border-accent/20">
                <Radio className="w-8 h-8 text-accent" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-status-running rounded-full pulse-running border-2 border-surface-800" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <h1 className="font-display text-2xl font-bold tracking-tight text-white">
                RoboCommand
              </h1>
              <p className="font-mono text-[10px] text-accent tracking-[0.3em] uppercase mt-1.5">
                Control Center
              </p>
            </motion.div>
          </div>

          {/* Divider */}
          <div className="mx-8 h-px bg-white/[0.04]" />

          {/* Form */}
          <motion.form
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            onSubmit={handleSubmit}
            className="p-8 pt-6 space-y-5"
          >
            {/* Security badge */}
            <div className="flex items-center justify-center gap-2 py-2">
              <Shield className="w-3.5 h-3.5 text-accent/40" />
              <span className="font-mono text-[10px] text-white/20 tracking-wider uppercase">
                Acesso Autenticado
              </span>
            </div>

            {/* Email field */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                className="w-full bg-surface-900/80 border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/15 font-display outline-none transition-all duration-200 focus:border-accent/40 focus:bg-surface-900 focus:shadow-[0_0_0_3px_rgba(0,103,255,0.08)]"
              />
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] text-white/30 tracking-wider uppercase pl-1">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-surface-900/80 border border-white/[0.06] rounded-xl px-4 py-3 pr-11 text-sm text-white/80 placeholder:text-white/15 font-display outline-none transition-all duration-200 focus:border-accent/40 focus:bg-surface-900 focus:shadow-[0_0_0_3px_rgba(0,103,255,0.08)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember email */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div
                onClick={() => setRememberEmail((r) => !r)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  rememberEmail
                    ? "bg-accent border-accent"
                    : "border-white/15 group-hover:border-white/25"
                }`}
              >
                {rememberEmail && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-xs text-white/30 group-hover:text-white/40 transition-colors select-none">
                Lembrar meu e-mail
              </span>
            </label>

            {/* Error message */}
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

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 bg-accent hover:bg-accent-light text-white font-display font-semibold text-sm py-3.5 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20 hover:shadow-accent/30 hover:shadow-xl active:scale-[0.98]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Entrar
                </>
              )}
            </button>
          </motion.form>
        </div>

      </motion.div>
    </div>
  );
}
