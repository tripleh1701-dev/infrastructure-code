export class CreateCredentialDto {
  name: string;
  description?: string;
  accountId: string;
  enterpriseId: string;
  workstreamIds?: string[];
  productId?: string;
  serviceId?: string;
  category: string;
  connector: string;
  authType: string;
  credentials?: Record<string, any>;
  createdBy?: string;
  expiresAt?: string;
  expiryNoticeDays?: number;
  expiryNotify?: boolean;
}
