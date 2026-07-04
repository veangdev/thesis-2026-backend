import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateActionItemDto {
  @ApiProperty({ example: 'Rehearse the opening two minutes' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;
}

export class UpdateActionItemDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  done?: boolean;
}
