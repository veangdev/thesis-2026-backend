import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Fields a user may change on their **own** profile. Deliberately narrow —
 * role, email and cohort stay under coordinator control.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Jane Student' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Facilitator expertise tags (ignored for other roles)',
  })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  @IsOptional()
  expertiseTags?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['2026-07-21', '2026-07-22'],
    description:
      'Days this facilitator is available to coach, as YYYY-MM-DD (ignored for other roles)',
  })
  @IsArray()
  @ArrayMaxSize(366)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    each: true,
    message: 'each availability entry must be a YYYY-MM-DD date',
  })
  @IsOptional()
  availability?: string[];
}
