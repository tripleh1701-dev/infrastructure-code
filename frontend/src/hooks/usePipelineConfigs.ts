import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccountContext } from '@/contexts/AccountContext';
import { useEnterpriseContext } from '@/contexts/EnterpriseContext';
import { toast } from 'sonner';
import {
  pipelineConfigsService,
  type GenerateBuildYamlInput,
} from '@/lib/api/services/pipeline-configs.service';
import { isExternalApi } from '@/lib/api/config';
import { supabase } from '@/integrations/supabase/client';

export function useBuildYamlGeneration() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const queryClient = useQueryClient();

  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;

  const generateBuildYaml = useMutation({
    mutationFn: async (input: Omit<GenerateBuildYamlInput, 'accountId' | 'enterpriseId'>) => {
      if (!accountId || !enterpriseId) throw new Error('Account and Enterprise required');
      return pipelineConfigsService.generateBuildYaml({
        accountId,
        enterpriseId,
        ...input,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline_configs'] });
      queryClient.invalidateQueries({ queryKey: ['build_jobs'] });
      toast.success(
        `Build YAML generated for "${result.pipelineName}" v${result.buildVersion}` +
        (result.lambdaInvoked ? ' — executor invoked' : ''),
      );
    },
    onError: (err: Error) => {
      toast.error('Failed to generate build YAML: ' + err.message);
    },
  });

  return {
    generateBuildYaml,
    isGenerating: generateBuildYaml.isPending,
    accountId,
    enterpriseId,
  };
}

/**
 * Hook to fetch a build job's latest Build YAML.
 * - In Supabase mode: reads yaml_content directly from build_jobs table.
 * - In external API mode: fetches from customer DynamoDB via backend.
 */
export function useBuildYamlViewer(buildJobId: string | undefined, pipelineName: string | undefined) {
  const { selectedAccount } = useAccountContext();
  const accountId = selectedAccount?.id;

  return useQuery({
    queryKey: ['build_yaml', accountId, buildJobId],
    queryFn: async () => {
      if (!accountId || !buildJobId) return null;

      if (isExternalApi()) {
        // External API mode: fetch from customer DynamoDB
        if (!pipelineName) return null;
        const items = await pipelineConfigsService.list(accountId);
        const matching = items
          .filter((i) => i.pipelineName === pipelineName)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        if (matching.length === 0) return null;
        return pipelineConfigsService.getOne(accountId, matching[0].pipelineName, matching[0].buildVersion);
      }

      // Supabase mode: read yaml_content from build_jobs table directly
      const { data, error } = await (supabase
        .from('build_jobs' as any)
        .select('yaml_content, pipeline, updated_at, status')
        .eq('id', buildJobId)
        .single() as any);

      if (error || !data?.yaml_content) return null;

      return {
        customerId: accountId,
        pipelineName: data.pipeline || 'Unknown',
        buildVersion: 'latest',
        yamlContent: data.yaml_content,
        stagesState: null,
        status: data.status || 'ACTIVE',
        createdAt: data.updated_at || new Date().toISOString(),
        createdBy: '',
      };
    },
    enabled: !!accountId && !!buildJobId,
  });
}
