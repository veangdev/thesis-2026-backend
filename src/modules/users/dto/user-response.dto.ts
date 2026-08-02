import { ApiProperty } from '@nestjs/swagger';
import { Gender, Role, StudentClass } from '../../../common/enums';

/** Public representation of a user — never includes the password hash. */
export class UserResponseDto {
  @ApiProperty({ example: 'clx0a1b2c3d4e5f6g7h8i9j0' })
  id: string;

  @ApiProperty({ example: 'Jane Student' })
  name: string;

  @ApiProperty({ example: 'jane@pnc.edu' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.self_assessor })
  role: Role;

  @ApiProperty({ example: null, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ type: [String], example: [] })
  expertiseTags: string[];

  @ApiProperty({
    type: [String],
    example: ['2026-07-21'],
    description: 'Facilitator coaching availability, as YYYY-MM-DD',
  })
  availability: string[];

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ enum: Gender, nullable: true, example: Gender.female })
  gender: Gender | null;

  @ApiProperty({
    enum: StudentClass,
    nullable: true,
    example: StudentClass.A,
    description: 'Class within the cohort/batch (self-assessors only)',
  })
  studentClass: StudentClass | null;

  @ApiProperty({
    example: '2024-ID-05',
    nullable: true,
    description: 'Institution-issued student ID (self-assessors only)',
  })
  studentCode: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({
    example: 'clx0a1b2c3d4e5f6g7h8i9j0',
    nullable: true,
    description: "The user's cohort, resolved from their membership",
  })
  cohortId: string | null;

  @ApiProperty({
    example: 'Batch 2025',
    nullable: true,
    description: 'Name of the cohort in `cohortId`',
  })
  cohortName: string | null;

  @ApiProperty({
    example: 'clx0a1b2c3d4e5f6g7h8i9j0',
    nullable: true,
    description:
      "The self-assessor's assigned facilitator, resolved from their active mentor assignment",
  })
  facilitatorId: string | null;

  @ApiProperty({
    example: 'Sokha Meas',
    nullable: true,
    description: 'Name of the facilitator in `facilitatorId`',
  })
  facilitatorName: string | null;
}
