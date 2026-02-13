import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateLicenseDto {
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @IsUUID()
  @IsNotEmpty()
  enterpriseId: string;

  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsUUID()
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
