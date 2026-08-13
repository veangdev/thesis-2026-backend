import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Gender, Role, StudentClass } from '../../../common/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'Jane Student' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'jane@pnc.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: Role, default: Role.self_assessor })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Cohort to enrol the user into' })
  @IsString()
  @IsOptional()
  cohortId?: string;

  @ApiPropertyOptional({ enum: Gender, description: 'Self-reported gender' })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({
    enum: StudentClass,
    description: 'Class within the cohort/batch (self-assessors only)',
  })
  @IsEnum(StudentClass)
  @IsOptional()
  studentClass?: StudentClass;

  @ApiPropertyOptional({
    example: '2024-ID-05',
    description:
      'Institution-issued student ID (self-assessors only). Unique across users.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @IsOptional()
  studentCode?: string;
}
