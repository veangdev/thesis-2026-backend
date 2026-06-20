import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@pnc.edu.kh',
    description: 'Registered email address',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Admin@1234',
    minLength: 8,
    description: 'Account password',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
