import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateConnectorDto {
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
  @IsString() connectorType: string;
  @IsString() connectorTool: string;
  @IsString() category: string;
  @IsString() @IsOptional() url?: string;
  @IsString() accountId: string;
  @IsString() enterpriseId: string;
  @IsString() @IsOptional() productId?: string;
  @IsString() @IsOptional() serviceId?: string;
  @IsString() @IsOptional() credentialId?: string;
  @IsArray() @IsOptional() workstreamIds?: string[];
}
