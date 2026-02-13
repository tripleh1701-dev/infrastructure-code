import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Clock, GitBranch, ExternalLink, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Build {
  id: string;
  pipeline: string;
  branch: string;
  status: "success" | "failed" | "running";
  duration: string;
  time: string;
  commit: string;
  author: string;
}

const recentBuilds: Build[] = [
  {
    id: "1",
    pipeline: "SAP Integration Suite - Deploy",
    branch: "main",
    status: "success",
    duration: "2m 34s",
    time: "5 minutes ago",
    commit: "feat: add new integration flow",
    author: "John D.",
  },
  {
    id: "2",
    pipeline: "Fiori App - Build & Test",
    branch: "feature/auth",
    status: "running",
    duration: "1m 12s",
    time: "8 minutes ago",
    commit: "fix: authentication module",
    author: "Sarah M.",
  },
  {
    id: "3",
    pipeline: "ABAP Cloud - Unit Tests",
    branch: "develop",
    status: "failed",
    duration: "45s",
    time: "15 minutes ago",
    commit: "test: update unit tests",
    author: "Mike R.",
  },
  {
    id: "4",
    pipeline: "Extension Deploy - Production",
    branch: "main",
    status: "success",
    duration: "3m 15s",
    time: "1 hour ago",
    commit: "chore: version bump",
    author: "Lisa K.",
  },
  {
    id: "5",
    pipeline: "Mobile Services - Deploy",
    branch: "main",
    status: "success",
    duration: "1m 58s",
    time: "2 hours ago",
    commit: "feat: push notifications",
    author: "Tom H.",
  },
];

const statusConfig = {
  success: {
    icon: CheckCircle2,
    className: "bg-success/10 text-success",
    label: "Success",
  },
  failed: {
    icon: XCircle,
    className: "bg-destructive/10 text-destructive",
    label: "Failed",
  },
  running: {
    icon: RotateCw,
    className: "bg-primary/10 text-primary",
    label: "Running",
  },
};

export function RecentBuilds() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card overflow-hidden"
    >
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Builds</h3>
          <p className="text-sm text-muted-foreground">Latest pipeline executions</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          View All
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pipeline</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Commit</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {recentBuilds.map((build, index) => {
              const status = statusConfig[build.status];
              const StatusIcon = status.icon;

              return (
                <motion.tr
                  key={build.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="group cursor-pointer"
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <GitBranch className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {build.pipeline}
                      </span>
                    </div>
                  </td>
                  <td>
                    <code className="px-2 py-1 rounded bg-muted text-xs font-mono">
                      {build.branch}
                    </code>
                  </td>
                  <td>
                    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", status.className)}>
                      <StatusIcon className={cn("w-3.5 h-3.5", build.status === "running" && "animate-spin")} />
                      {status.label}
                    </span>
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {build.duration}
                    </span>
                  </td>
                  <td>
                    <div className="max-w-[200px]">
                      <p className="text-sm text-foreground truncate">{build.commit}</p>
                      <p className="text-xs text-muted-foreground">{build.author}</p>
                    </div>
                  </td>
                  <td>
                    <span className="text-sm text-muted-foreground">{build.time}</span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
