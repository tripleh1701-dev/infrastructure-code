import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateLicenseDto } from './create-license.dto';

// Omit accountId and enterpriseId as they shouldn't be changed after creation
export class UpdateLicenseDto extends PartialType(
  OmitType(CreateLicenseDto, ['accountId', 'enterpriseId'] as const),
) {}
