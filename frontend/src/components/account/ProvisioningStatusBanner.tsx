import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, X, Cloud, Server, Database, Key, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProvisioningStatus, ProvisioningEvent } from "@/hooks/useProvisioningStatus";
import { cn } from "@/lib/utils";

export function ProvisioningStatusBanner() {
  const { events, clearEvent } = useProvisioningStatus();

  // Only show events from the last 60 seconds for completed/failed
  const visibleEvents = events.filter((event) => {
    if (event.status === "in_progress" || event.status === "pending") return true;
    if (event.completedAt) {
      const elapsed = Date.now() - event.completedAt.getTime();
      return elapsed < 60000;
    }
    return false;
  });

  if (visibleEvents.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      <AnimatePresence mode="popLayout">
        {visibleEvents.map((event) => (
          <ProvisioningEventCard 
            key={event.id} 
            event={event} 
            onDismiss={() => clearEvent(event.accountId)} 
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ProvisioningEventCardProps {
  event: ProvisioningEvent;
  onDismiss: () => void;
}

function ProvisioningEventCard({ event, onDismiss }: ProvisioningEventCardProps) {
  const isPending = event.status === "pending";
  const isInProgress = event.status === "in_progress";
  const isCompleted = event.status === "completed";
  const isFailed = event.status === "failed";
  const isActive = isPending || isInProgress;

  const Icon = event.cloudType === "private" ? Server : Cloud;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative flex flex-col gap-3 p-4 rounded-lg border shadow-sm",
        isActive && "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
        isCompleted && "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
        isFailed && "bg-destructive/10 border-destructive/30"
      )}
    >
      <div className="flex items-center gap-4">
        {/* Cloud Type Icon */}
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full shrink-0",
          isActive && "bg-blue-100 dark:bg-blue-900/50",
          isCompleted && "bg-green-100 dark:bg-green-900/50",
          isFailed && "bg-destructive/20"
        )}>
          <Icon className={cn(
            "w-5 h-5",
            isActive && "text-blue-600 dark:text-blue-400",
            isCompleted && "text-green-600 dark:text-green-400",
            isFailed && "text-destructive"
          )} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground truncate">
              {event.accountName}
            </span>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-medium",
              event.cloudType === "private" 
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                : "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
            )}>
              {event.cloudType}
            </span>
            {event.stackName && (
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                {event.stackName}
              </span>
            )}
          </div>
          <p className={cn(
            "text-sm mt-0.5",
            isActive && "text-blue-600 dark:text-blue-400",
            isCompleted && "text-green-600 dark:text-green-400",
            isFailed && "text-destructive"
          )}>
            {event.message}
          </p>
          {isFailed && event.error && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {event.error}
            </p>
          )}
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">{event.progress}%</span>
            </div>
          )}
          {isCompleted && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">Ready</span>
            </div>
          )}
          {isFailed && (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Failed</span>
            </div>
          )}
        </div>

        {/* Dismiss Button (only for completed/failed) */}
        {!isActive && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Progress Bar and Resources for active provisioning */}
      {isActive && (
        <div className="pl-14 space-y-2">
          <Progress 
            value={event.progress} 
            className="h-2 bg-blue-100 dark:bg-blue-900/30"
          />
          
          {/* Resource Status */}
          {event.resources && event.resources.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {event.resources.map((resource) => (
                <ResourceBadge key={resource.logicalId} resource={resource} />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface ResourceBadgeProps {
  resource: {
    logicalId: string;
    type: string;
    status: string;
  };
}

function ResourceBadge({ resource }: ResourceBadgeProps) {
  const isComplete = resource.status.includes('COMPLETE');
  const isInProgress = resource.status.includes('IN_PROGRESS');
  const isFailed = resource.status.includes('FAILED');

  const getIcon = () => {
    if (resource.type.includes('DynamoDB')) return Database;
    if (resource.type.includes('IAM')) return Key;
    if (resource.type.includes('SSM')) return Settings;
    return Cloud;
  };

  const Icon = getIcon();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
        isComplete && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
        isInProgress && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        isFailed && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      )}
    >
      {isInProgress ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      <span>{resource.logicalId}</span>
    </motion.div>
  );
}
