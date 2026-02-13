import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAccountDto, AddressDto, TechnicalUserDto } from './create-account.dto';

export class UpdateAccountDto extends PartialType(CreateAccountDto) {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  masterAccountName?: string;

  // Note: cloudType cannot be changed after creation (enforced in service)
  // Removed from update DTO to prevent confusion

  @IsString()
  @IsOptional()
  status?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  @IsOptional()
  addresses?: AddressDto[];

  @ValidateNested()
  @Type(() => TechnicalUserDto)
  @IsOptional()
  technicalUser?: TechnicalUserDto;
}
