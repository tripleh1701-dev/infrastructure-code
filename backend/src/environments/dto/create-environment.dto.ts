import { IsString, IsOptional, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class EnvironmentConnectorDto {
  @IsString() @IsOptional() id?: string;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() connector?: string;
  @IsString() @IsOptional() connectorIconName?: string;
  @IsString() @IsOptional() environmentType?: string;
  @IsString() @IsOptional() apiUrl?: string;
  @IsString() @IsOptional() apiCredentialName?: string;
  @IsString() @IsOptional() iflowUrl?: string;
  @IsString() @IsOptional() iflowCredentialName?: string;
  @IsString() @IsOptional() hostUrl?: string;
  @IsString() @IsOptional() authenticationType?: string;
  @IsString() @IsOptional() credentialName?: string;
  @IsString() @IsOptional() oauth2ClientId?: string;
  @IsString() @IsOptional() oauth2ClientSecret?: string;
  @IsString() @IsOptional() oauth2TokenUrl?: string;
  @IsString() @IsOptional() username?: string;
  @IsString() @IsOptional() apiKey?: string;
  @IsString() @IsOptional() url?: string;
  @IsString() @IsOptional() personalAccessToken?: string;
  @IsString() @IsOptional() githubInstallationId?: string;
  @IsString() @IsOptional() githubApplicationId?: string;
  @IsString() @IsOptional() githubPrivateKey?: string;
  @IsOptional() status?: boolean;
  @IsString() @IsOptional() description?: string;
}

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
  @IsString() @IsOptional() scope?: string;
  @IsString() @IsOptional() entity?: string;
  @IsString() @IsOptional() connectorIconName?: string;
  @IsArray() @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnvironmentConnectorDto)
  connectors?: EnvironmentConnectorDto[];
}
