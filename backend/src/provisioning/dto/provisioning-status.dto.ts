export class ProvisioningResourceDto {
  type: 'dynamodb' | 'iam' | 'ssm' | 'cloudformation';
  name: string;
  status: 'pending' | 'creating' | 'active' | 'failed' | 'deleting';
  arn?: string;
}

export class ProvisioningStatusDto {
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private' | 'hybrid';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  stackId?: string;
  tableName?: string;
  tableArn?: string;
  resources: ProvisioningResourceDto[];
  error?: string;
}

export class ProvisioningJobDto {
  id: string;
  accountId: string;
  accountName: string;
  cloudType: 'public' | 'private' | 'hybrid';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  stackId?: string;
  resources: ProvisioningResourceDto[];
}
