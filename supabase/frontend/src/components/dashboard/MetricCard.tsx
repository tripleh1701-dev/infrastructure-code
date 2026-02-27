import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: "increase" | "decrease" | "neutral";
  };
  icon: React.ReactNode;
  description?: string;
  index?: number;
}

export function MetricCard({
  title,
  value,
  change,
  icon,
  description,
  index = 0,
}: MetricCardProps) {
  const trendColors = {
    increase: "text-success",
    decrease: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="metric-card group"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <motion.p
            className="text-3xl font-bold text-foreground"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.1 + 0.2 }}
          >
            {value}
          </motion.p>
        </div>
        <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>

      {(change || description) && (
        <div className="mt-4 flex items-center gap-2">
          {change && (
            <span className={cn("flex items-center gap-1 text-sm font-medium", trendColors[change.type])}>
              <TrendingUp className="w-4 h-4" />
              {change.value > 0 ? "+" : ""}
              {change.value}%
            </span>
          )}
          {description && (
            <span className="text-sm text-muted-foreground">
              {description}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
