import { IsString, IsOptional } from 'class-validator';

export class RunPipelineDto {
  @IsString()
  pipelineId: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  buildJobId?: string;
}

export class ApproveStageDtoParams {
  executionId: string;
  stageId: string;
}
