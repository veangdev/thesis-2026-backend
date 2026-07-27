import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { AssessmentPeriodStatus } from '../../../common/enums';

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

  @ApiPropertyOptional({
    enum: AssessmentPeriodStatus,
    default: AssessmentPeriodStatus.upcoming,
    description:
      'Creating a period directly as `active` launches the cycle immediately, generating draft assessments — the same effect as creating it `upcoming` and then opening it.',
  })
  @IsEnum(AssessmentPeriodStatus)
  @IsOptional()
  status?: AssessmentPeriodStatus;
}
