import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEmail,
  IsDateString,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddressDto {
  @IsString()
  @IsNotEmpty()
  line1: string;

  @IsString()
  @IsOptional()
  line2?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  country: string;
}

export class TechnicalUserDto {
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
  @IsNotEmpty()
  assignedGroup: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class LicenseDto {
  @IsString()
  @IsNotEmpty()
  enterpriseId: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  numberOfUsers?: number;

  @IsBoolean()
  @IsOptional()
  renewalNotify?: boolean;

  @IsNumber()
  @Min(1)
  @IsOptional()
  noticeDays?: number;

  @IsString()
  @IsNotEmpty()
  contactFullName: string;

  @IsEmail()
  @IsNotEmpty()
  contactEmail: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  contactDepartment?: string;

  @IsString()
  @IsOptional()
  contactDesignation?: string;
}

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  masterAccountName: string;

  @IsEnum(['public', 'private', 'hybrid'])
  cloudType: 'public' | 'private' | 'hybrid';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  @IsOptional()
  addresses?: AddressDto[];

  @ValidateNested()
  @Type(() => TechnicalUserDto)
  @IsOptional()
  technicalUser?: TechnicalUserDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LicenseDto)
  @IsOptional()
  licenses?: LicenseDto[];
}
