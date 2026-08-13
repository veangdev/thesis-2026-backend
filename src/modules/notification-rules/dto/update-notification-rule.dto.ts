import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificationRuleDto {
  @ApiProperty({
    example: true,
    description: 'Whether the program sends this notification',
  })
  @IsBoolean()
  enabled: boolean;
}
