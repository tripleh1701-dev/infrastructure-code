import { motion } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Clock,
  Box,
  Cpu,
  RefreshCw,
  ChevronDown,
  CheckCircle,
  RotateCw,
  ExternalLink,
  Sparkles,
  XCircle,
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
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";

const buildTrendData = [
  { name: "Mon", value: 4 },
  { name: "Tue", value: 18 },
  { name: "Wed", value: 28 },
  { name: "Thu", value: 32 },
  { name: "Fri", value: 25 },
  { name: "Sat", value: 15 },
  { name: "Sun", value: 12 },
];

const deploymentsByType = [
  { name: "SAP CPI", value: 52 },
  { name: "Fiori", value: 38 },
  { name: "ABAP", value: 28 },
  { name: "Mobile", value: 20 },
  { name: "S/4HANA", value: 18 },
];

const sparklineData = [
  { value: 88 }, { value: 92 }, { value: 90 }, { value: 95 }, { value: 93 },
  { value: 94 }, { value: 96 }, { value: 94 }, { value: 95 },
];

const recentBuilds = [
  { pipeline: "Production-Deploy", repo: "acme/production", branch: "main", status: "success", duration: "3m 12s", time: "Just now" },
  { pipeline: "Staging-Integration", repo: "acme/staging", branch: "develop", status: "running", duration: "1m 45s", time: "2 min ago" },
  { pipeline: "QA-Testing", repo: "acme/qa", branch: "feature/new-ui", status: "success", duration: "5m 20s", time: "8 min ago" },
];

const aiInsights = [
  { type: "info", title: "Deploy frequency increased by 23% this week. Consider scaling infrastructure.", action: "Review Capacity" },
  { type: "error", title: "Test coverage dropped below 80% in 2 pipelines. Review needed.", action: "View Pipelines" },
];

const statusConfig = {
  success: { icon: CheckCircle, label: "Success", className: "bg-[#dcfce7] text-[#16a34a] border border-[#bbf7d0]" },
  running: { icon: RotateCw, label: "Running", className: "bg-[#e0f2fe] text-[#0284c7] border border-[#bae6fd]" },
};

const metrics = [
  { label: "BUILD SUCCESS RATE", value: "94.8%", change: "2.3%", changeLabel: "vs last month", icon: TrendingUp, trend: "up", color: "#0171EC" },
  { label: "AVG DEPLOY TIME", value: "4m 12s", change: "15%", changeLabel: "faster than avg", icon: Clock, trend: "down", color: "#05E9FE" },
  { label: "ACTIVE DEPLOYMENTS", value: "12", change: "3%", changeLabel: "currently running", icon: Box, trend: "neutral", color: "#22c55e" },
  { label: "RESOURCE UTILIZATION", value: "67%", change: "5%", changeLabel: "capacity used", icon: Cpu, trend: "neutral", color: "#0171EC" },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Header 
        title="Dashboard" 
        subtitle="Analytics and performance metrics"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 bg-card border-border text-foreground hover:bg-muted">
              Last 7 days
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="gap-2 bg-card border-border text-foreground hover:bg-muted">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="p-content">

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
                
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${metric.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: metric.color }} />
                    </div>
                    <p className="text-xs font-medium text-[#64748b] uppercase tracking-wider">{metric.label}</p>
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
                
                <p className="text-3xl font-bold text-[#0f172a] mb-2">{metric.value}</p>
                
                <div className="flex items-center gap-1">
                  <TrendingUp className={cn(
                    "w-4 h-4",
                    metric.trend === "up" ? "text-[#22c55e]" : metric.trend === "down" ? "text-[#22c55e]" : "text-[#64748b]"
                  )} />
                  <span className={cn(
                    "text-sm font-medium",
                    metric.trend === "up" || metric.trend === "down" ? "text-[#22c55e]" : "text-[#64748b]"
                  )}>
                    {metric.change}
                  </span>
                  <span className="text-sm text-[#64748b] ml-1">{metric.changeLabel}</span>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Charts Grid - Responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-md-fluid mb-6">
          {/* Build Trends */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl border border-[#e2e8f0] p-5"
          >
            <h3 className="font-semibold text-[#0f172a] mb-4">Build Trends</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={buildTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBuild" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0171EC" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0171EC" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#0171EC"
                    fill="url(#colorBuild)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Deployments by Type */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-xl border border-[#e2e8f0] p-5"
          >
            <h3 className="font-semibold text-[#0f172a] mb-4">Deployments by Type</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deploymentsByType} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                  <Bar dataKey="value" fill="#0171EC" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Bottom Grid - Responsive */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-md-fluid mb-6">
          {/* Recent Build Cycles */}
          {/* Recent Build Cycles */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
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
                      <tr key={index} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#0171EC]/10 flex items-center justify-center">
                              <Box className="w-4 h-4 text-[#0171EC]" />
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
                      </tr>
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
                2 new
              </span>
            </div>
            
            <div className="p-4 space-y-3">
              {aiInsights.map((insight, index) => (
                <div
                  key={index}
                  className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    insight.type === "error" && "bg-[#fee2e2]",
                    insight.type === "info" && "bg-[#e0f2fe]"
                  )}>
                    {insight.type === "error" && <XCircle className="w-3.5 h-3.5 text-[#dc2626]" />}
                    {insight.type === "info" && <Sparkles className="w-3.5 h-3.5 text-[#0284c7]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#334155] leading-relaxed">{insight.title}</p>
                    <button className="text-sm font-medium text-[#0171EC] hover:underline mt-1">
                      {insight.action} &gt;
                    </button>
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
  );
}
