import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/enums';

/** Public representation of a user — never includes the password hash. */
export class UserResponseDto {
  @ApiProperty({ example: 'clx0a1b2c3d4e5f6g7h8i9j0' })
  id: string;

  @ApiProperty({ example: 'Jane Student' })
  name: string;

  @ApiProperty({ example: 'jane@pnc.edu' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.self_assessor })
  role: Role;

  @ApiProperty({ example: null, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ type: [String], example: [] })
  expertiseTags: string[];

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
