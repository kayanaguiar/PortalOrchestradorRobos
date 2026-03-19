import { CheckCircle2, XCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function Toast({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl shadow-black/30 backdrop-blur-sm min-w-72 max-w-md ${
              toast.type === "success"
                ? "bg-status-running/15 border-status-running/30"
                : "bg-status-error/15 border-status-error/30"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-status-running shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-status-error shrink-0" />
            )}
            <p className={`text-xs font-medium flex-1 ${
              toast.type === "success" ? "text-status-running" : "text-status-error"
            }`}>
              {toast.message}
            </p>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-white/20 hover:text-white/50 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
