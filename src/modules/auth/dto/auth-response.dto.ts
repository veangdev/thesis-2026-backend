import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT used to authorize API requests',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Long-lived JWT used to obtain a new access token',
  })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}
