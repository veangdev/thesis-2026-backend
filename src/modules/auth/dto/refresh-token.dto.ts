import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'A valid, non-revoked refresh token previously issued by the API',
  })
  @IsJWT()
  @IsNotEmpty()
  refreshToken: string;
}
