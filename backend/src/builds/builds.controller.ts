import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BuildsService } from './builds.service';
import { CreateBuildJobDto } from './dto/create-build-job.dto';
import { UpdateBuildJobDto } from './dto/update-build-job.dto';
import { CreateBuildExecutionDto } from './dto/create-build-execution.dto';

@Controller('builds')
export class BuildsController {
  constructor(private readonly buildsService: BuildsService) {}

  // ─── BUILD JOBS ────────────────────────────────────────────────────────────

  @Get('jobs')
  async findAllJobs(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.buildsService.findAllJobs(accountId, enterpriseId);
  }

  @Get('jobs/:id')
  async findOneJob(@Param('id') id: string) {
    return this.buildsService.findOneJob(id);
  }

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  async createJob(@Body() dto: CreateBuildJobDto) {
    return this.buildsService.createJob(dto);
  }

  @Put('jobs/:id')
  async updateJob(@Param('id') id: string, @Body() dto: UpdateBuildJobDto) {
    return this.buildsService.updateJob(id, dto);
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeJob(@Param('id') id: string) {
    await this.buildsService.removeJob(id);
  }

  // ─── BUILD EXECUTIONS ─────────────────────────────────────────────────────

  @Get('jobs/:buildJobId/executions')
  async findExecutions(@Param('buildJobId') buildJobId: string) {
    return this.buildsService.findExecutions(buildJobId);
  }

  @Post('executions')
  @HttpCode(HttpStatus.CREATED)
  async createExecution(@Body() dto: CreateBuildExecutionDto) {
    return this.buildsService.createExecution(dto);
  }

  @Put('jobs/:buildJobId/executions/:executionId')
  async updateExecution(
    @Param('buildJobId') buildJobId: string,
    @Param('executionId') executionId: string,
    @Body() updates: { status?: string; duration?: string; logs?: string },
  ) {
    return this.buildsService.updateExecution(buildJobId, executionId, updates);
  }
}
