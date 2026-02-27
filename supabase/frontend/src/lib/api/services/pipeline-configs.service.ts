/**
 * Pipeline Configs Service — Build YAML Generation
 *
 * Calls POST /api/pipeline-configs/generate to construct a build YAML
 * from the pipeline YAML + stages state (connectors, environments, etc.),
 * store it in the customer's DynamoDB, and invoke the executor Lambda.
 */
import { httpClient } from '@/lib/api/http-client';
import { isExternalApi } from '@/lib/api/config';

export interface GenerateBuildYamlInput {
  accountId: string;
  enterpriseId: string;
  buildJobId: string;
  buildVersion: string;
  pipelineStagesState: {
    selectedConnectors: Record<string, string>;
    selectedEnvironments: Record<string, string>;
    connectorRepositoryUrls: Record<string, string>;
    selectedBranches: Record<string, string>;
    selectedApprovers: Record<string, string[]>;
    [key: string]: any;
  };
  status?: 'DRAFT' | 'ACTIVE';
}

export interface BuildYamlResult {
  customerId: string;
  pipelineName: string;
  buildVersion: string;
  pipelineId: string;
  buildJobId: string;
  status: string;
  yamlPreview: string;
  createdAt: string;
  createdBy: string;
  lambdaInvoked: boolean;
  stageCount: number;
}

export interface BuildYamlListItem {
  customerId: string;
  pipelineName: string;
  buildVersion: string;
  buildJobId: string;
  pipelineId: string;
  status: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface BuildYamlDetail {
  customerId: string;
  pipelineName: string;
  buildVersion: string;
  yamlContent: string;
  stagesState: any;
  status: string;
  createdAt: string;
  createdBy: string;
}
export const pipelineConfigsService = {
  async generateBuildYaml(input: GenerateBuildYamlInput): Promise<BuildYamlResult> {
    if (!isExternalApi()) {
      throw new Error('Build YAML generation requires the external API backend');
    }

    const { data, error } = await httpClient.post<BuildYamlResult>(
      '/pipeline-configs/generate',
      input,
    );

    if (error) throw new Error(error.message);
    return data!;
  },

  async list(accountId: string, enterpriseId?: string): Promise<BuildYamlListItem[]> {
    if (!isExternalApi()) return [];

    const { data, error } = await httpClient.get<BuildYamlListItem[]>(
      '/pipeline-configs',
      { params: { accountId, enterpriseId } },
    );

    if (error) throw new Error(error.message);
    return data || [];
  },

  async getOne(accountId: string, pipelineName: string, buildVersion: string): Promise<BuildYamlDetail | null> {
    if (!isExternalApi()) return null;

    const { data, error } = await httpClient.get<BuildYamlDetail>(
      `/pipeline-configs/${encodeURIComponent(pipelineName)}/${encodeURIComponent(buildVersion)}`,
      { params: { accountId } },
    );

    if (error) throw new Error(error.message);
    return data || null;
  },
};
