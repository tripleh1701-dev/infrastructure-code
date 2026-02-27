import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { PipelineConfigsService } from './pipeline-configs.service';
import { GenerateBuildYamlDto } from './dto/generate-build-yaml.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccountGuard } from '../auth/guards/account.guard';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

/**
 * Pipeline Configs Controller
 *
 * POST /api/pipeline-configs/generate  — Generate build YAML from pipeline + stages state
 * GET  /api/pipeline-configs           — List build YAMLs for the current account
 * GET  /api/pipeline-configs/:name/:version — Get a specific build YAML
 */
@Controller('pipeline-configs')
@UseGuards(AccountGuard)
export class PipelineConfigsController {
  constructor(private readonly service: PipelineConfigsService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async generate(
    @Body() dto: GenerateBuildYamlDto,
    @CurrentUser() user: CognitoUser,
  ) {
    if (user.accountId) dto.accountId = user.accountId;
    return this.service.generateBuildYaml(dto, user);
  }

  @Get()
  async findAll(
    @CurrentUser() user: CognitoUser,
    @Query('accountId') queryAccountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    const accountId = user.accountId || queryAccountId;
    if (!accountId) return [];
    return this.service.listByAccount(accountId, enterpriseId);
  }

  @Get(':name/:version')
  async findOne(
    @CurrentUser() user: CognitoUser,
    @Param('name') name: string,
    @Param('version') version: string,
    @Query('accountId') queryAccountId?: string,
  ) {
    const accountId = user.accountId || queryAccountId;
    if (!accountId) return null;
    return this.service.getOne(accountId, name, version);
  }
}
