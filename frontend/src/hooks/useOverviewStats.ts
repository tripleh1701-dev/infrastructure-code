import { useQuery } from "@tanstack/react-query";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export interface OverviewStats {
  totalBuildJobs: number;
  activePipelines: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  successRate: number;
  avgBuildTimeSec: number;
  totalUsers: number;
  activeUsers: number;
  totalConnectors: number;
  totalCredentials: number;
  totalWorkstreams: number;
  recentExecutions: RecentExecution[];
  buildTrend: { name: string; value: number }[];
}

export interface RecentExecution {
  id: string;
  pipeline: string;
  connectorName: string;
  branch: string;
  status: string;
  duration: string;
  time: string;
  buildNumber: string;
}

function parseDurationToSeconds(duration: string | null): number {
  if (!duration) return 0;
  let seconds = 0;
  const mMatch = duration.match(/(\d+)\s*m/);
  const sMatch = duration.match(/(\d+)\s*s/);
  if (mMatch) seconds += parseInt(mMatch[1]) * 60;
  if (sMatch) seconds += parseInt(sMatch[1]);
  return seconds;
}

export function formatSeconds(totalSec: number): string {
  if (totalSec === 0) return "0s";
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

export function useOverviewStats() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  return useQuery<OverviewStats>({
    queryKey: ["overview-stats", accountId, enterpriseId],
    queryFn: async (): Promise<OverviewStats> => {
      if (!accountId || !enterpriseId) throw new Error("Missing context");

      const sb = supabase as any;

      // Parallel queries
      const [buildJobsRes, pipelinesRes, usersRes, connectorsRes, credentialsRes, workstreamsRes] = await Promise.all([
        sb.from("build_jobs").select("id, connector_name, pipeline, status, created_at").eq("account_id", accountId).eq("enterprise_id", enterpriseId),
        sb.from("pipelines").select("id, status").eq("account_id", accountId).eq("enterprise_id", enterpriseId),
        sb.from("account_technical_users").select("id, status").eq("account_id", accountId),
        sb.from("connectors").select("id").eq("account_id", accountId).eq("enterprise_id", enterpriseId),
        sb.from("credentials").select("id").eq("account_id", accountId).eq("enterprise_id", enterpriseId),
        sb.from("workstreams").select("id").eq("account_id", accountId).eq("enterprise_id", enterpriseId),
      ]);

      const buildJobs: any[] = buildJobsRes.data || [];
      const pipelines: any[] = pipelinesRes.data || [];
      const users: any[] = usersRes.data || [];
      const connectors: any[] = connectorsRes.data || [];
      const credentials: any[] = credentialsRes.data || [];
      const workstreams: any[] = workstreamsRes.data || [];

      // Fetch executions
      const buildJobIds = buildJobs.map((b: any) => b.id);
      let executions: any[] = [];
      if (buildJobIds.length > 0) {
        const { data } = await sb
          .from("build_executions")
          .select("id, build_job_id, build_number, branch, status, duration, timestamp, created_at")
          .in("build_job_id", buildJobIds)
          .order("timestamp", { ascending: false })
          .limit(100);
        executions = data || [];
      }

      const totalExecutions = executions.length;
      const successfulExecutions = executions.filter((e: any) => e.status?.toLowerCase() === "success").length;
      const failedExecutions = executions.filter((e: any) => e.status?.toLowerCase() === "failed").length;
      const runningExecutions = executions.filter((e: any) => ["running", "pending"].includes(e.status?.toLowerCase())).length;
      const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

      const durations = executions.map((e: any) => parseDurationToSeconds(e.duration)).filter((d: number) => d > 0);
      const avgBuildTimeSec = durations.length > 0 ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length : 0;

      const jobMap = new Map(buildJobs.map((b: any) => [b.id, b]));

      const recentExecutions: RecentExecution[] = executions.slice(0, 10).map((e: any) => {
        const job: any = jobMap.get(e.build_job_id);
        return {
          id: e.id,
          pipeline: job?.pipeline || job?.connector_name || "Unknown",
          connectorName: job?.connector_name || "",
          branch: e.branch || "main",
          status: (e.status || "pending").toLowerCase(),
          duration: e.duration || "—",
          time: formatDistanceToNow(new Date(e.timestamp), { addSuffix: true }),
          buildNumber: e.build_number,
        };
      });

      // Build trend: last 7 days
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dayMap = new Map<string, number>();
      dayOrder.forEach((d) => dayMap.set(d, 0));
      executions
        .filter((e: any) => new Date(e.timestamp) >= sevenDaysAgo)
        .forEach((e: any) => {
          const label = getDayLabel(e.timestamp);
          dayMap.set(label, (dayMap.get(label) || 0) + 1);
        });
      const buildTrend = dayOrder.map((d) => ({ name: d, value: dayMap.get(d) || 0 }));

      return {
        totalBuildJobs: buildJobs.length,
        activePipelines: pipelines.filter((p: any) => p.status === "active").length,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        runningExecutions,
        successRate,
        avgBuildTimeSec,
        totalUsers: users.length,
        activeUsers: users.filter((u: any) => u.status === "active").length,
        totalConnectors: connectors.length,
        totalCredentials: credentials.length,
        totalWorkstreams: workstreams.length,
        recentExecutions,
        buildTrend,
      };
    },
    enabled: !!accountId && !!enterpriseId,
    refetchInterval: 30000,
  });
}
