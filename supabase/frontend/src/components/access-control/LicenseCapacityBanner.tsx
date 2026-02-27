import { motion } from "framer-motion";
import { AlertTriangle, Users, Shield, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LicenseCapacity } from "@/hooks/useLicenseCapacity";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LicenseCapacityBannerProps {
  capacity: LicenseCapacity | undefined;
  isLoading: boolean;
}

export function LicenseCapacityBanner({ capacity, isLoading }: LicenseCapacityBannerProps) {
  if (isLoading) {
    return (
      <motion.div
        className="mx-0 rounded-xl border border-border/50 bg-muted/30 p-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-muted rounded animate-pulse" />
            <div className="h-2 w-48 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </motion.div>
    );
  }

  if (!capacity) return null;

  const { totalAllowed, currentActiveUsers, remaining, isAtCapacity, hasLicenses } = capacity;

  // No licenses at all
  if (!hasLicenses) {
    return (
      <motion.div
        className="mx-0 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">No Active Licenses</p>
            <p className="text-xs text-muted-foreground">
              This account has no active licenses. Users cannot be created until a license is assigned.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  // At capacity
  if (isAtCapacity) {
    return (
      <motion.div
        className="mx-0 rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Shield className="w-5 h-5 text-amber-600" />
          </motion.div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-700">License Limit Reached</p>
            <p className="text-xs text-muted-foreground">
              All {totalAllowed} licensed seats are in use ({currentActiveUsers} active users). 
              Increase the license capacity or deactivate existing users to add new ones.
            </p>
          </div>
          <CapacityMeter current={currentActiveUsers} total={totalAllowed} />
        </div>
      </motion.div>
    );
  }

  // Has capacity — show info banner with remaining seats
  const isLow = remaining <= Math.max(2, Math.ceil(totalAllowed * 0.1)); // <10% or ≤2

  return (
    <motion.div
      className={cn(
        "mx-0 rounded-xl border p-4",
        isLow
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-primary/10 bg-primary/5"
      )}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          isLow ? "bg-amber-500/10" : "bg-primary/10"
        )}>
          <Users className={cn("w-5 h-5", isLow ? "text-amber-600" : "text-primary")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn(
              "text-sm font-semibold",
              isLow ? "text-amber-700" : "text-foreground"
            )}>
              {remaining} {remaining === 1 ? "Seat" : "Seats"} Available
            </p>
            {isLow && (
              <motion.span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700"
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Low
              </motion.span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium text-xs">License Breakdown</p>
                    {capacity.licenses.map((lic) => (
                      <p key={lic.licenseId} className="text-xs text-muted-foreground">
                        {lic.enterpriseName} · {lic.productName}: {lic.numberOfUsers} users (expires {lic.endDate})
                      </p>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">
            {currentActiveUsers} of {totalAllowed} licensed seats in use
          </p>
        </div>
        <CapacityMeter current={currentActiveUsers} total={totalAllowed} />
      </div>
    </motion.div>
  );
}

function CapacityMeter({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const isHigh = pct >= 90;
  const isMedium = pct >= 70;

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <span className={cn(
        "text-xs font-bold tabular-nums",
        isHigh ? "text-destructive" : isMedium ? "text-amber-600" : "text-primary"
      )}>
        {current}/{total}
      </span>
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={cn(
            "h-full rounded-full",
            isHigh
              ? "bg-destructive"
              : isMedium
                ? "bg-amber-500"
                : "bg-primary"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
