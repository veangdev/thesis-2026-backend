import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Facilitator user id' })
  @IsString()
  @IsNotEmpty()
  facilitatorId: string;

  @ApiProperty({ description: 'Self-assessor user id' })
  @IsString()
  @IsNotEmpty()
  selfAssessorId: string;

  @ApiPropertyOptional({
    description:
      "Cohort the assignment belongs to. Defaults to the student's cohort when omitted.",
  })
  @IsString()
  @IsOptional()
  cohortId?: string;
}
