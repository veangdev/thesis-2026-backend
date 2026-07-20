import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'The password currently on the account' })
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @ApiProperty({
    example: 'NewPassword123!',
    minLength: 8,
    description: 'The new password (at least 8 characters)',
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
