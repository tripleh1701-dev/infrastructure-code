import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsOptional()
  enterpriseId?: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsOptional()
  middleName?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  assignedRole: string;

  @IsString()
  @IsOptional()
  assignedGroup?: string; // Legacy: Primary group name (for backward compatibility)

  @IsArray()
  @IsOptional()
  groupIds?: string[]; // New: Array of group IDs for multi-group assignment

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  isTechnicalUser?: boolean;

  @IsArray()
  @IsOptional()
  workstreamIds?: string[];

  /** Human-readable account name for notification emails (not persisted) */
  @IsString()
  @IsOptional()
  accountName?: string;
}
