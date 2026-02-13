import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateWorkstreamDto } from './create-workstream.dto';

export class UpdateWorkstreamDto extends PartialType(
  OmitType(CreateWorkstreamDto, ['accountId', 'enterpriseId'] as const),
) {}
