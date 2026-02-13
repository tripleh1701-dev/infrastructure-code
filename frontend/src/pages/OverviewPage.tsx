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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";

const sparklineData = [
  { value: 20 }, { value: 25 }, { value: 22 }, { value: 30 }, { value: 28 },
  { value: 35 }, { value: 32 }, { value: 40 }, { value: 38 }, { value: 45 },
];

const recentBuilds = [
  { pipeline: "SAP-Integration-Main", repo: "acme/sap-integration", branch: "main", status: "success", duration: "2m 45s", time: "2 min ago" },
  { pipeline: "Fiori-App-Deploy", repo: "acme/fiori-app", branch: "feature/auth", status: "running", duration: "1m 30s", time: "5 min ago" },
  { pipeline: "ABAP-Cloud-Build", repo: "acme/abap-cloud", branch: "develop", status: "failed", duration: "4m 12s", time: "12 min ago" },
  { pipeline: "Mobile-Services-Sync", repo: "acme/mobile-services", branch: "main", status: "success", duration: "1m 58s", time: "25 min ago" },
  { pipeline: "S4HANA-Extension", repo: "acme/s4hana-ext", branch: "release/v2.1", status: "success", duration: "5m 30s", time: "1 hour ago" },
];

const aiInsights = [
  { type: "success", title: "Pipeline 'SAP-Integration-Main' has shown 15% improvement in build times over the last 7 days.", action: "View Details" },
  { type: "error", title: "3 failed builds detected in 'Fiori-App-Deploy'. Consider reviewing the test configuration.", action: "Investigate" },
  { type: "info", title: "New SAP Integration Suite template available with enhanced error handling.", action: "Explore Template" },
];

const statusConfig = {
  success: { icon: CheckCircle, label: "Success", className: "bg-[#dcfce7] text-[#16a34a] border border-[#bbf7d0]" },
  failed: { icon: XCircle, label: "Failed", className: "bg-[#fee2e2] text-[#dc2626] border border-[#fecaca]" },
  running: { icon: RotateCw, label: "Running", className: "bg-[#e0f2fe] text-[#0284c7] border border-[#bae6fd]" },
};

const metrics = [
  { label: "RECENT BUILDS", value: "247", change: "12%", changeLabel: "vs last week", icon: Box, trend: "up", color: "#0171EC" },
  { label: "ACTIVE PIPELINES", value: "18", change: "5%", changeLabel: "vs last week", icon: GitBranch, trend: "up", color: "#05E9FE" },
  { label: "SUCCESS RATE", value: "94.2%", change: "3.5%", changeLabel: "vs last week", icon: TrendingUp, trend: "up", color: "#22c55e" },
  { label: "AVG BUILD TIME", value: "3m 24s", change: "8%", changeLabel: "vs last week", icon: Clock, trend: "down", color: "#0171EC" },
];

export default function OverviewPage() {
  return (
    <div className="min-h-screen min-h-dvh bg-background">
      <Header 
        title="Overview" 
        actions={
          <Button variant="outline" size="sm" className="gap-2 bg-white border-border text-foreground hover:bg-muted">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        }
      />
      
      <div className="p-content">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Overview</h1>
            <p className="text-muted-foreground">Monitor your CI/CD pipelines and deployments</p>
          </div>
          <FilterContextIndicator />
        </div>

        {/* Metrics Grid - Responsive */}
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
                {/* Top colored bar */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${metric.color}, ${index === 0 ? '#05E9FE' : metric.color}88)` }}
                />
                
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${metric.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: metric.color }} />
                    </div>
                    <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider">{metric.label}</p>
                  </div>
                </div>
                
                <p className="text-3xl font-bold text-[#0f172a] mb-2">{metric.value}</p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <TrendingUp className={cn(
                      "w-4 h-4",
                      metric.trend === "up" ? "text-[#22c55e]" : "text-[#22c55e] rotate-180"
                    )} />
                    <span className="text-sm font-medium text-[#22c55e]">
                      {metric.change}
                    </span>
                    <span className="text-sm text-[#64748b] ml-1">{metric.changeLabel}</span>
                  </div>
                  <div className="w-16 h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparklineData}>
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#22c55e"
                          fill="#22c55e"
                          fillOpacity={0.15}
                          strokeWidth={1.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Main Content Grid - Responsive */}
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
              <Button variant="link" size="sm" className="gap-1 text-[#0171EC] p-0 h-auto">
                View All
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="table-container">
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
                  {recentBuilds.map((build, index) => {
                    const status = statusConfig[build.status as keyof typeof statusConfig];
                    const StatusIcon = status.icon;
                    return (
                      <motion.tr
                        key={index}
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
                              <p className="text-xs text-[#64748b]">{build.repo}</p>
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
            </div>
          </motion.div>

          {/* AI Insights */}
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
                3 new
              </span>
            </div>
            
            <div className="p-4 space-y-3">
              {aiInsights.map((insight, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    insight.type === "success" && "bg-[#dcfce7]",
                    insight.type === "error" && "bg-[#fee2e2]",
                    insight.type === "info" && "bg-[#e0f2fe]"
                  )}>
                    {insight.type === "success" && <CheckCircle className="w-3.5 h-3.5 text-[#22c55e]" />}
                    {insight.type === "error" && <XCircle className="w-3.5 h-3.5 text-[#dc2626]" />}
                    {insight.type === "info" && <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#334155] leading-relaxed">{insight.title}</p>
                    <button className="text-sm font-medium text-[#0171EC] hover:underline mt-1">
                      {insight.action} &gt;
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
