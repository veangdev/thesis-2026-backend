import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNumberString,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'coordinator@pnc.edu',
    description: 'Email of the account being reset',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'The 6-digit code emailed by /auth/forgot-password',
  })
  @IsNumberString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({
    example: 'Password123!',
    minLength: 8,
    description: 'The new password (at least 8 characters)',
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
