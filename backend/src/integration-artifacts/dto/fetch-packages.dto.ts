import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class FetchPackagesDto {
  @IsString() @IsNotEmpty() apiUrl: string;
  @IsString() @IsNotEmpty() authenticationType: string;
  @IsString() @IsNotEmpty() accountId: string;
  @IsString() @IsOptional() accountName?: string;
  @IsString() @IsNotEmpty() enterpriseId: string;
  @IsString() @IsOptional() enterpriseName?: string;
  @IsString() @IsOptional() workstream?: string;
  @IsString() @IsOptional() product?: string;
  @IsString() @IsOptional() service?: string;
  @IsString() @IsOptional() environmentName?: string;
  @IsString() @IsOptional() credentialName?: string;

  // OAuth2 fields
  @IsString() @IsOptional() oauth2ClientId?: string;
  @IsString() @IsOptional() oauth2ClientSecret?: string;
  @IsString() @IsOptional() oauth2TokenUrl?: string;

  // Basic / API Key fields
  @IsString() @IsOptional() username?: string;
  @IsString() @IsOptional() apiKey?: string;
}
