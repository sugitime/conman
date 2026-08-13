import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_DEPARTMENT_FEATURES,
  DepartmentFeature,
} from "../common/permissions";
import { AuthUser } from "../common/decorators";

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthUser, conferenceId?: string | null) {
    const confFilter = conferenceId
      ? { conferenceId }
      : user.conferenceId
        ? { conferenceId: user.conferenceId }
        : {};

    if (user.role === "CON_MANAGER") {
      return this.prisma.department.findMany({
        where: confFilter,
        orderBy: { name: "asc" },
        include: {
          _count: { select: { members: true } },
        },
      });
    }
    return this.prisma.department.findMany({
      where: {
        ...confFilter,
        id: { in: user.departmentIds },
      },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true } },
      },
    });
  }

  async get(id: string, user: AuthUser) {
    this.assertCanView(user, id);
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                title: true,
              },
            },
          },
        },
      },
    });
    if (!dept) throw new NotFoundException();
    return {
      ...dept,
      features: {
        ...DEFAULT_DEPARTMENT_FEATURES,
        ...((dept.features as Record<string, boolean>) || {}),
      },
    };
  }

  create(
    data: {
      name: string;
      description?: string;
      color?: string;
      isOrderingDept?: boolean;
      helpdeskQueueAccess?: boolean;
      features?: Record<string, boolean>;
    },
    conferenceId?: string | null,
  ) {
    const cid = conferenceId;
    if (!cid) {
      throw new BadRequestException(
        "Select a conference (X-Conference-Id) before creating departments",
      );
    }
    return this.prisma.department.create({
      data: {
        conferenceId: cid,
        name: data.name,
        description: data.description,
        color: data.color,
        isOrderingDept: data.isOrderingDept ?? false,
        helpdeskQueueAccess: data.helpdeskQueueAccess ?? false,
        features: {
          ...DEFAULT_DEPARTMENT_FEATURES,
          ...(data.features || {}),
        },
      },
    });
  }

  async update(
    id: string,
    user: AuthUser,
    data: Partial<{
      name: string;
      description: string;
      color: string;
      isOrderingDept: boolean;
      helpdeskQueueAccess: boolean;
      features: Record<string, boolean>;
      isActive: boolean;
    }>,
  ) {
    this.assertCanManage(user, id);
    const current = await this.prisma.department.findUnique({ where: { id } });
    if (!current) throw new NotFoundException();

    // Leads can only toggle a subset of department features
    if (user.role !== "CON_MANAGER") {
      delete (data as { isOrderingDept?: boolean }).isOrderingDept;
      delete (data as { helpdeskQueueAccess?: boolean }).helpdeskQueueAccess;
      delete (data as { name?: string }).name;
    }

    const features = data.features
      ? {
          ...DEFAULT_DEPARTMENT_FEATURES,
          ...((current.features as object) || {}),
          ...data.features,
        }
      : undefined;

    return this.prisma.department.update({
      where: { id },
      data: {
        ...data,
        ...(features ? { features } : {}),
      },
    });
  }

  async addMember(
    departmentId: string,
    user: AuthUser,
    memberUserId: string,
    isLead = false,
  ) {
    this.assertCanManage(user, departmentId);
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) throw new NotFoundException();

    // Keep conference membership in sync
    await this.prisma.conferenceMember.upsert({
      where: {
        conferenceId_userId: {
          conferenceId: dept.conferenceId,
          userId: memberUserId,
        },
      },
      create: {
        conferenceId: dept.conferenceId,
        userId: memberUserId,
        role: isLead ? "DEPARTMENT_LEAD" : "VOLUNTEER",
      },
      update: {},
    });

    return this.prisma.departmentMember.upsert({
      where: {
        departmentId_userId: { departmentId, userId: memberUserId },
      },
      create: { departmentId, userId: memberUserId, isLead },
      update: { isLead },
    });
  }

  async removeMember(
    departmentId: string,
    user: AuthUser,
    memberUserId: string,
  ) {
    this.assertCanManage(user, departmentId);
    return this.prisma.departmentMember.delete({
      where: {
        departmentId_userId: { departmentId, userId: memberUserId },
      },
    });
  }

  helpdeskDepartments(conferenceId?: string | null) {
    return this.prisma.department.findMany({
      where: {
        helpdeskQueueAccess: true,
        isActive: true,
        ...(conferenceId ? { conferenceId } : {}),
      },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    });
  }

  orderingDepartments(conferenceId?: string | null) {
    return this.prisma.department.findMany({
      where: {
        isOrderingDept: true,
        isActive: true,
        ...(conferenceId ? { conferenceId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  isFeatureEnabled(
    features: unknown,
    key: DepartmentFeature,
  ): boolean {
    const map = {
      ...DEFAULT_DEPARTMENT_FEATURES,
      ...((features as Record<string, boolean>) || {}),
    };
    return map[key] !== false;
  }

  private assertCanView(user: AuthUser, departmentId: string) {
    if (user.role === "CON_MANAGER") return;
    if (!user.departmentIds.includes(departmentId)) {
      throw new ForbiddenException("Not a member of this department");
    }
  }

  private assertCanManage(user: AuthUser, departmentId: string) {
    if (user.role === "CON_MANAGER") return;
    if (!user.leadDepartmentIds.includes(departmentId)) {
      throw new ForbiddenException("Not a lead of this department");
    }
  }
}
