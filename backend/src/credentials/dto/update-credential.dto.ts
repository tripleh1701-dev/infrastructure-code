export class UpdateCredentialDto {
  name?: string;
  description?: string;
  productId?: string;
  serviceId?: string;
  status?: string;
  credentials?: Record<string, any>;
  expiresAt?: string | null;
  expiryNoticeDays?: number;
  expiryNotify?: boolean;
  workstreamIds?: string[];
}
