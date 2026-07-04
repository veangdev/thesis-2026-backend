import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'The reset token issued by /auth/forgot-password',
  })
  @IsJWT()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: 'Password123!',
    minLength: 8,
    description: 'The new password (at least 8 characters)',
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
