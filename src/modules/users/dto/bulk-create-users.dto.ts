import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class BulkCreateUsersDto {
  @ApiProperty({ type: [CreateUserDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  users: CreateUserDto[];

  @ApiPropertyOptional({
    description: 'Optionally add every created user to this cohort',
  })
  @IsString()
  @IsOptional()
  cohortId?: string;
}
