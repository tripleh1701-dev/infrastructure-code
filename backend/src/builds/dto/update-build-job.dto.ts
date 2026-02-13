export class UpdateBuildJobDto {
  connectorName?: string;
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
