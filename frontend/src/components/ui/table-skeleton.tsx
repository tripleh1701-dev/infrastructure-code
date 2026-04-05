import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  variant?: "table" | "card" | "tile";
  className?: string;
}

/**
 * Shimmer skeleton loader for data tables and card grids.
 * Shows a realistic placeholder while data loads after context switching.
 */
export function TableSkeleton({ rows = 5, columns = 5, variant = "table", className }: TableSkeletonProps) {
  if (variant === "tile") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="rounded-xl border border-border bg-card p-5 space-y-4"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className="rounded-xl border border-border bg-card p-4 flex items-center gap-4"
          >
            <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full shrink-0" />
          </motion.div>
        ))}
      </div>
    );
  }

  // Table variant (default)
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      {/* Header row */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/30">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className={cn("h-3.5 rounded", i === 0 ? "w-1/4" : "flex-1")}
          />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <motion.div
          key={rowIdx}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: rowIdx * 0.04, duration: 0.3 }}
          className={cn(
            "flex items-center gap-4 px-4 py-3.5",
            rowIdx < rows - 1 && "border-b border-border/50"
          )}
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Skeleton
              key={`r${rowIdx}-c${colIdx}`}
              className={cn(
                "h-3.5 rounded",
                colIdx === 0 ? "w-1/4" : "flex-1",
                // Vary widths for realism
                colIdx === columns - 1 && "w-16 flex-none"
              )}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );
}
