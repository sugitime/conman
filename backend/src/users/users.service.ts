import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { SystemRole } from "@prisma/client";
import { AuthUser } from "../common/decorators";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        phone: true,
        title: true,
        createdAt: true,
        departmentMembers: {
          include: { department: { select: { id: true, name: true } } },
        },
        policyAssignments: {
          include: { policy: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        departmentMembers: { include: { department: true } },
        policyAssignments: { include: { policy: true } },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async create(data: {
    email: string;
    name: string;
    password: string;
    role: SystemRole;
    departmentIds?: string[];
    leadDepartmentIds?: string[];
    policyIds?: string[];
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash,
        role: data.role,
        departmentMembers: data.departmentIds?.length
          ? {
              create: data.departmentIds.map((departmentId) => ({
                departmentId,
                isLead: data.leadDepartmentIds?.includes(departmentId) ?? false,
              })),
            }
          : undefined,
        policyAssignments: data.policyIds?.length
          ? {
              create: data.policyIds.map((policyId) => ({ policyId })),
            }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      role: SystemRole;
      isActive: boolean;
      phone: string;
      title: string;
      password: string;
      policyIds: string[];
    }>,
  ) {
    if (data.password) {
      data = {
        ...data,
        password: await bcrypt.hash(data.password, 10),
      };
    }
    const { password, policyIds, ...rest } = data as {
      password?: string;
      policyIds?: string[];
      name?: string;
      role?: SystemRole;
      isActive?: boolean;
      phone?: string;
      title?: string;
    };

    if (policyIds) {
      await this.prisma.accessPolicyAssignment.deleteMany({
        where: { userId: id },
      });
      if (policyIds.length) {
        await this.prisma.accessPolicyAssignment.createMany({
          data: policyIds.map((policyId) => ({ userId: id, policyId })),
        });
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(password ? { passwordHash: password } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        phone: true,
        title: true,
      },
    });
  }

  async invite(
    actor: AuthUser,
    data: {
      email: string;
      role: SystemRole;
      departmentId?: string;
    },
  ) {
    if (actor.role !== "CON_MANAGER") {
      if (actor.role !== "DEPARTMENT_LEAD") {
        throw new ForbiddenException();
      }
      if (
        !data.departmentId ||
        !actor.leadDepartmentIds.includes(data.departmentId)
      ) {
        throw new ForbiddenException("Can only invite to your departments");
      }
      if (
        data.role !== SystemRole.VOLUNTEER &&
        data.role !== SystemRole.GUEST
      ) {
        throw new BadRequestException(
          "Leads may only invite volunteers or guests",
        );
      }
    }
    return this.auth.createInvite({
      email: data.email,
      role: data.role,
      departmentId: data.departmentId,
      invitedById: actor.id,
    });
  }
}
