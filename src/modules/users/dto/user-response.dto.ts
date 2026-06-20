import { ApiProperty } from '@nestjs/swagger';
import { Role, Status } from '../../../common/enums';

/** Public representation of a user — never includes the password hash. */
export class UserResponseDto {
  @ApiProperty({ example: 'clx0a1b2c3d4e5f6g7h8i9j0' })
  id: string;

  @ApiProperty({ example: 'Jane Student' })
  name: string;

  @ApiProperty({ example: 'jane@pnc.edu.kh' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.STUDENT })
  role: Role;

  @ApiProperty({ enum: Status, example: Status.ACTIVE })
  status: Status;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
