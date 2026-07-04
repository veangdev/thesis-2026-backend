import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreatePeriodDto {
  @ApiProperty({ example: 'Cycle 2 — Mid-Year' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-06-30T00:00:00.000Z' })
  @IsDateString()
  endDate: string;
}
