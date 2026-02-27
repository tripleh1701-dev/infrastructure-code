import { IsString, IsOptional, IsArray, IsObject, IsNumber, IsBoolean } from 'class-validator';

export class CreateCredentialDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  accountId: string;

  @IsString()
  enterpriseId: string;

  @IsArray()
  @IsOptional()
  workstreamIds?: string[];

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  serviceId?: string;

  @IsString()
  category: string;

  @IsString()
  connector: string;

  @IsString()
  authType: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsString()
  @IsOptional()
  expiresAt?: string;

  @IsNumber()
  @IsOptional()
  expiryNoticeDays?: number;

  @IsBoolean()
  @IsOptional()
  expiryNotify?: boolean;
}
