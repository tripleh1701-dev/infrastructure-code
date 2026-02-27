import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  permissions?: number;

  @IsString()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  enterpriseId?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  serviceId?: string;

  @IsString()
  @IsOptional()
  workstreamId?: string;
}
