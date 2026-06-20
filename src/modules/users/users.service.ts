import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedUser } from '../../common/interfaces';
import { User } from '../../../generated/prisma/client';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto): Promise<AuthenticatedUser> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersRepository.create({ ...dto, password });
    return this.sanitize(user);
  }

  async findAll(): Promise<AuthenticatedUser[]> {
    const users = await this.usersRepository.findAll();
    return users.map((user) => this.sanitize(user));
  }

  async findOne(id: string): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.sanitize(user);
  }

  /**
   * Returns the full user record including the password hash.
   * For internal use by the auth layer only — never expose this to HTTP.
   */
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto): Promise<AuthenticatedUser> {
    await this.findOne(id);
    const user = await this.usersRepository.update(id, dto);
    return this.sanitize(user);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.usersRepository.delete(id);
  }

  /** Strips the password hash so it can never leak through a response. */
  private sanitize(user: User): AuthenticatedUser {
    const { password: _password, ...safe } = user;
    void _password;
    return safe;
  }
}
