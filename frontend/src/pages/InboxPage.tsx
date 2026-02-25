import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInbox, type InboxNotification } from "@/hooks/useInbox";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  AlertTriangle,
  RefreshCw,
  Inbox,
  ShieldCheck,
  ShieldX,
  Bell,
  History,
  MailCheck,
  UserCheck,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

// Animation variants
const pageVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  }
} as const;

const statsCardVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 24,
      delay: i * 0.1
    }
  })
};

function NotificationCard({
  notification,
  onApprove,
  onReject,
  onDismiss,
  isApproving,
  isRejecting,
}: {
  notification: InboxNotification;
  onApprove: () => void;
  onReject: () => void;
  onDismiss: () => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  const isPending = notification.status === "PENDING";
  const isApproved = notification.status === "APPROVED";
  const isRejected = notification.status === "REJECTED";
  const isStale = notification.status === "STALE";
  const isApprovalRequest = notification.type === "APPROVAL_REQUEST";
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "rounded-xl border p-4 transition-all bg-white/80 backdrop-blur-sm",
        isPending
          ? "border-amber-500/30 shadow-sm shadow-amber-500/5"
          : isApproved
          ? "border-emerald-500/20 opacity-80"
          : isRejected
          ? "border-destructive/20 opacity-80"
          : isStale
          ? "border-slate-300/40 opacity-60"
          : "border-border/30 opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
            isPending
              ? "bg-amber-500/10 text-amber-500"
              : isApproved
              ? "bg-emerald-500/10 text-emerald-500"
              : isRejected
              ? "bg-destructive/10 text-destructive"
              : isStale
              ? "bg-slate-200/60 text-slate-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isApprovalRequest ? (
            isStale ? (
              <UserCheck className="w-4 h-4" />
            ) : isPending ? (
              <ShieldCheck className="w-4 h-4" />
            ) : isApproved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <ShieldX className="w-4 h-4" />
            )
          ) : (
            <Bell className="w-4 h-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-slate-800 truncate">
              {notification.title}
            </h4>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                isPending
                  ? "border-amber-500/40 text-amber-500"
                  : isApproved
                  ? "border-emerald-500/40 text-emerald-500"
                  : isRejected
                  ? "border-destructive/40 text-destructive"
                  : isStale
                  ? "border-slate-300/40 text-slate-400"
                  : "border-border text-muted-foreground"
              )}
            >
              {isStale ? "APPROVED BY ANOTHER" : notification.status}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground mb-2">{notification.message}</p>

          {/* Context chips */}
          {notification.context && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {notification.context.pipelineName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-600">
                  <GitBranch className="w-2.5 h-2.5" />
                  {notification.context.pipelineName}
                </span>
              )}
              {notification.context.stageName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-600">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {notification.context.stageName}
                </span>
              )}
              {notification.context.branch && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-600">
                  <GitBranch className="w-2.5 h-2.5" />
                  {notification.context.branch}
                </span>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo}
            </span>
            <span>From: {notification.senderEmail}</span>
            {notification.actionedBy && (
              <span>
                {isStale ? "Approved by another user" : isApproved ? "Approved" : "Rejected"} by: {notification.actionedBy}
              </span>
            )}
            {isStale && !notification.actionedBy && (
              <span className="italic text-slate-400">Already approved by another approver</span>
            )}
          </div>
        </div>

        {/* Actions */}
        {isPending && isApprovalRequest && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs gap-1"
              onClick={onApprove}
              disabled={isApproving || isRejecting}
            >
              {isApproving ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/10 text-xs gap-1"
              onClick={onReject}
              disabled={isApproving || isRejecting}
            >
              {isRejecting ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              Reject
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function InboxPage() {
  const {
    pendingNotifications,
    actionedNotifications,
    pendingCount,
    isLoading,
    refetch,
    approve,
    reject,
    dismiss,
  } = useInbox();

  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [historyFilter, setHistoryFilter] = useState<"all" | "APPROVED" | "REJECTED" | "STALE">("all");

  const filteredHistory = historyFilter === "all"
    ? actionedNotifications
    : actionedNotifications.filter(n => n.status === historyFilter);

  const displayNotifications = activeTab === "pending" ? pendingNotifications : filteredHistory;
  const approvedCount = actionedNotifications.filter(n => n.status === "APPROVED").length;
  const rejectedCount = actionedNotifications.filter(n => n.status === "REJECTED").length;
  const staleCount = actionedNotifications.filter(n => n.status === "STALE").length;

  return (
    <PermissionGate menuKey="inbox">
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
          <Header title="My Inbox" subtitle="Approval requests and notifications" />

          <motion.div
            className="p-6"
            variants={pageVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Stats */}
            <motion.div variants={itemVariants} className="mb-8">
              <div className="flex flex-col lg:flex-row lg:items-end gap-6">
                <motion.div
                  className="flex flex-wrap gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {[
                    { label: "Pending", value: pendingCount, icon: Clock, color: "#f59e0b", bgColor: "bg-amber-50" },
                    { label: "Approved", value: approvedCount, icon: CheckCircle, color: "#10b981", bgColor: "bg-emerald-50" },
                    { label: "Rejected", value: rejectedCount, icon: XCircle, color: "#ef4444", bgColor: "bg-red-50" },
                    { label: "Stale", value: staleCount, icon: UserCheck, color: "#94a3b8", bgColor: "bg-slate-50" },
                    { label: "Total", value: pendingCount + actionedNotifications.length, icon: Mail, color: "#8b5cf6", bgColor: "bg-violet-50" },
                  ].map((stat, i) => (
                    <Tooltip key={stat.label}>
                      <TooltipTrigger asChild>
                        <motion.div
                          custom={i}
                          variants={statsCardVariants}
                          initial="hidden"
                          animate="visible"
                          whileHover={{ scale: 1.05, y: -2 }}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/50 backdrop-blur-sm cursor-default",
                            stat.bgColor,
                            "shadow-sm hover:shadow-md transition-shadow duration-300"
                          )}
                        >
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm"
                            style={{ background: `linear-gradient(135deg, ${stat.color}, ${stat.color}cc)` }}
                          >
                            <stat.icon className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-lg font-bold text-slate-800">{stat.value}</span>
                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{stat.label}</span>
                          </div>
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{stat.value} {stat.label.toLowerCase()}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </motion.div>
              </div>
            </motion.div>

            {/* Tabs + Refresh */}
            <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                <TabsList className="bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl shadow-lg shadow-slate-200/50 dark:bg-card/80 dark:border-border dark:shadow-none">
                  <TabsTrigger value="pending" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 dark:data-[state=active]:bg-card dark:data-[state=active]:border dark:data-[state=active]:border-border dark:data-[state=active]:shadow-none">
                    <Clock className="w-3.5 h-3.5" />
                    Pending
                    {pendingCount > 0 && (
                      <Badge className="ml-1 text-[10px] h-4 px-1.5 bg-amber-500 text-white border-0">
                        {pendingCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 dark:data-[state=active]:bg-card dark:data-[state=active]:border dark:data-[state=active]:border-border dark:data-[state=active]:shadow-none">
                    <History className="w-3.5 h-3.5" />
                    History
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5 text-xs bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-sm hover:shadow-md transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>

              {activeTab === "history" && (
                <Select value={historyFilter} onValueChange={(v) => setHistoryFilter(v as any)}>
                  <SelectTrigger className="w-[160px] h-8 text-xs bg-white border-slate-200/60 shadow-sm">
                    <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50 border border-slate-200 shadow-lg">
                    <SelectItem value="all" className="text-xs">All History</SelectItem>
                    <SelectItem value="APPROVED" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-emerald-500" /> Approved
                      </span>
                    </SelectItem>
                    <SelectItem value="REJECTED" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <XCircle className="w-3 h-3 text-destructive" /> Rejected
                      </span>
                    </SelectItem>
                    <SelectItem value="STALE" className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="w-3 h-3 text-slate-400" /> Stale
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </motion.div>

            {/* Content */}
            <motion.div variants={itemVariants}>
              <ScrollArea className="h-[calc(100vh-340px)]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : displayNotifications.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-20 text-muted-foreground"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      {activeTab === "pending" ? (
                        <Inbox className="w-8 h-8 text-slate-400" />
                      ) : (
                        <MailCheck className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-600">
                      {activeTab === "pending" ? "No pending requests" : "No history yet"}
                    </p>
                    <p className="text-xs mt-1 text-slate-400 max-w-sm text-center">
                      {activeTab === "pending"
                        ? "You'll see approval requests here when pipelines need your sign-off."
                        : "Approved and rejected items will appear here."}
                    </p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {displayNotifications.map((notification) => (
                        <NotificationCard
                          key={notification.notificationId}
                          notification={notification}
                          onApprove={() => approve.mutate(notification)}
                          onReject={() => reject.mutate(notification)}
                          onDismiss={() => dismiss.mutate(notification.notificationId)}
                          isApproving={approve.isPending}
                          isRejecting={reject.isPending}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </ScrollArea>
            </motion.div>
          </motion.div>
        </div>
      </TooltipProvider>
    </PermissionGate>
  );
}
