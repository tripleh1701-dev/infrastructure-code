import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ArtifactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;
}

export enum PipelineConfigStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
}

/**
 * DTO for creating a pipeline configuration.
 * All sensitive fields (tokens, secrets, API keys) are encrypted via KMS
 * before being stored in the customer's DynamoDB table.
 */
export class CreatePipelineConfigDto {
  /** Tenant context */
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsNotEmpty()
  enterpriseId: string;

  /** Pipeline identity */
  @IsString()
  @IsNotEmpty()
  pipelineName: string;

  @IsString()
  @IsNotEmpty()
  buildVersion: string;

  /** JIRA configuration */
  @IsString()
  @IsNotEmpty()
  jiraUrl: string;

  @IsString()
  @IsNotEmpty()
  jiraUsername: string;

  @IsString()
  @IsNotEmpty()
  jiraApiKey: string;

  @IsString()
  @IsNotEmpty()
  jiraIssueKey: string;

  /** GitHub configuration */
  @IsString()
  @IsNotEmpty()
  githubRepoUrl: string;

  @IsString()
  @IsNotEmpty()
  githubBranch: string;

  @IsString()
  @IsNotEmpty()
  githubToken: string;

  /** SAP CPI configuration */
  @IsString()
  @IsNotEmpty()
  sapCpiApiUrl: string;

  @IsString()
  @IsNotEmpty()
  sapCpiClientId: string;

  @IsString()
  @IsNotEmpty()
  sapCpiClientSecret: string;

  @IsString()
  @IsNotEmpty()
  sapCpiTokenUrl: string;

  /** Artifacts to deploy */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArtifactDto)
  artifacts: ArtifactDto[];

  /** Optional initial status */
  @IsEnum(PipelineConfigStatus)
  @IsOptional()
  status?: PipelineConfigStatus;
}
