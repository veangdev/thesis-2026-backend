import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AssessmentPeriodStatus } from '../../../common/enums';
import { CreatePeriodDto } from './create-period.dto';

export class UpdatePeriodDto extends PartialType(CreatePeriodDto) {
  @ApiPropertyOptional({
    enum: AssessmentPeriodStatus,
    description:
      'Set to `open` to launch the cycle (generates draft assessments) or `closed` to end it',
  })
  @IsEnum(AssessmentPeriodStatus)
  @IsOptional()
  status?: AssessmentPeriodStatus;
}
