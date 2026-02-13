export class CreateConnectorDto {
  name: string;
  description?: string;
  connectorType: string;
  connectorTool: string;
  category: string;
  url?: string;
  accountId: string;
  enterpriseId: string;
  productId?: string;
  serviceId?: string;
  credentialId?: string;
  workstreamIds?: string[];
}
