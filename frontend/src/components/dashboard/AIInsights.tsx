import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, CheckCircle, Info, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Insight {
  id: string;
  type: "success" | "warning" | "info";
  title: string;
  description: string;
  action?: string;
}

const insights: Insight[] = [
  {
    id: "1",
    type: "success",
    title: "Pipeline optimization detected",
    description: "Your SAP Integration Suite pipeline can be 23% faster by enabling parallel builds.",
    action: "Apply Optimization",
  },
  {
    id: "2",
    type: "warning",
    title: "Build failure pattern",
    description: "3 consecutive failures on develop branch. Consider reviewing recent commits.",
    action: "View Details",
  },
  {
    id: "3",
    type: "info",
    title: "New integration available",
    description: "GitHub Actions can now be integrated for enhanced CI/CD workflows.",
    action: "Learn More",
  },
];

const typeConfig = {
  success: {
    icon: CheckCircle,
    bgClass: "bg-success/10",
    iconClass: "text-success",
    borderClass: "border-transparent",
  },
  warning: {
    icon: AlertTriangle,
    bgClass: "bg-warning/10",
    iconClass: "text-warning",
    borderClass: "border-transparent",
  },
  info: {
    icon: Info,
    bgClass: "bg-primary/10",
    iconClass: "text-primary",
    borderClass: "border-transparent",
  },
};

export function AIInsights() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="glass-card overflow-hidden"
    >
      <div className="p-5 border-b border-border flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            AI Insights
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-accent/20 text-accent">
              Beta
            </span>
          </h3>
          <p className="text-sm text-muted-foreground">Intelligent recommendations for your pipelines</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {insights.map((insight, index) => {
          const config = typeConfig[insight.type];
          const Icon = config.icon;

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
              whileHover={{ x: 4 }}
              className={cn(
                "p-4 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-md",
                config.bgClass,
                config.borderClass
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("p-1.5 rounded-md", config.bgClass)}>
                  <Icon className={cn("w-4 h-4", config.iconClass)} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground text-sm">{insight.title}</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
                  {insight.action && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-0 mt-2 text-primary hover:text-primary hover:bg-transparent gap-1.5"
                    >
                      {insight.action}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="p-4 border-t border-border">
        <Button variant="outline" className="w-full gap-2">
          <Zap className="w-4 h-4" />
          Generate More Insights
        </Button>
      </div>
    </motion.div>
  );
}
