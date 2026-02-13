import { IsString, IsOptional, IsArray, IsObject, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PipelineStatus, PipelineNodeDto, PipelineEdgeDto } from './create-pipeline.dto';

/**
 * DTO for updating an existing pipeline
 * 
 * All fields are optional — only provided fields are updated.
 * Account/Enterprise context cannot be changed after creation.
 */
export class UpdatePipelineDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  productId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceIds?: string[];

  @IsString()
  @IsOptional()
  deploymentType?: string;

  @IsEnum(PipelineStatus)
  @IsOptional()
  status?: PipelineStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineNodeDto)
  @IsOptional()
  nodes?: PipelineNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PipelineEdgeDto)
  @IsOptional()
  edges?: PipelineEdgeDto[];

  @IsString()
  @IsOptional()
  yamlContent?: string;
}
