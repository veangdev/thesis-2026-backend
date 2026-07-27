import { ApiProperty } from '@nestjs/swagger';

/** A notification rule: its catalogue definition plus its current state. */
export class NotificationRuleResponseDto {
  @ApiProperty({ example: 'weekly-digest' })
  key: string;

  @ApiProperty({ example: 'Weekly completion digest' })
  label: string;

  @ApiProperty({
    example: 'Email coordinators a completion summary every Monday.',
  })
  description: string;

  @ApiProperty({ example: false })
  enabled: boolean;
}
