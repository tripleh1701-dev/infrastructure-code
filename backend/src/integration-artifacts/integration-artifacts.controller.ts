import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IntegrationArtifactsService } from './integration-artifacts.service';
import { FetchPackagesDto } from './dto/fetch-packages.dto';
import { AccountGuard } from '../auth/guards/account.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('integration-artifacts')
@UseGuards(AccountGuard)
export class IntegrationArtifactsController {
  constructor(private readonly service: IntegrationArtifactsService) {}

  @Post('fetch-packages')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'user')
  async fetchPackages(@Body() dto: FetchPackagesDto) {
    return this.service.fetchPackages(dto);
  }
}
