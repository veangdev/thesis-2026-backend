import { Injectable, Logger } from '@nestjs/common';
import { AuditLogWithActor, AuditRepository } from './audit.repository';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Paginated, paginate } from '../../common/dto/pagination.dto';
import { Prisma } from '../../../generated/prisma/client';

export interface AuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * Records an admin mutation. Never throws into the caller — an audit failure
   * must not fail the underlying operation.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.auditRepository.create(entry);
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${entry.action} ${entry.entity}:${entry.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll(query: AuditQueryDto): Promise<Paginated<AuditLogWithActor>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildWhere(query);
    const [data, total] = await Promise.all([
      this.auditRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      this.auditRepository.count(where),
    ]);
    return paginate(data, total, page, pageSize);
  }

  private buildWhere(query: AuditQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.entity) where.entity = query.entity;
    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { entity: { contains: query.search, mode: 'insensitive' } },
        { actor: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }
}
