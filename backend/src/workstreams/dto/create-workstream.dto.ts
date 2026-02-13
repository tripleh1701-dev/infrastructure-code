import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkstreamToolDto {
  @IsString()
  @IsNotEmpty()
  toolName: string;

  @IsString()
  @IsNotEmpty()
  category: string;
}

export class CreateWorkstreamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @IsUUID()
  @IsNotEmpty()
  enterpriseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkstreamToolDto)
  @IsOptional()
  tools?: WorkstreamToolDto[];
}
