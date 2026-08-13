import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { LoadPhase, LoadTaskStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/decorators";

@Injectable()
export class LoadScheduleService {
  constructor(private prisma: PrismaService) {}

  private canManageDept(user: AuthUser, departmentId: string) {
    if (user.role === "CON_MANAGER") return true;
    if (user.permissions.includes("load_schedule.view_all")) return true;
    return (
      user.leadDepartmentIds.includes(departmentId) ||
      user.departmentIds.includes(departmentId)
    );
  }

  private assertCanManageDept(user: AuthUser, departmentId: string) {
    if (user.role === "CON_MANAGER") return;
    if (
      user.leadDepartmentIds.includes(departmentId) ||
      (user.permissions.includes("load_schedule.manage") &&
        user.departmentIds.includes(departmentId))
    ) {
      return;
    }
    throw new ForbiddenException(
      "Not allowed to manage load schedule for this department",
    );
  }

  list(
    user: AuthUser,
    opts: {
      departmentId?: string;
      phase?: LoadPhase;
      from?: string;
      to?: string;
      conferenceId?: string | null;
    },
  ) {
    const where: Prisma.LoadScheduleTaskWhereInput = {};
    if (opts.phase) where.phase = opts.phase;
    if (opts.departmentId) {
      if (!this.canManageDept(user, opts.departmentId) && user.role !== "CON_MANAGER") {
        throw new ForbiddenException();
      }
      where.departmentId = opts.departmentId;
    } else if (user.role !== "CON_MANAGER" && !user.permissions.includes("load_schedule.view_all")) {
      where.departmentId = { in: user.departmentIds };
    }
    if (opts.conferenceId) {
      where.department = { conferenceId: opts.conferenceId };
    }
    if (opts.from || opts.to) {
      where.AND = [
        opts.to ? { startsAt: { lte: new Date(opts.to) } } : {},
        opts.from ? { endsAt: { gte: new Date(opts.from) } } : {},
      ];
    }

    return this.prisma.loadScheduleTask.findMany({
      where,
      orderBy: [{ startsAt: "asc" }, { sortOrder: "asc" }],
      include: {
        department: {
          select: { id: true, name: true, color: true },
        },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  }

  /** Full gantt payload for Con Manager overview */
  async gantt(
    user: AuthUser,
    opts: {
      phase?: LoadPhase;
      from?: string;
      to?: string;
      conferenceId?: string | null;
    },
  ) {
    if (
      user.role !== "CON_MANAGER" &&
      !user.permissions.includes("load_schedule.view_all")
    ) {
      throw new ForbiddenException("Gantt overview requires Con Manager access");
    }

    const tasks = await this.list(user, {
      phase: opts.phase,
      from: opts.from,
      to: opts.to,
      conferenceId: opts.conferenceId,
    });

    const byDept = new Map<
      string,
      {
        departmentId: string;
        departmentName: string;
        color: string;
        tasks: typeof tasks;
      }
    >();

    for (const t of tasks) {
      const key = t.departmentId;
      if (!byDept.has(key)) {
        byDept.set(key, {
          departmentId: t.department.id,
          departmentName: t.department.name,
          color: t.department.color,
          tasks: [],
        });
      }
      byDept.get(key)!.tasks.push(t);
    }

    const rows = Array.from(byDept.values()).sort((a, b) =>
      a.departmentName.localeCompare(b.departmentName),
    );

    let minStart: Date | null = null;
    let maxEnd: Date | null = null;
    for (const t of tasks) {
      const s = new Date(t.startsAt);
      const e = new Date(t.endsAt);
      if (!minStart || s < minStart) minStart = s;
      if (!maxEnd || e > maxEnd) maxEnd = e;
    }

    return {
      phase: opts.phase ?? null,
      rangeStart: minStart?.toISOString() ?? null,
      rangeEnd: maxEnd?.toISOString() ?? null,
      taskCount: tasks.length,
      rows,
      tasks,
    };
  }

  async get(id: string, user: AuthUser) {
    const task = await this.prisma.loadScheduleTask.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    if (!task) throw new NotFoundException("Task not found");
    if (!this.canManageDept(user, task.departmentId) && user.role !== "CON_MANAGER") {
      throw new ForbiddenException();
    }
    return task;
  }

  create(
    user: AuthUser,
    data: {
      departmentId: string;
      phase: LoadPhase;
      title: string;
      description?: string;
      location?: string;
      startsAt: string;
      endsAt: string;
      status?: LoadTaskStatus;
      assigneeId?: string;
      sortOrder?: number;
    },
  ) {
    this.assertCanManageDept(user, data.departmentId);
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (!(endsAt > startsAt)) {
      throw new BadRequestException("endsAt must be after startsAt");
    }
    return this.prisma.loadScheduleTask.create({
      data: {
        departmentId: data.departmentId,
        phase: data.phase,
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt,
        endsAt,
        status: data.status || LoadTaskStatus.PLANNED,
        assigneeId: data.assigneeId,
        sortOrder: data.sortOrder ?? 0,
        createdById: user.id,
      },
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  }

  async update(
    id: string,
    user: AuthUser,
    data: Partial<{
      title: string;
      description: string | null;
      location: string | null;
      startsAt: string;
      endsAt: string;
      status: LoadTaskStatus;
      phase: LoadPhase;
      assigneeId: string | null;
      sortOrder: number;
      departmentId: string;
    }>,
  ) {
    const existing = await this.prisma.loadScheduleTask.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Task not found");
    this.assertCanManageDept(user, existing.departmentId);
    if (data.departmentId && data.departmentId !== existing.departmentId) {
      this.assertCanManageDept(user, data.departmentId);
    }

    const startsAt = data.startsAt
      ? new Date(data.startsAt)
      : existing.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : existing.endsAt;
    if (!(endsAt > startsAt)) {
      throw new BadRequestException("endsAt must be after startsAt");
    }

    return this.prisma.loadScheduleTask.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt: data.startsAt ? startsAt : undefined,
        endsAt: data.endsAt ? endsAt : undefined,
        status: data.status,
        phase: data.phase,
        assigneeId: data.assigneeId,
        sortOrder: data.sortOrder,
        departmentId: data.departmentId,
      },
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.prisma.loadScheduleTask.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Task not found");
    this.assertCanManageDept(user, existing.departmentId);
    await this.prisma.loadScheduleTask.delete({ where: { id } });
    return { ok: true };
  }
}
