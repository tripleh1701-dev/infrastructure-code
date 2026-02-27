import { IsString, IsOptional, IsArray, IsEmail } from 'class-validator';

export class RunPipelineDto {
  @IsString()
  pipelineId: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  buildJobId?: string;

  @IsArray()
  @IsOptional()
  approverEmails?: string[];
}

export class ApproveStageDtoParams {
  executionId: string;
  stageId: string;
}
