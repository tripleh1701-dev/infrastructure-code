import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Clock,
  Box,
  Users,
  RefreshCw,
  ChevronDown,
  CheckCircle,
  RotateCw,
  ExternalLink,
  Sparkles,
  XCircle,
  Loader2,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ExpiringLicenses } from "@/components/dashboard/ExpiringLicenses";
import { ExpiringCredentials } from "@/components/dashboard/ExpiringCredentials";
import { NotificationHistory } from "@/components/dashboard/NotificationHistory";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useOverviewStats, formatSeconds } from "@/hooks/useOverviewStats";
import { useNavigate } from "react-router-dom";

const aiInsights = [
  { type: "info", title: "AI-powered analytics and recommendations will appear here once AI integration is enabled.", action: "Coming Soon" },
];

const statusConfig: Record<string, { icon: any; label: string; className: string }> = {
  success: { icon: CheckCircle, label: "Success", className: "bg-[#dcfce7] text-[#16a34a] border border-[#bbf7d0]" },
  failed: { icon: XCircle, label: "Failed", className: "bg-[#fee2e2] text-[#dc2626] border border-[#fecaca]" },
  running: { icon: RotateCw, label: "Running", className: "bg-[#e0f2fe] text-[#0284c7] border border-[#bae6fd]" },
  pending: { icon: Clock, label: "Pending", className: "bg-[#fef3c7] text-[#d97706] border border-[#fde68a]" },
};

export default function DashboardPage() {
  const { data: stats, isLoading, refetch } = useOverviewStats();
  const navigate = useNavigate();

  const metrics = [
    { label: "BUILD SUCCESS RATE", value: stats ? `${stats.successRate.toFixed(1)}%` : "—", icon: TrendingUp, color: "#0171EC" },
    { label: "AVG BUILD TIME", value: stats ? formatSeconds(stats.avgBuildTimeSec) : "—", icon: Clock, color: "#05E9FE" },
    { label: "TOTAL EXECUTIONS", value: String(stats?.totalExecutions ?? 0), icon: Box, color: "#22c55e" },
    { label: "ACTIVE USERS", value: String(stats?.activeUsers ?? 0), icon: Users, color: "#0171EC" },
  ];

  // Deployments by status for bar chart
  const deploymentsByStatus = stats ? [
    { name: "Success", value: stats.successfulExecutions },
    { name: "Failed", value: stats.failedExecutions },
    { name: "Running", value: stats.runningExecutions },
  ].filter(d => d.value > 0) : [];

  return (
    <PermissionGate menuKey="dashboard">
    <div className="min-h-screen bg-[#f8fafc]">
      <Header 
        title="Dashboard" 
        subtitle="Analytics and performance metrics"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 bg-card border-border text-foreground hover:bg-muted" onClick={() => refetch()}>
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
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
                <div className="flex items-start justify-between mb-2">
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

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-md-fluid mb-6">
          {/* Build Trends */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl border border-[#e2e8f0] p-5"
          >
            <h3 className="font-semibold text-[#0f172a] mb-4">Build Trends (Last 7 Days)</h3>
            <div className="h-[250px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.buildTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBuild" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0171EC" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0171EC" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }} />
                    <Area type="monotone" dataKey="value" stroke="#0171EC" fill="url(#colorBuild)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Executions by Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl border border-[#e2e8f0] p-5"
          >
            <h3 className="font-semibold text-[#0f172a] mb-4">Executions by Status</h3>
            <div className="h-[250px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : deploymentsByStatus.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Box className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No execution data yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deploymentsByStatus} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} width={70} />
                    <Tooltip contentStyle={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }} />
                    <Bar dataKey="value" fill="#0171EC" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>
        </div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-md-fluid mb-6">
          {/* Recent Build Cycles */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
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
                        <tr key={build.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
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
                        </tr>
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
            transition={{ delay: 0.7 }}
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

        {/* Expiring Licenses & Credentials */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-md-fluid mb-6">
          <ExpiringLicenses />
          <ExpiringCredentials />
        </div>

        {/* Notification History */}
        <div className="grid grid-cols-1 gap-md-fluid">
          <NotificationHistory />
        </div>
      </div>
    </div>
    </PermissionGate>
  );
}
