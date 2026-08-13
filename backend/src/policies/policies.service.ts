import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PERMISSIONS } from "../common/permissions";

@Injectable()
export class PoliciesService {
  constructor(private prisma: PrismaService) {}

  list(conferenceId?: string | null) {
    return this.prisma.accessPolicy.findMany({
      where: conferenceId
        ? { OR: [{ conferenceId }, { conferenceId: null }] }
        : undefined,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { assignments: true } },
      },
    });
  }

  permissionCatalog() {
    return PERMISSIONS;
  }

  async get(id: string) {
    const policy = await this.prisma.accessPolicy.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!policy) throw new NotFoundException();
    return policy;
  }

  create(
    data: {
      name: string;
      description?: string;
      permissions: string[];
    },
    conferenceId?: string | null,
  ) {
    return this.prisma.accessPolicy.create({
      data: {
        ...data,
        conferenceId: conferenceId || null,
      },
    });
  }

  update(
    id: string,
    data: Partial<{ name: string; description: string; permissions: string[] }>,
  ) {
    return this.prisma.accessPolicy.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.accessPolicy.delete({ where: { id } });
  }

  assign(policyId: string, userId: string) {
    return this.prisma.accessPolicyAssignment.upsert({
      where: { userId_policyId: { userId, policyId } },
      create: { userId, policyId },
      update: {},
    });
  }

  unassign(policyId: string, userId: string) {
    return this.prisma.accessPolicyAssignment.delete({
      where: { userId_policyId: { userId, policyId } },
    });
  }
}
