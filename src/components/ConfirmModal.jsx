import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const variantConfig = {
  danger: {
    icon: "text-status-error",
    bg: "bg-status-error",
    hover: "hover:bg-status-error/90",
  },
  accent: {
    icon: "text-accent",
    bg: "bg-accent",
    hover: "hover:bg-accent-light",
  },
};

export default function ConfirmModal({ open, title, message, confirmLabel = "Confirmar", variant = "danger", onConfirm, onCancel }) {
  if (!open) return null;

  const cfg = variantConfig[variant] || variantConfig.danger;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-sm mx-4 rounded-xl border border-white/10 bg-surface-800 shadow-2xl shadow-black/50 p-6"
          >
            <div className="flex items-start gap-4 mb-5">
              <div className={`w-10 h-10 rounded-lg bg-surface-900/60 flex items-center justify-center shrink-0`}>
                <AlertTriangle className={`w-5 h-5 ${cfg.icon}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
                <p className="text-xs text-white/40 mt-1 whitespace-pre-line">{message}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg border border-white/5 text-xs font-medium text-white/50 hover:text-white/80 hover:border-white/10 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 rounded-lg text-xs font-medium text-white ${cfg.bg} ${cfg.hover} transition-all cursor-pointer`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
