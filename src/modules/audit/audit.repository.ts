import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLog, Prisma } from '../../../generated/prisma/client';

/**
 * The actor relation the API flattens onto `actorName`. Previously included as
 * an inline literal, which left the returned rows typed as bare `AuditLog` —
 * so the joined actor was present at runtime but invisible to the type system.
 */
const WITH_ACTOR = {
  actor: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogInclude;

export type AuditLogWithActor = Prisma.AuditLogGetPayload<{
  include: typeof WITH_ACTOR;
}>;

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AuditLogUncheckedCreateInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data });
  }

  findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.AuditLogWhereInput;
  }): Promise<AuditLogWithActor[]> {
    return this.prisma.auditLog.findMany({
      where: params?.where,
      include: WITH_ACTOR,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take,
    });
  }

  count(where?: Prisma.AuditLogWhereInput): Promise<number> {
    return this.prisma.auditLog.count({ where });
  }
}
