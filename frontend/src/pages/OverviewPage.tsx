import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  Box,
  GitBranch,
  TrendingUp,
  Clock,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  RotateCw,
  Sparkles,
  Loader2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useOverviewStats, formatSeconds } from "@/hooks/useOverviewStats";
import { useNavigate } from "react-router-dom";

const aiInsights = [
  { type: "info", title: "AI-powered insights will appear here once AI integration is enabled.", action: "Coming Soon" },
];

const statusConfig: Record<string, { icon: any; label: string; className: string }> = {
  success: { icon: CheckCircle, label: "Success", className: "bg-[#dcfce7] text-[#16a34a] border border-[#bbf7d0]" },
  failed: { icon: XCircle, label: "Failed", className: "bg-[#fee2e2] text-[#dc2626] border border-[#fecaca]" },
  running: { icon: RotateCw, label: "Running", className: "bg-[#e0f2fe] text-[#0284c7] border border-[#bae6fd]" },
  pending: { icon: Clock, label: "Pending", className: "bg-[#fef3c7] text-[#d97706] border border-[#fde68a]" },
};

export default function OverviewPage() {
  const { data: stats, isLoading, refetch } = useOverviewStats();
  const navigate = useNavigate();

  const metrics = [
    { label: "TOTAL BUILDS", value: String(stats?.totalBuildJobs ?? 0), icon: Box, color: "#0171EC" },
    { label: "ACTIVE PIPELINES", value: String(stats?.activePipelines ?? 0), icon: GitBranch, color: "#05E9FE" },
    { label: "SUCCESS RATE", value: stats ? `${stats.successRate.toFixed(1)}%` : "—", icon: TrendingUp, color: "#22c55e" },
    { label: "AVG BUILD TIME", value: stats ? formatSeconds(stats.avgBuildTimeSec) : "—", icon: Clock, color: "#0171EC" },
  ];

  return (
    <PermissionGate menuKey="overview">
    <div className="min-h-screen min-h-dvh bg-background">
      <Header 
        title="Overview" 
        subtitle="Monitor your CI/CD pipelines and deployments"
        actions={
          <Button variant="outline" size="sm" className="gap-2 bg-card border-border text-foreground hover:bg-muted" onClick={() => refetch()}>
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />
      
      <div className="p-content">
        {/* Metrics Grid */}
        <div className="responsive-grid mb-6">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-white rounded-xl border border-[#e2e8f0] p-5 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, ${metric.color}, ${metric.color}88)` }} />
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${metric.color}15` }}>
                      <Icon className="w-5 h-5" style={{ color: metric.color }} />
                    </div>
                    <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider">{metric.label}</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-[#0f172a] mb-2">
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : metric.value}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-md-fluid">
          {/* Recent Build Cycles */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0]">
              <h3 className="font-semibold text-[#0f172a]">Recent Build Cycles</h3>
              <Button variant="link" size="sm" className="gap-1 text-[#0171EC] p-0 h-auto" onClick={() => navigate("/builds")}>
                View All
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="table-container">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (stats?.recentExecutions?.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Box className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No build executions yet</p>
                  <p className="text-xs">Create a build job and run it to see data here</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e2e8f0]">
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Pipeline</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Branch</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Duration</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-[#64748b] uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.recentExecutions.map((build, index) => {
                      const status = statusConfig[build.status] || statusConfig.pending;
                      const StatusIcon = status.icon;
                      return (
                        <motion.tr
                          key={build.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + index * 0.05 }}
                          className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#0171EC]/10 flex items-center justify-center">
                                <GitBranch className="w-4 h-4 text-[#0171EC]" />
                              </div>
                              <div>
                                <p className="font-medium text-[#0f172a]">{build.pipeline}</p>
                                <p className="text-xs text-[#64748b]">#{build.buildNumber}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <code className="px-2.5 py-1 bg-[#f1f5f9] rounded-md text-xs text-[#334155] font-mono">{build.branch}</code>
                          </td>
                          <td className="px-5 py-4">
                            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", status.className)}>
                              <StatusIcon className={cn("w-3 h-3", build.status === "running" && "animate-spin")} />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-[#64748b]">
                              <Clock className="w-3.5 h-3.5" />
                              {build.duration}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-[#64748b]">{build.time}</td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>

          {/* AI Insights - Placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#0171EC]/10">
                  <Sparkles className="w-4 h-4 text-[#0171EC]" />
                </div>
                <h3 className="font-semibold text-[#0f172a]">AI Insights</h3>
              </div>
              <span className="px-2 py-0.5 bg-[#f1f5f9] text-[#64748b] text-xs font-medium rounded-full">
                Coming Soon
              </span>
            </div>
            
            <div className="p-4 space-y-3">
              {/* Quick Stats from Real Data */}
              {stats && (
                <>
                  <div className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-[#e0f2fe]">
                      <Users className="w-3.5 h-3.5 text-[#0284c7]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#334155] leading-relaxed">
                        <strong>{stats.activeUsers}</strong> active users across <strong>{stats.totalWorkstreams}</strong> workstreams
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-[#dcfce7]">
                      <CheckCircle className="w-3.5 h-3.5 text-[#22c55e]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#334155] leading-relaxed">
                        <strong>{stats.totalConnectors}</strong> connectors and <strong>{stats.totalCredentials}</strong> credentials configured
                      </p>
                    </div>
                  </div>
                </>
              )}
              {aiInsights.map((insight, index) => (
                <div key={index} className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-[#e0f2fe]">
                    <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#334155] leading-relaxed">{insight.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
    </PermissionGate>
  );
}
