import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/auth/PermissionGate";
import {
  GitBranch,
  Sparkles,
  LayoutTemplate,
  ArrowRight,
  Workflow,
  Zap,
  Layers,
  CheckCircle,
  TrendingUp,
  Activity,
  Clock,
  Play,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelines } from "@/hooks/usePipelines";
import { formatDistanceToNow } from "date-fns";

interface PipelineCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
  features: string[];
  gradient: string;
  accentColor: string;
  glowColor: string;
}

const pipelineCards: PipelineCard[] = [
  {
    id: "canvas",
    title: "Pipeline Canvas",
    description: "Build and manage CI/CD pipelines with a visual drag-and-drop interface. Configure enterprise, product, and service linkups.",
    icon: Workflow,
    route: "/pipelines/summary",
    features: [
      "Visual pipeline builder with React Flow",
      "Drag-and-drop node configuration",
      "YAML import/export support",
      "Real-time execution monitoring",
    ],
    gradient: "from-blue-500 via-blue-600 to-cyan-500",
    accentColor: "#0171EC",
    glowColor: "rgba(1, 113, 236, 0.3)",
  },
  {
    id: "smart",
    title: "Smart Pipeline",
    description: "Let AI generate optimized pipeline configurations based on your project type and requirements.",
    icon: Sparkles,
    route: "/pipelines/smart",
    features: [
      "AI-powered pipeline generation",
      "Project type detection",
      "Best practices built-in",
      "One-click optimization",
    ],
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    accentColor: "#8b5cf6",
    glowColor: "rgba(139, 92, 246, 0.3)",
  },
  {
    id: "templates",
    title: "Pipeline Templates",
    description: "Start quickly with pre-configured templates for common SAP and enterprise scenarios.",
    icon: LayoutTemplate,
    route: "/pipelines/templates",
    features: [
      "SAP Integration Suite template",
      "Fiori App deployment",
      "S/4HANA Extension pipeline",
      "ABAP Cloud development",
    ],
    gradient: "from-amber-500 via-orange-500 to-red-500",
    accentColor: "#f59e0b",
    glowColor: "rgba(245, 158, 11, 0.3)",
  },
];

const pipelineColors = ["#0171EC", "#8b5cf6", "#10b981", "#f59e0b"];

export default function PipelinesLandingPage() {
  const navigate = useNavigate();
  const { pipelines, isLoading } = usePipelines();

  const recentPipelines = pipelines.slice(0, 4).map((p, i) => ({
    name: p.name,
    type: p.deployment_type || "Pipeline",
    status: p.status,
    lastRun: formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }),
    color: pipelineColors[i % pipelineColors.length],
  }));

  const activePipelinesCount = pipelines.filter(p => p.status === "active").length;
  const draftCount = pipelines.filter(p => p.status === "draft").length;

  return (
    <PermissionGate menuKey="pipelines">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <Header title="Pipelines" />

      <div className="p-6 max-w-7xl mx-auto">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div className="flex items-center gap-4 mb-3">
            <motion.div 
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-blue-500/30"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <GitBranch className="w-7 h-7 text-white" />
            </motion.div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent">
                CI/CD Pipelines
              </h1>
              <p className="text-slate-500 text-lg">Build, manage, and automate your deployment workflows</p>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10"
        >
          {[
            { label: "Total Pipelines", value: String(pipelines.length), icon: Layers, color: "#0171EC", trend: `${activePipelinesCount} active` },
            { label: "Active", value: String(activePipelinesCount), icon: Activity, color: "#10b981", trend: "Currently active" },
            { label: "Drafts", value: String(draftCount), icon: Clock, color: "#f59e0b", trend: "In progress" },
            { label: "Templates", value: "6", icon: LayoutTemplate, color: "#8b5cf6", trend: "Available" },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + index * 0.05, type: "spring" }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="relative group bg-white/70 backdrop-blur-xl rounded-2xl border border-white/80 p-5 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 overflow-hidden"
            >
              <div 
                className="absolute top-0 left-0 right-0 h-1 opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, ${stat.color}, ${stat.color}60)` }}
              />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 mb-1 font-medium">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{stat.trend}</p>
                </div>
                <motion.div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}10` }}
                  whileHover={{ scale: 1.1 }}
                >
                  <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
                </motion.div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Pipeline Cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10"
        >
          {pipelineCards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 + index * 0.1, type: "spring", stiffness: 100 }}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className="group relative bg-white/80 backdrop-blur-xl rounded-3xl border border-white/80 overflow-hidden shadow-xl shadow-slate-200/30 hover:shadow-2xl transition-all duration-500"
              style={{ boxShadow: `0 20px 50px -12px ${card.glowColor}` }}
            >
              <div className={cn(
                "absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                `bg-gradient-to-r ${card.gradient}`
              )} style={{ padding: "2px" }}>
                <div className="absolute inset-[2px] bg-white rounded-3xl" />
              </div>

              <div className={cn("h-2 w-full bg-gradient-to-r relative z-10", card.gradient)} />

              <div className="p-6 relative z-10">
                <div className="flex items-start gap-4 mb-5">
                  <motion.div
                    className={cn("w-16 h-16 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-2xl", card.gradient)}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    style={{ boxShadow: `0 10px 30px -5px ${card.glowColor}` }}
                  >
                    <card.icon className="w-8 h-8 text-white" />
                  </motion.div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6">
                  {card.features.map((feature, featureIndex) => (
                    <motion.div
                      key={featureIndex}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.5 + featureIndex * 0.05 }}
                      className="flex items-center gap-3 text-sm text-slate-600"
                    >
                      <motion.div
                        className="w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${card.accentColor}15` }}
                        whileHover={{ scale: 1.2 }}
                      >
                        <CheckCircle className="w-3 h-3" style={{ color: card.accentColor }} />
                      </motion.div>
                      {feature}
                    </motion.div>
                  ))}
                </div>

                <Button
                  onClick={() => navigate(card.route)}
                  className={cn("w-full h-12 gap-2 bg-gradient-to-r text-white border-0 shadow-lg transition-all duration-300 group/btn", card.gradient)}
                  style={{ boxShadow: `0 8px 20px -4px ${card.glowColor}` }}
                >
                  <span className="font-semibold">Open {card.title}</span>
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </Button>
              </div>

              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 0%, ${card.accentColor}, transparent 70%)` }}
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Recent Pipelines */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Recent Pipelines</h2>
              <p className="text-sm text-slate-500">Your most recently updated pipelines</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 gap-1.5 font-medium"
              onClick={() => navigate("/pipelines/summary")}
            >
              View All
              <ArrowUpRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 overflow-hidden shadow-xl shadow-slate-200/30">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : recentPipelines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <GitBranch className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">No pipelines yet. Create one to get started!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentPipelines.map((pipeline, index) => (
                  <motion.div
                    key={pipeline.name + index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + index * 0.05 }}
                    className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors cursor-pointer group"
                    onClick={() => navigate("/pipelines/summary")}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${pipeline.color}10` }}
                      >
                        <GitBranch className="w-5 h-5" style={{ color: pipeline.color }} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {pipeline.name}
                        </p>
                        <p className="text-xs text-slate-500">{pipeline.type}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium",
                          pipeline.status === "active" && "bg-emerald-50 text-emerald-600",
                          pipeline.status === "draft" && "bg-slate-100 text-slate-500",
                          pipeline.status === "inactive" && "bg-amber-50 text-amber-600",
                          pipeline.status === "archived" && "bg-slate-100 text-slate-400",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            pipeline.status === "active" && "bg-emerald-500",
                            pipeline.status === "draft" && "bg-slate-400",
                            pipeline.status === "inactive" && "bg-amber-500",
                          )}
                        />
                        {pipeline.status.charAt(0).toUpperCase() + pipeline.status.slice(1)}
                      </span>

                      <span className="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 min-w-[100px]">
                        <Clock className="w-3.5 h-3.5" />
                        {pipeline.lastRun}
                      </span>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ArrowUpRight className="w-4 h-4 text-slate-500" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
        </div>
      </div>
    </PermissionGate>
  );
}
