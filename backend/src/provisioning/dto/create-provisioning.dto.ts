import { IsString, IsNotEmpty, IsIn, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';

export class CreateProvisioningDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsString()
  @IsIn(['public', 'private', 'hybrid'])
  cloudType: 'public' | 'private' | 'hybrid';

  @IsOptional()
  @IsString()
  @IsIn(['PAY_PER_REQUEST', 'PROVISIONED'])
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';

  @IsOptional()
  @IsNumber()
  @Min(1)
  readCapacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  writeCapacity?: number;

  @IsOptional()
  @IsBoolean()
  enableAutoScaling?: boolean;

  @IsOptional()
  @IsBoolean()
  enablePointInTimeRecovery?: boolean;

  @IsOptional()
  @IsBoolean()
  enableDeletionProtection?: boolean;
}
