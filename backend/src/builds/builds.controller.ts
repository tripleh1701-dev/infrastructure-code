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
  UseGuards,
} from '@nestjs/common';
import { BuildsService } from './builds.service';
import { CreateBuildJobDto } from './dto/create-build-job.dto';
import { UpdateBuildJobDto } from './dto/update-build-job.dto';
import { CreateBuildExecutionDto } from './dto/create-build-execution.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('builds')
@UseGuards(AccountGuard)
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
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async createJob(@Body() dto: CreateBuildJobDto) {
    return this.buildsService.createJob(dto);
  }

  @Put('jobs/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async updateJob(@Param('id') id: string, @Body() dto: UpdateBuildJobDto) {
    return this.buildsService.updateJob(id, dto);
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
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
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async createExecution(@Body() dto: CreateBuildExecutionDto) {
    return this.buildsService.createExecution(dto);
  }

  @Post('jobs/:buildJobId/executions')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async createExecutionNested(
    @Param('buildJobId') buildJobId: string,
    @Body() dto: CreateBuildExecutionDto,
  ) {
    dto.buildJobId = buildJobId;
    return this.buildsService.createExecution(dto);
  }

  @Put('jobs/:buildJobId/executions/:executionId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async updateExecution(
    @Param('buildJobId') buildJobId: string,
    @Param('executionId') executionId: string,
    @Body() updates: { status?: string; duration?: string; logs?: string },
  ) {
    return this.buildsService.updateExecution(buildJobId, executionId, updates);
  }
}
