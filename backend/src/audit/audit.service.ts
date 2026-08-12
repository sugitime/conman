import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(opts: {
    actorId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    meta?: Prisma.InputJsonValue;
    ip?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorId: opts.actorId,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        meta: opts.meta,
        ip: opts.ip,
      },
    });
  }

  list(limit = 100) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
