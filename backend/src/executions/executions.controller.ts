import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { RunPipelineDto } from './dto/run-pipeline.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountGuard } from '../auth/guards/account.guard';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

/**
 * Executions Controller
 *
 * Provides REST API endpoints for pipeline execution lifecycle.
 *
 * Route hierarchy:
 *   POST   /api/executions/run                         — Start pipeline execution
 *   GET    /api/executions/:executionId/logs            — Get execution logs (polling)
 *   GET    /api/executions/pipeline/:pipelineId         — List executions for a pipeline
 *   POST   /api/executions/:executionId/approve/:stageId — Approve a stage
 */
@Controller('executions')
@UseGuards(AccountGuard)
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  /**
   * Start a pipeline execution.
   *
   * Parses the pipeline YAML, validates dependencies,
   * creates execution + stage records in DynamoDB,
   * and begins asynchronous stage execution.
   *
   * Returns executionId immediately for polling.
   */
  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async runPipeline(
    @Body() dto: RunPipelineDto,
    @CurrentUser() user: CognitoUser,
  ): Promise<{ executionId: string }> {
    return this.executionsService.runPipeline(
      user.accountId!,
      dto.pipelineId,
      user.sub,
      dto.buildJobId,
      dto.branch,
    );
  }

  /**
   * Get execution status and logs for polling.
   *
   * Frontend should poll this every 3 seconds until
   * status is not RUNNING.
   */
  @Get(':executionId/logs')
  async getExecutionLogs(
    @CurrentUser() user: CognitoUser,
    @Param('executionId') executionId: string,
  ) {
    return this.executionsService.getExecutionLogs(
      user.accountId!,
      executionId,
    );
  }

  /**
   * List all executions for a pipeline.
   */
  @Get('pipeline/:pipelineId')
  async listExecutions(
    @CurrentUser() user: CognitoUser,
    @Param('pipelineId') pipelineId: string,
  ) {
    return this.executionsService.listExecutions(
      user.accountId!,
      pipelineId,
    );
  }

  /**
   * Approve a stage that is WAITING_APPROVAL.
   *
   * Resumes pipeline execution from the paused stage.
   */
  @Post(':executionId/approve/:stageId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  async approveStage(
    @CurrentUser() user: CognitoUser,
    @Param('executionId') executionId: string,
    @Param('stageId') stageId: string,
  ): Promise<{ message: string }> {
    await this.executionsService.approveStage(
      user.accountId!,
      executionId,
      stageId,
      user.sub,
    );
    return { message: `Stage ${stageId} approved` };
  }
}
