import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsNumber,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateLicenseDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

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
