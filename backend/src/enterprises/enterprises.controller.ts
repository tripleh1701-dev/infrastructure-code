import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EnterprisesService } from './enterprises.service';
import { CreateEnterpriseDto } from './dto/create-enterprise.dto';
import { UpdateEnterpriseDto } from './dto/update-enterprise.dto';

@Controller('enterprises')
export class EnterprisesController {
  constructor(private readonly enterprisesService: EnterprisesService) {}

  @Get()
  async findAll() {
    return this.enterprisesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.enterprisesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createEnterpriseDto: CreateEnterpriseDto) {
    return this.enterprisesService.create(createEnterpriseDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateEnterpriseDto: UpdateEnterpriseDto,
  ) {
    return this.enterprisesService.update(id, updateEnterpriseDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.enterprisesService.remove(id);
  }
}

@Controller('enterprise-products')
export class EnterpriseProductsController {
  constructor(private readonly enterprisesService: EnterprisesService) {}

  @Get()
  async findAll() {
    return this.enterprisesService.findAllEnterpriseProducts();
  }
}
