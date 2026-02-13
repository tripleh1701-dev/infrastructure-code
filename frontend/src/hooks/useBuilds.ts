import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { toast } from "sonner";
import {
  buildsService,
  type BuildJob,
  type BuildExecution,
  type CreateBuildJobInput,
} from "@/lib/api/services/builds.service";

// Re-export types for backward compatibility
export type { BuildJob, BuildExecution, CreateBuildJobInput };

export function useBuilds() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const queryClient = useQueryClient();

  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  const { data: buildJobs = [], isLoading, refetch } = useQuery({
    queryKey: ["build_jobs", accountId, enterpriseId],
    queryFn: async () => {
      if (!accountId || !enterpriseId) return [];
      return buildsService.getBuildJobs(accountId, enterpriseId);
    },
    enabled: !!accountId && !!enterpriseId,
  });

  const createBuildJob = useMutation({
    mutationFn: async (input: CreateBuildJobInput) => {
      if (!accountId || !enterpriseId) throw new Error("Account and Enterprise required");
      return buildsService.createBuildJob(accountId, enterpriseId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build_jobs"] });
      toast.success("Build job created successfully");
    },
    onError: (err: Error) => toast.error("Failed to create build job: " + err.message),
  });

  const updateBuildJob = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<CreateBuildJobInput & { pipeline_stages_state: any }>) => {
      return buildsService.updateBuildJob(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build_jobs"] });
      toast.success("Build job updated");
    },
    onError: (err: Error) => toast.error("Failed to update: " + err.message),
  });

  const deleteBuildJob = useMutation({
    mutationFn: async (id: string) => {
      return buildsService.deleteBuildJob(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build_jobs"] });
      toast.success("Build job deleted");
    },
    onError: (err: Error) => toast.error("Failed to delete: " + err.message),
  });

  // Executions
  const fetchExecutions = async (buildJobId: string): Promise<BuildExecution[]> => {
    return buildsService.getExecutions(buildJobId);
  };

  const createExecution = useMutation({
    mutationFn: async (input: { build_job_id: string; build_number: string; branch?: string; jira_number?: string; approvers?: string[] }) => {
      return buildsService.createExecution(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["build_executions"] });
    },
  });

  return {
    buildJobs,
    isLoading,
    refetch,
    createBuildJob,
    updateBuildJob,
    deleteBuildJob,
    fetchExecutions,
    createExecution,
    accountId,
    enterpriseId,
  };
}
