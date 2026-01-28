"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Check, X } from "lucide-react";

interface Toast {
  id: number;
  message: ReactNode;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  showToast: (message: ReactNode, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: ReactNode, type: "success" | "error" | "info" = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto remove after 3 seconds (longer for links)
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200 ${
              toast.type === "success"
                ? "bg-green-500 text-white"
                : toast.type === "error"
                ? "bg-red-500 text-white"
                : "bg-card text-foreground border border-border"
            }`}
          >
            {toast.type === "success" && <Check className="w-4 h-4" />}
            {toast.type === "error" && <X className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
