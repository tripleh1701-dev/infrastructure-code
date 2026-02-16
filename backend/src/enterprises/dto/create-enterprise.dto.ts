import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsOptional()
  products?: string[];

  @IsArray()
  @IsOptional()
  services?: string[];
}
