import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, XCircle, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSesHealth } from "@/hooks/useSesHealth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function SesHealthBanner() {
  const { data, dismissed, dismiss } = useSesHealth();
  const navigate = useNavigate();

  // Only show for degraded/unhealthy, and not dismissed
  const show = data && data.status !== "healthy" && !dismissed;

  const isUnhealthy = data?.status === "unhealthy";
  const config = isUnhealthy
    ? {
        bg: "bg-red-50 border-red-200",
        text: "text-red-800",
        subtext: "text-red-600",
        icon: XCircle,
        iconColor: "text-red-500",
        title: "Email delivery is broken",
        description: "SES configuration issues detected — credential emails will NOT be delivered to new users.",
        btnClass: "bg-red-600 hover:bg-red-700 text-white",
      }
    : {
        bg: "bg-amber-50 border-amber-200",
        text: "text-amber-800",
        subtext: "text-amber-600",
        icon: AlertTriangle,
        iconColor: "text-amber-500",
        title: "Email delivery has warnings",
        description: "SES configuration may cause email delivery issues for new user credentials.",
        btnClass: "bg-amber-600 hover:bg-amber-700 text-white",
      };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className={cn("flex items-center gap-3 px-4 py-3 border-b", config.bg)}>
            <config.icon className={cn("w-5 h-5 flex-shrink-0", config.iconColor)} />
            <div className="flex-1 min-w-0">
              <span className={cn("text-sm font-semibold", config.text)}>{config.title}</span>
              <span className={cn("text-sm ml-2 hidden sm:inline", config.subtext)}>
                {config.description}
              </span>
            </div>
            <Button
              size="sm"
              className={cn("gap-1.5 text-xs flex-shrink-0", config.btnClass)}
              onClick={() => navigate("/account-settings?tab=settings")}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Diagnostics
            </Button>
            <button
              onClick={dismiss}
              className={cn("p-1 rounded-md hover:bg-black/5 transition-colors flex-shrink-0", config.subtext)}
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
