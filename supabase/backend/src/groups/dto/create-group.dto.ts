import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  enterpriseId?: string;

  @IsString()
  @IsOptional()
  workstreamId?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  @IsOptional()
  serviceId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  roleIds?: string[];
}
