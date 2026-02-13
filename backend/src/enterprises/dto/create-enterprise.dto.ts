import { IsString, IsNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

export class CreateEnterpriseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  products?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  services?: string[];
}
