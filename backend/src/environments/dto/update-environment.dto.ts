import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EnvironmentConnectorDto } from './create-environment.dto';

export class UpdateEnvironmentDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() workstreamId?: string;
  @IsString() @IsOptional() productId?: string;
  @IsString() @IsOptional() serviceId?: string;
  @IsString() @IsOptional() connectorName?: string;
  @IsString() @IsOptional() connectivityStatus?: string;
  @IsString() @IsOptional() scope?: string;
  @IsString() @IsOptional() entity?: string;
  @IsString() @IsOptional() connectorIconName?: string;
  @IsArray() @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnvironmentConnectorDto)
  connectors?: EnvironmentConnectorDto[];
}
