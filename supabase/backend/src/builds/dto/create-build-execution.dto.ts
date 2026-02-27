import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateBuildExecutionDto {
  @IsString()
  @IsOptional()
  buildJobId?: string;

  @IsString()
  buildNumber: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  jiraNumber?: string;

  @IsArray()
  @IsOptional()
  approvers?: string[];
}
