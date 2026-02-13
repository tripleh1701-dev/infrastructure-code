import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';

export class CreateUserDto {
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @IsUUID()
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
  @IsUUID('4', { each: true })
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
  @IsUUID('4', { each: true })
  @IsOptional()
  workstreamIds?: string[];

  /** Human-readable account name for notification emails (not persisted) */
  @IsString()
  @IsOptional()
  accountName?: string;
}
