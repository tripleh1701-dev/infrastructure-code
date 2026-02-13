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
import { WorkstreamsService } from './workstreams.service';
import { CreateWorkstreamDto } from './dto/create-workstream.dto';
import { UpdateWorkstreamDto } from './dto/update-workstream.dto';

@Controller('workstreams')
export class WorkstreamsController {
  constructor(private readonly workstreamsService: WorkstreamsService) {}

  /**
   * POST /api/workstreams/ensure-default
   * Ensures a Default workstream exists for the given account + enterprise.
   * Must be declared before :id routes.
   */
  @Post('ensure-default')
  @HttpCode(HttpStatus.OK)
  async ensureDefault(
    @Body() body: { accountId: string; enterpriseId: string },
  ) {
    return this.workstreamsService.ensureDefault(body.accountId, body.enterpriseId);
  }

  @Get()
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('enterpriseId') enterpriseId?: string,
  ) {
    return this.workstreamsService.findAll({ accountId, enterpriseId });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workstreamsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createWorkstreamDto: CreateWorkstreamDto) {
    return this.workstreamsService.create(createWorkstreamDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateWorkstreamDto: UpdateWorkstreamDto,
  ) {
    return this.workstreamsService.update(id, updateWorkstreamDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.workstreamsService.remove(id);
  }
}
