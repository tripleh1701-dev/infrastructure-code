import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateConnectorDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() url?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() health?: string;
  @IsString() @IsOptional() credentialId?: string | null;
  @IsArray() @IsOptional() workstreamIds?: string[];
}
