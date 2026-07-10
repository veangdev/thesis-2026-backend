import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificationRuleDto {
  @ApiProperty({
    example: true,
    description: 'Whether the notification rule is enabled',
  })
  @IsBoolean()
  enabled: boolean;
}
