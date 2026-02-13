import { motion } from "framer-motion";
import { BuildJob } from "@/hooks/useBuilds";
import { Button } from "@/components/ui/button";
import { Zap, CheckCircle, XCircle, Trash2, FileDown, ExternalLink, GitBranch, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

interface BuildsCardViewProps {
  builds: BuildJob[];
  onOpenDetail: (job: BuildJob) => void;
  onDelete: (job: BuildJob) => void;
}

export function BuildsCardView({ builds, onOpenDetail, onDelete }: BuildsCardViewProps) {
  return (
    <div className="responsive-grid-lg">
      {builds.map((build, index) => {
        const isActive = build.status === "ACTIVE";

        return (
          <motion.div
            key={build.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, delay: index * 0.06, type: "spring", stiffness: 300, damping: 24 }}
            className="spark-card-hover p-5 group"
            onClick={() => onOpenDetail(build)}
          >
            {/* Top accent bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 h-0.5 rounded-t-xl",
              isActive
                ? "bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-cyan))]"
                : "bg-muted"
            )} />

            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-10 h-10 rounded-xl icon-gradient flex items-center justify-center shadow-md"
                  whileHover={{ rotate: 10, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <Zap className="w-5 h-5 text-white" />
                </motion.div>
                <div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {build.connector_name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {build.product} / {build.service}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                  isActive ? "status-success" : "bg-muted text-muted-foreground"
                )}
              >
                {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {build.status}
              </span>
            </div>

            {build.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{build.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground mb-4">
              {build.entity && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 border border-border/30">
                  <Layers className="w-2.5 h-2.5" /> {build.entity}
                </span>
              )}
              {build.pipeline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10 text-primary">
                  <GitBranch className="w-2.5 h-2.5" /> {build.pipeline}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/30">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileDown className="w-3.5 h-3.5" />
                {build.scope || "No artifacts"}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(build);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-primary hover:text-primary/80 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(build);
                  }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Detail
                </Button>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
