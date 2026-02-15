import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateBuildJobDto {
  @IsString()
  accountId: string;

  @IsString()
  enterpriseId: string;

  @IsString()
  connectorName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  entity?: string;

  @IsString()
  @IsOptional()
  pipeline?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsString()
  @IsOptional()
  service?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  scope?: string;

  @IsString()
  @IsOptional()
  connectorIconName?: string;

  @IsObject()
  @IsOptional()
  pipelineStagesState?: Record<string, any>;
}
