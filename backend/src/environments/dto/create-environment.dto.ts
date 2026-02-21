import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateEnvironmentDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsNotEmpty() accountId: string;
  @IsString() @IsNotEmpty() enterpriseId: string;
  @IsString() @IsOptional() workstreamId?: string;
  @IsString() @IsOptional() productId?: string;
  @IsString() @IsOptional() serviceId?: string;
  @IsString() @IsOptional() connectorName?: string;
  @IsString() @IsOptional() connectivityStatus?: string;
}
