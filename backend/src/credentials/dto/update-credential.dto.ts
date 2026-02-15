import { IsString, IsOptional, IsArray, IsObject, IsNumber, IsBoolean } from 'class-validator';

export class UpdateCredentialDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  serviceId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;

  @IsString()
  @IsOptional()
  expiresAt?: string | null;

  @IsNumber()
  @IsOptional()
  expiryNoticeDays?: number;

  @IsBoolean()
  @IsOptional()
  expiryNotify?: boolean;

  @IsArray()
  @IsOptional()
  workstreamIds?: string[];
}
