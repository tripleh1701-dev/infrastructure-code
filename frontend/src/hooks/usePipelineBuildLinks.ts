import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccountContext } from "@/contexts/AccountContext";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

/**
 * Hook to check which pipelines are linked to build jobs (by name matching).
 * Returns a map of pipeline names → linked build job names.
 */
export function usePipelineBuildLinks() {
  const { selectedAccount } = useAccountContext();
  const accountId = selectedAccount?.id;

  const { data: linkedPipelineNames = new Map<string, string[]>(), isLoading } = useQuery({
    queryKey: ["pipeline-build-links", accountId],
    queryFn: async () => {
      if (!accountId) return new Map<string, string[]>();

      const { data: buildJobs, error } = await (supabase
        .from("build_jobs" as any)
        .select("id, connector_name, pipeline")
        .eq("account_id", accountId)
        .not("pipeline", "is", null) as any);

      if (error) {
        console.error("Error fetching build job pipeline links:", error);
        return new Map<string, string[]>();
      }

      // Build a map: pipeline name (lowercased) → array of build job names
      const linkMap = new Map<string, string[]>();
      (buildJobs || []).forEach((job) => {
        if (job.pipeline) {
          const key = job.pipeline.toLowerCase();
          if (!linkMap.has(key)) linkMap.set(key, []);
          linkMap.get(key)!.push(job.connector_name);
        }
      });

      return linkMap;
    },
    enabled: !!accountId,
  });

  /**
   * Check if a pipeline name is linked to any build jobs.
   * Returns the list of build job names if linked, or empty array.
   */
  const getLinkedBuildJobs = (pipelineName: string | null | undefined): string[] => {
    if (!pipelineName) return [];
    return linkedPipelineNames.get(pipelineName.toLowerCase()) || [];
  };

  /**
   * Returns true if the pipeline is linked to any build job.
   */
  const isPipelineLinked = (pipelineName: string | null | undefined): boolean => {
    return getLinkedBuildJobs(pipelineName).length > 0;
  };

  return {
    linkedPipelineNames,
    getLinkedBuildJobs,
    isPipelineLinked,
    isLoading,
  };
}
