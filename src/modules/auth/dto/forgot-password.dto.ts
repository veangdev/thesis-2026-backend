import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'coordinator@pnc.edu',
    description: 'Email of the account to send a reset token for',
  })
  @IsEmail()
  email: string;
}
