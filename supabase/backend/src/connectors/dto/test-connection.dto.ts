import { IsString, IsOptional } from 'class-validator';

export class TestConnectionDto {
  @IsString() connector: string;
  @IsString() @IsOptional() url?: string;
  @IsString() @IsOptional() credentialId?: string;
  @IsString() @IsOptional() credentialName?: string;
  @IsString() @IsOptional() accountId?: string;
}
