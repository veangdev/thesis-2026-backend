import { ApiProperty } from '@nestjs/swagger';
import { CohortStatus } from '../../../common/enums';

/**
 * Public representation of a cohort.
 *
 * `studentCount` is derived from the membership join rather than stored, so it
 * cannot drift from the actual enrolment.
 */
export class CohortResponseDto {
  @ApiProperty({ example: 'clx0a1b2c3d4e5f6g7h8i9j0' })
  id: string;

  @ApiProperty({ example: 'Batch 2026 — Software Engineering' })
  name: string;

  @ApiProperty({
    example: 'Full-stack track. Two-year programme on a 5-point scale.',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startDate: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  expectedEndDate: Date;

  @ApiProperty({ enum: [5, 10], example: 5 })
  scoringScaleMax: number;

  @ApiProperty({ enum: CohortStatus, example: CohortStatus.active })
  status: CohortStatus;

  @ApiProperty({
    example: 10,
    description: 'Enrolled members, counted from the membership join',
  })
  studentCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
