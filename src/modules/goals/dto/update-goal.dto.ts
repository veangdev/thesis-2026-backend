import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateGoalDto } from './create-goal.dto';

/** Any goal field may be updated except the owning student. */
export class UpdateGoalDto extends PartialType(
  OmitType(CreateGoalDto, ['studentId'] as const),
) {}
