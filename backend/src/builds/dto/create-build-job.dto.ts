export class CreateBuildJobDto {
  accountId: string;
  enterpriseId: string;
  connectorName: string;
  description?: string;
  entity?: string;
  pipeline?: string;
  product?: string;
  service?: string;
  status?: string;
  scope?: string;
  connectorIconName?: string;
  pipelineStagesState?: Record<string, any>;
}
