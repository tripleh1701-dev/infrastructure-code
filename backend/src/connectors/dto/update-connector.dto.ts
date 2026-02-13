export class UpdateConnectorDto {
  name?: string;
  description?: string;
  url?: string;
  status?: string;
  health?: string;
  credentialId?: string | null;
  workstreamIds?: string[];
}
