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
import { pipelineConfigsService } from "@/lib/api/services/pipeline-configs.service";
import { isExternalApi } from "@/lib/api/config";
import { supabase } from "@/integrations/supabase/client";

// Re-export types for backward compatibility
export type { BuildJob, BuildExecution, CreateBuildJobInput };

/**
 * Generate a Build YAML string from a pipeline name + stages state.
 * This is a client-side fallback for Supabase mode.
 */
function generateBuildYamlContent(buildJob: BuildJob): string {
  const stagesState = (buildJob.pipeline_stages_state as any) || {};
  const connectors = stagesState.selectedConnectors || {};
  const environments = stagesState.selectedEnvironments || {};
  const branches = stagesState.selectedBranches || {};
  const approvers = stagesState.selectedApprovers || {};

  const lines: string[] = [
    `pipeline:`,
    `  name: "${buildJob.pipeline || buildJob.connector_name}"`,
    `  buildVersion: "${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}"`,
    `  connector: "${buildJob.connector_name}"`,
    `  product: "${buildJob.product}"`,
    `  service: "${buildJob.service}"`,
    `  status: "${buildJob.status}"`,
    ``,
    `  execution:`,
    `    entryPoint: execute_pipeline`,
    `    logging:`,
    `      successMessage: "Pipeline execution completed successfully"`,
    `      errorBehavior: "exit_on_failure"`,
    `      failureExitCode: 1`,
    ``,
  ];

  // Connectors section
  const connectorEntries = Object.entries(connectors);
  if (connectorEntries.length > 0) {
    lines.push(`  connectors:`);
    for (const [stageId, connectorId] of connectorEntries) {
      lines.push(`    - stageId: "${stageId}"`);
      lines.push(`      connectorId: "${connectorId}"`);
      if (branches[stageId]) {
        lines.push(`      branch: "${branches[stageId]}"`);
      }
    }
    lines.push(``);
  }

  // Environments section
  const envEntries = Object.entries(environments);
  if (envEntries.length > 0) {
    lines.push(`  environments:`);
    for (const [stageId, envId] of envEntries) {
      lines.push(`    - stageId: "${stageId}"`);
      lines.push(`      environmentId: "${envId}"`);
    }
    lines.push(``);
  }

  // Approvers section
  const approverEntries = Object.entries(approvers);
  if (approverEntries.length > 0) {
    lines.push(`  approvers:`);
    for (const [stageId, emails] of approverEntries) {
      if (Array.isArray(emails) && emails.length > 0) {
        lines.push(`    - stageId: "${stageId}"`);
        lines.push(`      emails:`);
        for (const email of emails) {
          lines.push(`        - "${email}"`);
        }
      }
    }
    lines.push(``);
  }

  // Workstream / entity
  if (buildJob.entity) {
    lines.push(`  workstream: "${buildJob.entity}"`);
  }
  if (buildJob.scope) {
    lines.push(`  scope: "${buildJob.scope}"`);
  }

  lines.push(`  generatedAt: "${new Date().toISOString()}"`);

  return lines.join("\n");
}

export function useBuilds() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const queryClient = useQueryClient();

  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  // Helper: trigger Build YAML generation/update
  const syncBuildYaml = async (buildJob: BuildJob) => {
    if (!accountId || !enterpriseId) return;
    if (!buildJob.pipeline) return; // no pipeline assigned yet

    if (isExternalApi()) {
      // External API mode: call backend to generate & store in customer DynamoDB
      const stagesState = (buildJob.pipeline_stages_state as any) || {};
      try {
        await pipelineConfigsService.generateBuildYaml({
          accountId,
          enterpriseId,
          buildJobId: buildJob.id,
          buildVersion: new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14),
          pipelineStagesState: {
            selectedConnectors: stagesState.selectedConnectors || {},
            selectedEnvironments: stagesState.selectedEnvironments || {},
            connectorRepositoryUrls: stagesState.connectorRepositoryUrls || {},
            selectedBranches: stagesState.selectedBranches || {},
            selectedApprovers: stagesState.selectedApprovers || {},
          },
          status: "ACTIVE",
        });
      } catch (err: any) {
        console.warn("Build YAML sync failed:", err.message);
      }
    } else {
      // Supabase mode: generate YAML client-side and store in build_jobs.yaml_content
      try {
        const yamlContent = generateBuildYamlContent(buildJob);
        await (supabase
          .from("build_jobs" as any)
          .update({ yaml_content: yamlContent } as any)
          .eq("id", buildJob.id) as any);
      } catch (err: any) {
        console.warn("Build YAML sync failed:", err.message);
      }
    }
  };

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
    onSuccess: async (newJob) => {
      queryClient.invalidateQueries({ queryKey: ["build_jobs"] });
      toast.success("Build job created successfully");
      // Auto-generate initial Build YAML
      await syncBuildYaml(newJob);
    },
    onError: (err: Error) => toast.error("Failed to create build job: " + err.message),
  });

  const updateBuildJob = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<CreateBuildJobInput & { pipeline_stages_state: any }>) => {
      return buildsService.updateBuildJob(id, updates);
    },
    onSuccess: async (updatedJob) => {
      queryClient.invalidateQueries({ queryKey: ["build_jobs"] });
      toast.success("Build job updated");
      // Auto-update Build YAML whenever stages state changes
      await syncBuildYaml(updatedJob);
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
