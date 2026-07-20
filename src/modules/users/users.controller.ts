import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { uploadsDir } from '../../config/configuration';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { BulkCreateUsersDto } from './dto/bulk-create-users.dto';
import { Paginated } from '../../common/dto/pagination.dto';

/**
 * Avatars live in an `avatars/` subdirectory of the configured upload root,
 * so the whole tree can be relocated with UPLOAD_DIR alone.
 */
const AVATAR_DIR = join(uploadsDir(), 'avatars');
/** Stored relative to the upload root; the public prefix is applied on read. */
const AVATAR_RELATIVE_DIR = 'avatars';
if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
/**
 * Allowed upload types mapped to the extension we will store them under.
 * The extension is taken from this map rather than from the client's
 * `originalname`: that value is attacker-controlled, so deriving from it lets
 * a caller declare `image/png` while naming the file `x.html` and have the
 * API serve attacker-authored HTML from its own origin.
 */
const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const ALLOWED_AVATAR_TYPES = Object.keys(AVATAR_EXTENSIONS);

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Insufficient role' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a user (Program Coordinator only)' })
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Post('bulk')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Bulk-create users, optionally assigning them to a cohort',
  })
  @ApiCreatedResponse({ type: UserResponseDto, isArray: true })
  createMany(@Body() dto: BulkCreateUsersDto): Promise<UserResponseDto[]> {
    return this.usersService.createMany(dto);
  }

  @Get()
  @Roles(Role.program_coordinator, Role.facilitator)
  @ApiOperation({ summary: 'List users (Program Coordinator, Facilitator)' })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  findAll(@Query() query: UserQueryDto): Promise<Paginated<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  // ─── Self-service ("me") routes — must precede the `:id` routes so that
  // "me" is never matched as a user id. Any signed-in role may use them.

  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile (name, expertise tags)' })
  @ApiOkResponse({ type: UserResponseDto })
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateMe(userId, dto);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: 'Upload your own profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AVATAR_DIR,
        filename: (_req, file, callback) =>
          callback(null, `${randomUUID()}${AVATAR_EXTENSIONS[file.mimetype]}`),
      }),
      limits: { fileSize: MAX_AVATAR_BYTES },
      fileFilter: (_req, file, callback) =>
        ALLOWED_AVATAR_TYPES.includes(file.mimetype)
          ? callback(null, true)
          : callback(
              new BadRequestException(
                'Avatar must be a PNG, JPEG or WebP image',
              ),
              false,
            ),
    }),
  )
  uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UserResponseDto> {
    if (!file) throw new BadRequestException('No image file was uploaded');
    return this.usersService.setAvatar(
      userId,
      `${AVATAR_RELATIVE_DIR}/${file.filename}`,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user by id' })
  @ApiOkResponse({ type: UserResponseDto })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    // Staff may read any user; a self-assessor only their own record.
    if (user.role === Role.self_assessor && user.id !== id) {
      throw new ForbiddenException('Cannot access another user’s record');
    }
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.program_coordinator)
  @ApiOperation({ summary: 'Update a user (ADMIN only)' })
  @ApiOkResponse({ type: UserResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.program_coordinator)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (ADMIN only)' })
  @ApiNoContentResponse({ description: 'User deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
