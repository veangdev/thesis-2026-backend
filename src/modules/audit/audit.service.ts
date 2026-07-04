import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import {
  Paginated,
  PaginationQueryDto,
  paginate,
} from '../../common/dto/pagination.dto';
import { AuditLog, Prisma } from '../../../generated/prisma/client';

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

  async findAll(pagination: PaginationQueryDto): Promise<Paginated<AuditLog>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const [data, total] = await Promise.all([
      this.auditRepository.findAll({
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.auditRepository.count(),
    ]);
    return paginate(data, total, page, pageSize);
  }
}
