import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isExternalApi } from "@/lib/api/config";
import { useSesHealth } from "@/hooks/useSesHealth";
import { toast } from "sonner";

const statusConfig = {
  healthy: {
    label: "Healthy",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: AlertTriangle,
  },
  unhealthy: {
    label: "Unhealthy",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
  },
};

const checkStatusIcon = {
  pass: { icon: CheckCircle2, color: "text-emerald-500" },
  fail: { icon: XCircle, color: "text-red-500" },
  warn: { icon: AlertTriangle, color: "text-amber-500" },
};

export function SesDiagnosticsCard() {
  const { data, loading, refresh } = useSesHealth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const external = isExternalApi();

  if (!external) return null;

  const handleRefresh = async () => {
    await refresh();
    if (data?.status === "healthy") {
      toast.success("SES is healthy — emails should be delivered successfully.");
    }
  };

  const overallConfig = data ? statusConfig[data.status] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 to-transparent">
        <div className="flex items-center gap-4">
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-200/50"
            whileHover={{ rotate: 15, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <Mail className="w-6 h-6 text-white" />
          </motion.div>
          <div>
            <h3 className="font-semibold text-slate-800 text-lg">Email Delivery (SES)</h3>
            <p className="text-sm text-slate-500">
              Validate sender verification, sandbox status & send quota
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && overallConfig && (
            <Badge variant="outline" className={cn("gap-1.5 font-medium", overallConfig.color)}>
              <overallConfig.icon className="w-3.5 h-3.5" />
              {overallConfig.label}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-2 bg-white/80 border-slate-200 hover:border-orange-300 hover:text-orange-600 transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            {data ? "Re-run" : "Run Diagnostics"}
          </Button>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {!data ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-8 text-center text-slate-400"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm">Running SES diagnostics...</span>
              </div>
            ) : (
              <>
                <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Click "Run Diagnostics" to check SES email delivery health.</p>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-5 space-y-3"
          >
            {/* Region & timestamp */}
            <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
              <span>Region: <span className="font-mono text-slate-500">{data.region}</span></span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(data.timestamp).toLocaleString()}
              </span>
            </div>

            {Object.entries(data.checks).map(([key, check]) => {
              const statusCfg = checkStatusIcon[check.status];
              const StatusIcon = statusCfg.icon;
              const isExpanded = expanded === key;
              const hasDetails = check.details && Object.keys(check.details).some(k => check.details![k] != null);

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-xl border border-slate-100 overflow-hidden"
                >
                  <button
                    onClick={() => hasDetails ? setExpanded(isExpanded ? null : key) : undefined}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 text-left transition-colors",
                      hasDetails && "hover:bg-slate-50 cursor-pointer",
                      !hasDetails && "cursor-default"
                    )}
                  >
                    <StatusIcon className={cn("w-5 h-5 flex-shrink-0", statusCfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-700 capitalize">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{check.message}</p>
                    </div>
                    {check.duration_ms > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                        {check.duration_ms}ms
                      </span>
                    )}
                    {hasDetails && (
                      isExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                  </button>

                  <AnimatePresence>
                    {isExpanded && hasDetails && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 space-y-2">
                          {Object.entries(check.details!).map(([dk, dv]) => {
                            if (dv == null) return null;
                            if (dk === "action") {
                              return (
                                <div
                                  key={dk}
                                  className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  <span>{String(dv)}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={dk} className="flex items-center gap-2 text-xs">
                                <span className="text-slate-400 capitalize min-w-[120px]">
                                  {dk.replace(/_/g, " ")}:
                                </span>
                                <span className="font-mono text-slate-600">{String(dv)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
