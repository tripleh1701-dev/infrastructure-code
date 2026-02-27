import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BuildsService } from './builds.service';
import { AccountGuard } from '../auth/guards/account.guard';

/**
 * Alias controller for GET /api/build-jobs
 * Used by the frontend's usePipelineBuildLinks hook.
 * Delegates to the same BuildsService.findAllJobs method.
 */
@Controller('build-jobs')
@UseGuards(AccountGuard)
export class BuildJobsController {
  constructor(private readonly buildsService: BuildsService) {}

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.buildsService.findAllJobs(accountId, enterpriseId);
  }
}
