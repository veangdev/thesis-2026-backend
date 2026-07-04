import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Facilitator (mentor) user id' })
  @IsString()
  @IsNotEmpty()
  facilitatorId: string;

  @ApiProperty({ description: 'Self-assessor (student) user id' })
  @IsString()
  @IsNotEmpty()
  selfAssessorId: string;

  @ApiProperty({ description: 'Cohort the assignment belongs to' })
  @IsString()
  @IsNotEmpty()
  cohortId: string;
}
