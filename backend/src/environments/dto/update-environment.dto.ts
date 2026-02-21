import { IsString, IsOptional } from 'class-validator';

export class UpdateEnvironmentDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() workstreamId?: string;
  @IsString() @IsOptional() productId?: string;
  @IsString() @IsOptional() serviceId?: string;
  @IsString() @IsOptional() connectorName?: string;
  @IsString() @IsOptional() connectivityStatus?: string;
}
