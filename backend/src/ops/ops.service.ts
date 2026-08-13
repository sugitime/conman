import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/decorators";
import {
  OrderStatus,
  OverlayStatus,
  Prisma,
  TicketSeverity,
  TicketStatus,
  TodoPriority,
  TodoStatus,
  DocumentSource,
  LostFoundStatus,
  RoomBookingStatus,
} from "@prisma/client";
import { extname, join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class OpsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {}

  // ─── Todos ─────────────────────────────────────────────────────
  listTodos(user: AuthUser, departmentId?: string) {
    const where: Prisma.TodoWhereInput = {};
    if (user.role === "CON_MANAGER") {
      if (departmentId) where.departmentId = departmentId;
    } else {
      where.OR = [
        { assigneeId: user.id },
        { createdById: user.id },
        { departmentId: { in: user.departmentIds } },
      ];
      if (departmentId) where.departmentId = departmentId;
    }
    return this.prisma.todo.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  async getTodo(id: string, user: AuthUser) {
    const todo = await this.prisma.todo.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true, color: true } },
      },
    });
    if (!todo) throw new NotFoundException("Todo not found");
    this.assertCanViewTodo(user, todo);
    const [messages, activity] = await Promise.all([
      this.notifications.listComments("TODO", id),
      this.notifications.listActivity("TODO", id),
    ]);
    return { ...todo, messages, activity };
  }

  async createTodo(
    user: AuthUser,
    data: {
      title: string;
      description?: string;
      priority?: TodoPriority;
      dueAt?: string;
      departmentId?: string;
      assigneeId?: string;
    },
  ) {
    if (user.role !== "CON_MANAGER") {
      if (
        data.departmentId &&
        !user.leadDepartmentIds.includes(data.departmentId) &&
        !user.permissions.includes("todos.any")
      ) {
        if (data.assigneeId && data.assigneeId !== user.id) {
          throw new ForbiddenException();
        }
      }
    }
    const todo = await this.prisma.todo.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || TodoPriority.MEDIUM,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        departmentId: data.departmentId,
        assigneeId: data.assigneeId,
        createdById: user.id,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
    await this.notifications.logActivity({
      entityType: "TODO",
      entityId: todo.id,
      actorId: user.id,
      action: "created",
      summary: `${user.name} created todo “${todo.title}”`,
    });
    if (todo.assigneeId) {
      await this.notifications.notifyUsers({
        userIds: [todo.assigneeId],
        eventKey: "todo.assigned",
        title: "Todo assigned to you",
        body: todo.title,
        href: `/todos?open=${todo.id}`,
        entityType: "TODO",
        entityId: todo.id,
        skipUserId: user.id,
      });
    }
    return todo;
  }

  async updateTodo(
    id: string,
    user: AuthUser,
    data: Partial<{
      title: string;
      description: string;
      status: TodoStatus;
      priority: TodoPriority;
      dueAt: string | null;
      assigneeId: string | null;
      departmentId: string | null;
    }>,
  ) {
    const existing = await this.prisma.todo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Todo not found");
    this.assertCanViewTodo(user, existing);

    const updated = await this.prisma.todo.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        dueAt:
          data.dueAt === null
            ? null
            : data.dueAt
              ? new Date(data.dueAt)
              : undefined,
        assigneeId: data.assigneeId,
        departmentId:
          data.departmentId === undefined ? undefined : data.departmentId,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    const changes = this.notifications.diffFields(
      existing as unknown as Record<string, unknown>,
      {
        ...existing,
        ...data,
        dueAt:
          data.dueAt === null
            ? null
            : data.dueAt
              ? new Date(data.dueAt)
              : existing.dueAt,
      } as unknown as Record<string, unknown>,
      ["title", "description", "status", "priority", "dueAt", "assigneeId", "departmentId"],
    );

    if (changes) {
      await this.notifications.logActivity({
        entityType: "TODO",
        entityId: id,
        actorId: user.id,
        action: changes.status ? "status_changed" : "updated",
        summary: `${user.name} updated todo “${updated.title}”`,
        changes,
      });

      const watchers = [existing.createdById, existing.assigneeId, updated.assigneeId].filter(
        Boolean,
      ) as string[];

      if (changes.assigneeId && updated.assigneeId) {
        await this.notifications.notifyUsers({
          userIds: [updated.assigneeId],
          eventKey: "todo.assigned",
          title: "Todo assigned to you",
          body: updated.title,
          href: `/todos?open=${id}`,
          entityType: "TODO",
          entityId: id,
          skipUserId: user.id,
        });
      }

      await this.notifications.notifyUsers({
        userIds: watchers,
        eventKey: "todo.updated",
        title: "Todo updated",
        body: `${user.name}: ${updated.title}`,
        href: `/todos?open=${id}`,
        entityType: "TODO",
        entityId: id,
        skipUserId: user.id,
      });
    }

    return updated;
  }

  async addTodoComment(id: string, user: AuthUser, body: string) {
    const todo = await this.prisma.todo.findUnique({ where: { id } });
    if (!todo) throw new NotFoundException("Todo not found");
    this.assertCanViewTodo(user, todo);
    if (!body?.trim()) throw new BadRequestException("Message required");

    const comment = await this.notifications.addComment({
      entityType: "TODO",
      entityId: id,
      authorId: user.id,
      body,
    });
    await this.notifications.logActivity({
      entityType: "TODO",
      entityId: id,
      actorId: user.id,
      action: "commented",
      summary: `${user.name} left a message`,
    });
    await this.notifications.notifyUsers({
      userIds: [todo.createdById, todo.assigneeId].filter(Boolean) as string[],
      eventKey: "todo.comment",
      title: "New message on todo",
      body: `${user.name}: ${body.slice(0, 140)}`,
      href: `/todos?open=${id}`,
      entityType: "TODO",
      entityId: id,
      skipUserId: user.id,
    });
    return comment;
  }

  private assertCanViewTodo(
    user: AuthUser,
    todo: { createdById: string; assigneeId: string | null; departmentId: string | null },
  ) {
    if (user.role === "CON_MANAGER" || user.permissions.includes("todos.any")) return;
    if (todo.createdById === user.id || todo.assigneeId === user.id) return;
    if (todo.departmentId && user.departmentIds.includes(todo.departmentId)) return;
    throw new ForbiddenException();
  }

  // ─── Communications ────────────────────────────────────────────
  listComms(user: AuthUser, departmentId?: string) {
    const where: Prisma.CommunicationWhereInput = {};
    if (user.role === "CON_MANAGER") {
      if (departmentId) where.departmentId = departmentId;
    } else {
      where.OR = [
        { authorId: user.id },
        { recipientIds: { has: user.id } },
        {
          AND: [
            { departmentId: { in: user.departmentIds } },
            { recipientIds: { isEmpty: true } },
          ],
        },
        { departmentId: null, recipientIds: { has: user.id } },
      ];
    }
    return this.prisma.communication.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: {
        author: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        reads: { where: { userId: user.id } },
      },
    });
  }

  createComm(
    user: AuthUser,
    data: {
      subject: string;
      body: string;
      departmentId?: string;
      recipientIds?: string[];
      targetRoles?: ("CON_MANAGER" | "DEPARTMENT_LEAD" | "VOLUNTEER" | "GUEST")[];
      priority?: "NORMAL" | "CRITICAL";
      requiresAck?: boolean;
      isPinned?: boolean;
    },
  ) {
    return this.prisma.communication.create({
      data: {
        subject: data.subject,
        body: data.body,
        departmentId: data.departmentId,
        recipientIds: data.recipientIds || [],
        targetRoles: data.targetRoles || [],
        priority: data.priority || "NORMAL",
        requiresAck: data.requiresAck ?? data.priority === "CRITICAL",
        isPinned: data.isPinned ?? false,
        authorId: user.id,
        channels: ["IN_APP"],
      },
    });
  }

  markCommRead(id: string, userId: string, acknowledge = false) {
    return this.prisma.communicationRead.upsert({
      where: {
        communicationId_userId: { communicationId: id, userId },
      },
      create: {
        communicationId: id,
        userId,
        acknowledgedAt: acknowledge ? new Date() : undefined,
      },
      update: {
        readAt: new Date(),
        acknowledgedAt: acknowledge ? new Date() : undefined,
      },
    });
  }

  // ─── Helpdesk ──────────────────────────────────────────────────
  async listTickets(
    user: AuthUser,
    opts?: { departmentId?: string; master?: boolean },
  ) {
    if (opts?.master) {
      if (user.role !== "CON_MANAGER" && !user.permissions.includes("helpdesk.master")) {
        throw new ForbiddenException();
      }
      return this.prisma.helpdeskTicket.findMany({
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        include: {
          department: { select: { id: true, name: true, color: true } },
          createdBy: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          _count: { select: { comments: true } },
        },
      });
    }
    const deptIds = opts?.departmentId
      ? [opts.departmentId]
      : user.role === "CON_MANAGER"
        ? undefined
        : user.departmentIds;
    return this.prisma.helpdeskTicket.findMany({
      where: deptIds ? { departmentId: { in: deptIds } } : undefined,
      orderBy: [{ status: "asc" }, { severity: "desc" }],
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });
  }

  async createTicket(
    user: AuthUser,
    data: {
      title: string;
      description: string;
      severity?: TicketSeverity;
      departmentId: string;
      isIncident?: boolean;
    },
  ) {
    const dept = await this.prisma.department.findUnique({
      where: { id: data.departmentId },
    });
    if (!dept?.helpdeskQueueAccess) {
      throw new BadRequestException(
        "Department does not accept helpdesk tickets",
      );
    }
    const ticket = await this.prisma.helpdeskTicket.create({
      data: {
        title: data.title,
        description: data.description,
        severity: data.severity || TicketSeverity.MEDIUM,
        departmentId: data.departmentId,
        createdById: user.id,
        isIncident: data.isIncident ?? false,
      },
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    await this.notifications.logActivity({
      entityType: "HELPDESK",
      entityId: ticket.id,
      actorId: user.id,
      action: "created",
      summary: `${user.name} opened ticket “${ticket.title}”`,
    });
    return ticket;
  }

  async updateTicket(
    id: string,
    user: AuthUser,
    data: Partial<{
      status: TicketStatus;
      severity: TicketSeverity;
      assigneeId: string | null;
      title: string;
      description: string;
    }>,
  ) {
    const existing = await this.prisma.helpdeskTicket.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Ticket not found");

    const updated = await this.prisma.helpdeskTicket.update({
      where: { id },
      data: {
        ...data,
        resolvedAt:
          data.status === "RESOLVED" || data.status === "CLOSED"
            ? new Date()
            : undefined,
      },
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    const changes = this.notifications.diffFields(
      existing as unknown as Record<string, unknown>,
      { ...existing, ...data } as unknown as Record<string, unknown>,
      ["title", "description", "status", "severity", "assigneeId"],
    );

    if (changes) {
      await this.notifications.logActivity({
        entityType: "HELPDESK",
        entityId: id,
        actorId: user.id,
        action: changes.status
          ? "status_changed"
          : changes.severity
            ? "severity_changed"
            : "updated",
        summary: `${user.name} updated ticket “${updated.title}”`,
        changes,
      });

      const watchers = [
        existing.createdById,
        existing.assigneeId,
        updated.assigneeId,
      ].filter(Boolean) as string[];

      if (changes.assigneeId && updated.assigneeId) {
        await this.notifications.notifyUsers({
          userIds: [updated.assigneeId],
          eventKey: "ticket.assigned",
          title: "Ticket assigned to you",
          body: updated.title,
          href: `/helpdesk?open=${id}`,
          entityType: "HELPDESK",
          entityId: id,
          skipUserId: user.id,
        });
      }

      if (changes.severity) {
        await this.notifications.notifyUsers({
          userIds: watchers,
          eventKey: "ticket.severity",
          title: "Ticket severity changed",
          body: `${updated.title}: ${String(changes.severity.from)} → ${String(changes.severity.to)}`,
          href: `/helpdesk?open=${id}`,
          entityType: "HELPDESK",
          entityId: id,
          skipUserId: user.id,
        });
      }

      await this.notifications.notifyUsers({
        userIds: watchers,
        eventKey: "ticket.updated",
        title: "Helpdesk ticket updated",
        body: `${user.name}: ${updated.title}`,
        href: `/helpdesk?open=${id}`,
        entityType: "HELPDESK",
        entityId: id,
        skipUserId: user.id,
      });
    }

    return updated;
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    const [entityMessages, activity] = await Promise.all([
      this.notifications.listComments("HELPDESK", id),
      this.notifications.listActivity("HELPDESK", id),
    ]);
    // Merge legacy HelpdeskComment + EntityComment into messages
    const messages = [
      ...ticket.comments.map((c) => ({
        id: c.id,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
        author: c.author,
        source: "helpdesk" as const,
      })),
      ...entityMessages.map((c) => ({
        id: c.id,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
        author: c.author,
        source: "entity" as const,
      })),
    ].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return { ...ticket, messages, activity };
  }

  async addTicketComment(
    ticketId: string,
    user: AuthUser,
    body: string,
    isInternal = false,
  ) {
    if (!body?.trim()) throw new BadRequestException("Message required");
    const ticket = await this.prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const comment = await this.prisma.helpdeskComment.create({
      data: {
        ticketId,
        authorId: user.id,
        body: body.trim(),
        isInternal,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    await this.notifications.logActivity({
      entityType: "HELPDESK",
      entityId: ticketId,
      actorId: user.id,
      action: "commented",
      summary: `${user.name} left a message${isInternal ? " (internal)" : ""}`,
    });
    await this.notifications.notifyUsers({
      userIds: [ticket.createdById, ticket.assigneeId].filter(Boolean) as string[],
      eventKey: "ticket.comment",
      title: "New message on ticket",
      body: `${user.name}: ${body.slice(0, 140)}`,
      href: `/helpdesk?open=${ticketId}`,
      entityType: "HELPDESK",
      entityId: ticketId,
      skipUserId: user.id,
    });
    return comment;
  }

  // ─── Calendar ──────────────────────────────────────────────────
  async listEvents(
    user: AuthUser,
    range: { from: string; to: string },
  ) {
    const from = new Date(range.from);
    const to = new Date(range.to);

    const overlayTargets = await this.prisma.calendarOverlayRequest.findMany({
      where: { requesterId: user.id, status: OverlayStatus.APPROVED },
      select: { targetId: true },
    });
    const ownerIds = [
      user.id,
      ...overlayTargets.map((o) => o.targetId),
    ];

    return this.prisma.calendarEvent.findMany({
      where: {
        startsAt: { lte: to },
        endsAt: { gte: from },
        OR: [
          { isMaster: true },
          { ownerId: { in: ownerIds } },
          { departmentId: { in: user.departmentIds } },
          ...(user.role === "CON_MANAGER" ? [{}] : []),
        ],
      },
      orderBy: { startsAt: "asc" },
      include: {
        owner: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, color: true } },
      },
    });
  }

  createEvent(
    user: AuthUser,
    data: {
      title: string;
      description?: string;
      location?: string;
      startsAt: string;
      endsAt: string;
      allDay?: boolean;
      isMaster?: boolean;
      color?: string;
      departmentId?: string;
    },
  ) {
    if (data.isMaster && user.role !== "CON_MANAGER") {
      throw new ForbiddenException("Only Con Manager can create master events");
    }
    return this.prisma.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        allDay: data.allDay ?? false,
        isMaster: data.isMaster ?? false,
        color: data.color,
        departmentId: data.departmentId,
        ownerId: user.id,
      },
    });
  }

  updateEvent(id: string, data: Partial<{
    title: string;
    description: string;
    location: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    color: string;
  }>) {
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        allDay: data.allDay,
        color: data.color,
      },
    });
  }

  deleteEvent(id: string) {
    return this.prisma.calendarEvent.delete({ where: { id } });
  }

  requestOverlay(requesterId: string, targetId: string) {
    return this.prisma.calendarOverlayRequest.upsert({
      where: {
        requesterId_targetId: { requesterId, targetId },
      },
      create: { requesterId, targetId },
      update: { status: OverlayStatus.PENDING },
    });
  }

  respondOverlay(id: string, targetId: string, status: OverlayStatus) {
    return this.prisma.calendarOverlayRequest.updateMany({
      where: { id, targetId },
      data: { status },
    });
  }

  myOverlayRequests(userId: string) {
    return this.prisma.calendarOverlayRequest.findMany({
      where: {
        OR: [{ requesterId: userId }, { targetId: userId }],
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ─── Documents ─────────────────────────────────────────────────
  listDocuments(user: AuthUser, departmentId?: string) {
    const where: Prisma.DocumentWhereInput = {};
    if (user.role === "CON_MANAGER") {
      if (departmentId) where.departmentId = departmentId;
    } else {
      where.OR = [
        { departmentId: { in: user.departmentIds } },
        { departmentId: null },
      ];
      if (departmentId) where.departmentId = departmentId;
    }
    return this.prisma.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { revisions: true } },
      },
    });
  }

  async createDocument(
    user: AuthUser,
    data: {
      title: string;
      description?: string;
      departmentId?: string;
      source: DocumentSource;
      externalUrl?: string;
      file?: Express.Multer.File;
      notes?: string;
    },
  ) {
    let currentUrl: string | undefined;
    let currentPath: string | undefined;
    let mimeType: string | undefined;
    let sizeBytes: number | undefined;

    if (data.source === DocumentSource.EXTERNAL) {
      if (!data.externalUrl) throw new BadRequestException("externalUrl required");
      currentUrl = data.externalUrl;
    } else {
      if (!data.file) throw new BadRequestException("file required");
      const saved = await this.saveUpload(data.file);
      currentPath = saved.relativePath;
      currentUrl = `/uploads/${saved.filename}`;
      mimeType = data.file.mimetype;
      sizeBytes = data.file.size;
    }

    return this.prisma.document.create({
      data: {
        title: data.title,
        description: data.description,
        departmentId: data.departmentId,
        source: data.source,
        currentUrl,
        currentPath,
        mimeType,
        sizeBytes,
        uploadedById: user.id,
        revisions: {
          create: {
            version: 1,
            source: data.source,
            url: currentUrl,
            filePath: currentPath,
            mimeType,
            sizeBytes,
            notes: data.notes,
            createdById: user.id,
          },
        },
      },
      include: { revisions: true },
    });
  }

  async addRevision(
    documentId: string,
    user: AuthUser,
    data: {
      source: DocumentSource;
      externalUrl?: string;
      file?: Express.Multer.File;
      notes?: string;
    },
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!doc) throw new NotFoundException();
    const nextVersion = (doc.revisions[0]?.version || 0) + 1;

    let url: string | undefined;
    let filePath: string | undefined;
    let mimeType: string | undefined;
    let sizeBytes: number | undefined;

    if (data.source === DocumentSource.EXTERNAL) {
      url = data.externalUrl;
    } else if (data.file) {
      const saved = await this.saveUpload(data.file);
      filePath = saved.relativePath;
      url = `/uploads/${saved.filename}`;
      mimeType = data.file.mimetype;
      sizeBytes = data.file.size;
    }

    const revision = await this.prisma.documentRevision.create({
      data: {
        documentId,
        version: nextVersion,
        source: data.source,
        url,
        filePath,
        mimeType,
        sizeBytes,
        notes: data.notes,
        createdById: user.id,
      },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        currentUrl: url,
        currentPath: filePath,
        mimeType,
        sizeBytes,
        source: data.source,
      },
    });

    return revision;
  }

  getDocument(id: string) {
    return this.prisma.document.findUnique({
      where: { id },
      include: {
        revisions: {
          orderBy: { version: "desc" },
          include: { createdBy: { select: { id: true, name: true } } },
        },
        uploadedBy: { select: { id: true, name: true } },
        department: true,
      },
    });
  }

  private async saveUpload(file: Express.Multer.File) {
    const uploadDir =
      this.config.get<string>("UPLOAD_DIR") || join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });
    const filename = `${randomUUID()}${extname(file.originalname) || ""}`;
    const fullPath = join(uploadDir, filename);
    await writeFile(fullPath, file.buffer);
    return { filename, relativePath: fullPath };
  }

  // ─── Surveys ───────────────────────────────────────────────────
  listSurveys(departmentId?: string) {
    return this.prisma.survey.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { responses: true } },
      },
    });
  }

  createSurvey(
    userId: string,
    data: {
      title: string;
      description?: string;
      departmentId?: string;
      questions: unknown;
      isTemplate?: boolean;
      templateKey?: string;
    },
  ) {
    return this.prisma.survey.create({
      data: {
        title: data.title,
        description: data.description,
        departmentId: data.departmentId,
        questions: data.questions as Prisma.InputJsonValue,
        isTemplate: data.isTemplate ?? false,
        templateKey: data.templateKey,
        createdById: userId,
      },
    });
  }

  async respondSurvey(
    surveyId: string,
    userId: string | null,
    answers: unknown,
    responder?: string,
  ) {
    return this.prisma.surveyResponse.create({
      data: {
        surveyId,
        userId: userId || undefined,
        responder,
        answers: answers as Prisma.InputJsonValue,
      },
    });
  }

  async getSurvey(id: string) {
    return this.prisma.survey.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        responses: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { responses: true } },
      },
    });
  }

  async exportSurvey(id: string, format: "csv" | "text" = "csv") {
    const survey = await this.getSurvey(id);
    if (!survey) throw new NotFoundException("Survey not found");
    const questions = (survey.questions as { id: string; label: string }[]) || [];
    if (format === "text") {
      const blocks = (survey.responses || []).map((r, idx) => {
        const answers = r.answers as Record<string, unknown>;
        const lines = questions.map(
          (q) => `${q.label}: ${JSON.stringify(answers[q.id] ?? "")}`,
        );
        return `Response #${idx + 1} (${r.user?.name || r.responder || "anon"})\n${lines.join("\n")}`;
      });
      return { format, content: blocks.join("\n\n---\n\n") };
    }
    const header = ["responseId", "user", "submittedAt", ...questions.map((q) => q.label)];
    const rows = (survey.responses || []).map((r) => {
      const answers = r.answers as Record<string, unknown>;
      return [
        r.id,
        r.user?.email || r.responder || "",
        r.createdAt.toISOString(),
        ...questions.map((q) => {
          const v = answers[q.id];
          return typeof v === "string" ? v : JSON.stringify(v ?? "");
        }),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",");
    });
    return { format: "csv", content: [header.join(","), ...rows].join("\n") };
  }

  // ─── Handover ──────────────────────────────────────────────────
  listHandovers(departmentId: string) {
    return this.prisma.handoverNote.findMany({
      where: { departmentId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  createHandover(
    userId: string,
    data: {
      departmentId: string;
      title: string;
      body: string;
      shiftLabel?: string;
    },
  ) {
    return this.prisma.handoverNote.create({
      data: { ...data, authorId: userId },
    });
  }

  // ─── Shifts ────────────────────────────────────────────────────
  listShifts(departmentId?: string) {
    return this.prisma.shift.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: { startsAt: "asc" },
      include: {
        department: { select: { id: true, name: true } },
        assignments: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }

  createShift(data: {
    departmentId: string;
    title: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    location?: string;
    slots?: number;
    allowSelfSignup?: boolean;
  }) {
    return this.prisma.shift.create({
      data: {
        departmentId: data.departmentId,
        title: data.title,
        description: data.description,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        location: data.location,
        slots: data.slots ?? 1,
        allowSelfSignup: data.allowSelfSignup ?? true,
      },
    });
  }

  async assignShift(shiftId: string, userId: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { assignments: true },
    });
    if (!shift) throw new NotFoundException("Shift not found");
    if (shift.assignments.length >= shift.slots) {
      throw new BadRequestException("Shift is full");
    }
    // Conflict: overlapping shifts
    const conflict = await this.prisma.shiftAssignment.findFirst({
      where: {
        userId,
        shift: {
          startsAt: { lt: shift.endsAt },
          endsAt: { gt: shift.startsAt },
          id: { not: shiftId },
        },
      },
      include: { shift: true },
    });
    if (conflict) {
      throw new BadRequestException(
        `Conflicts with shift "${conflict.shift.title}"`,
      );
    }
    // Conflict: calendar events owned by user
    const calConflict = await this.prisma.calendarEvent.findFirst({
      where: {
        ownerId: userId,
        startsAt: { lt: shift.endsAt },
        endsAt: { gt: shift.startsAt },
      },
    });
    if (calConflict) {
      throw new BadRequestException(
        `Conflicts with calendar event "${calConflict.title}"`,
      );
    }
    return this.prisma.shiftAssignment.create({
      data: { shiftId, userId },
    });
  }

  unassignShift(shiftId: string, userId: string) {
    return this.prisma.shiftAssignment.delete({
      where: { shiftId_userId: { shiftId, userId } },
    });
  }

  // ─── Orders ────────────────────────────────────────────────────
  listOrders(user: AuthUser) {
    if (user.role === "CON_MANAGER") {
      return this.prisma.itemOrder.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { id: true, name: true } },
          fromDept: { select: { id: true, name: true } },
          toDept: { select: { id: true, name: true } },
        },
      });
    }
    return this.prisma.itemOrder.findMany({
      where: {
        OR: [
          { requestedById: user.id },
          { fromDeptId: { in: user.departmentIds } },
          { toDeptId: { in: user.departmentIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        requestedBy: { select: { id: true, name: true } },
        fromDept: { select: { id: true, name: true } },
        toDept: { select: { id: true, name: true } },
      },
    });
  }

  createOrder(
    userId: string,
    data: {
      title: string;
      description?: string;
      quantity?: number;
      fromDeptId?: string;
      toDeptId?: string;
    },
  ) {
    return this.prisma.itemOrder.create({
      data: {
        title: data.title,
        description: data.description,
        quantity: data.quantity ?? 1,
        fromDeptId: data.fromDeptId,
        toDeptId: data.toDeptId,
        requestedById: userId,
      },
    });
  }

  updateOrderStatus(
    id: string,
    status: OrderStatus,
    fulfilledById?: string,
  ) {
    return this.prisma.itemOrder.update({
      where: { id },
      data: { status, fulfilledById },
    });
  }

  // ─── Budget ────────────────────────────────────────────────────
  listBudget(departmentId?: string) {
    return this.prisma.budgetEntry.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: { incurredAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  createBudget(
    userId: string,
    data: {
      label: string;
      amount: number;
      departmentId?: string;
      category?: string;
      notes?: string;
      incurredAt?: string;
    },
  ) {
    return this.prisma.budgetEntry.create({
      data: {
        label: data.label,
        amount: data.amount,
        departmentId: data.departmentId,
        category: data.category,
        notes: data.notes,
        status: "PENDING",
        incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
        createdById: userId,
      },
    });
  }

  approveBudget(id: string, approverId: string, status: "APPROVED" | "REJECTED") {
    return this.prisma.budgetEntry.update({
      where: { id },
      data: {
        status,
        approvedById: approverId,
        approvedAt: new Date(),
      },
    });
  }

  // ─── Lost & Found ──────────────────────────────────────────────
  listLostFound() {
    return this.prisma.lostFoundItem.findMany({
      orderBy: { createdAt: "desc" },
      include: { reportedBy: { select: { id: true, name: true } } },
    });
  }

  createLostFound(
    userId: string,
    data: {
      title: string;
      description?: string;
      location?: string;
      status?: LostFoundStatus;
    },
  ) {
    return this.prisma.lostFoundItem.create({
      data: { ...data, reportedById: userId },
    });
  }

  updateLostFound(id: string, data: Partial<{ status: LostFoundStatus; title: string; description: string; location: string }>) {
    return this.prisma.lostFoundItem.update({ where: { id }, data });
  }

  // ─── Media ─────────────────────────────────────────────────────
  listMedia() {
    return this.prisma.mediaItem.findMany({
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async createMedia(
    userId: string,
    data: {
      title: string;
      description?: string;
      externalUrl?: string;
      file?: Express.Multer.File;
      tags?: string[];
      departmentId?: string;
      eventLabel?: string;
    },
  ) {
    let url = data.externalUrl;
    let filePath: string | undefined;
    let mimeType: string | undefined;
    if (data.file) {
      const saved = await this.saveUpload(data.file);
      filePath = saved.relativePath;
      url = `/uploads/${saved.filename}`;
      mimeType = data.file.mimetype;
    }
    return this.prisma.mediaItem.create({
      data: {
        title: data.title,
        description: data.description,
        url,
        filePath,
        mimeType,
        tags: data.tags || [],
        departmentId: data.departmentId,
        eventLabel: data.eventLabel,
        uploadedById: userId,
      },
    });
  }

  // ─── Con Bible ─────────────────────────────────────────────────
  listBible() {
    return this.prisma.conBiblePage.findMany({
      where: { isPublished: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
  }

  createBiblePage(
    userId: string,
    data: {
      title: string;
      slug: string;
      body: string;
      category?: string;
      sortOrder?: number;
      isPublished?: boolean;
    },
  ) {
    return this.prisma.conBiblePage.create({
      data: { ...data, authorId: userId },
    });
  }

  updateBiblePage(
    id: string,
    data: Partial<{
      title: string;
      body: string;
      category: string;
      sortOrder: number;
      isPublished: boolean;
    }>,
  ) {
    return this.prisma.conBiblePage.update({ where: { id }, data });
  }

  // ─── Org Chart ─────────────────────────────────────────────────
  listOrg() {
    return this.prisma.orgChartNode.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, title: true } },
        department: { select: { id: true, name: true, color: true } },
      },
    });
  }

  createOrgNode(data: {
    title: string;
    userId?: string;
    departmentId?: string;
    parentId?: string;
    sortOrder?: number;
  }) {
    return this.prisma.orgChartNode.create({ data });
  }

  updateOrgNode(
    id: string,
    data: Partial<{
      title: string;
      userId: string | null;
      departmentId: string | null;
      parentId: string | null;
      sortOrder: number;
    }>,
  ) {
    return this.prisma.orgChartNode.update({ where: { id }, data });
  }

  deleteOrgNode(id: string) {
    return this.prisma.orgChartNode.delete({ where: { id } });
  }

  // ─── Badges ────────────────────────────────────────────────────
  listBadgeTypes() {
    return this.prisma.badgeType.findMany({
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }

  createBadgeType(data: { name: string; description?: string; color?: string }) {
    return this.prisma.badgeType.create({ data });
  }

  assignBadge(badgeTypeId: string, userId: string, notes?: string) {
    return this.prisma.badgeAssignment.create({
      data: { badgeTypeId, userId, notes },
    });
  }

  // ─── Radio ─────────────────────────────────────────────────────
  listRadio() {
    return this.prisma.radioChannel.findMany({
      include: {
        department: { select: { id: true, name: true } },
        assignments: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  }

  createRadioChannel(data: {
    name: string;
    frequency?: string;
    description?: string;
    departmentId?: string;
  }) {
    return this.prisma.radioChannel.create({ data });
  }

  assignRadio(channelId: string, userId: string, callSign?: string) {
    return this.prisma.radioAssignment.create({
      data: { channelId, userId, callSign },
    });
  }

  // ─── On-call ───────────────────────────────────────────────────
  listOnCall() {
    return this.prisma.onCallSlot.findMany({
      orderBy: { startsAt: "asc" },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  createOnCall(data: {
    userId: string;
    departmentId?: string;
    startsAt: string;
    endsAt: string;
    notes?: string;
  }) {
    return this.prisma.onCallSlot.create({
      data: {
        userId: data.userId,
        departmentId: data.departmentId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        notes: data.notes,
      },
    });
  }

  // ─── Rooms ─────────────────────────────────────────────────────
  listRooms() {
    return this.prisma.room.findMany({
      include: {
        bookings: {
          where: { endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
        },
      },
    });
  }

  createRoom(data: {
    name: string;
    capacity?: number;
    location?: string;
    notes?: string;
  }) {
    return this.prisma.room.create({ data });
  }

  async createBooking(
    userId: string,
    data: {
      roomId: string;
      title: string;
      startsAt: string;
      endsAt: string;
      notes?: string;
    },
  ) {
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    const conflict = await this.prisma.roomBooking.findFirst({
      where: {
        roomId: data.roomId,
        status: { in: ["REQUESTED", "APPROVED"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) {
      throw new BadRequestException(
        `Room conflict with "${conflict.title}" (${conflict.status})`,
      );
    }
    return this.prisma.roomBooking.create({
      data: {
        roomId: data.roomId,
        userId,
        title: data.title,
        startsAt,
        endsAt,
        notes: data.notes,
      },
    });
  }

  updateBookingStatus(id: string, status: RoomBookingStatus) {
    return this.prisma.roomBooking.update({ where: { id }, data: { status } });
  }

  // ─── Run of Show ───────────────────────────────────────────────
  listRunOfShow(departmentId?: string) {
    return this.prisma.runOfShowItem.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: [{ startsAt: "asc" }, { sortOrder: "asc" }],
      include: { department: { select: { id: true, name: true } } },
    });
  }

  createRunOfShow(data: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt?: string;
    location?: string;
    departmentId?: string;
    calendarEventId?: string;
    sortOrder?: number;
  }) {
    return this.prisma.runOfShowItem.create({
      data: {
        title: data.title,
        description: data.description,
        startsAt: new Date(data.startsAt),
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        location: data.location,
        departmentId: data.departmentId,
        calendarEventId: data.calendarEventId,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  // ─── iCal export ───────────────────────────────────────────────
  async exportIcal(user: AuthUser, departmentId?: string) {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setMonth(to.getMonth() + 3);
    const events = await this.listEvents(user, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    const filtered = departmentId
      ? events.filter((e) => e.departmentId === departmentId || e.isMaster)
      : events;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ConMan//EN",
      "CALSCALE:GREGORIAN",
    ];
    for (const ev of filtered) {
      const dt = (d: Date) =>
        d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${ev.id}@conman`,
        `DTSTAMP:${dt(new Date())}`,
        `DTSTART:${dt(new Date(ev.startsAt))}`,
        `DTEND:${dt(new Date(ev.endsAt))}`,
        `SUMMARY:${(ev.title || "").replace(/\n/g, " ")}`,
        ev.location ? `LOCATION:${ev.location.replace(/\n/g, " ")}` : "",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    return lines.filter(Boolean).join("\r\n");
  }

  // ─── Vendors ───────────────────────────────────────────────────
  listVendors() {
    return this.prisma.vendor.findMany({ orderBy: { name: "asc" } });
  }

  createVendor(data: {
    name: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    booth?: string;
    notes?: string;
    departmentId?: string;
  }) {
    return this.prisma.vendor.create({ data });
  }

  // ─── Meals ─────────────────────────────────────────────────────
  listMeals() {
    return this.prisma.mealPlan.findMany({
      orderBy: { mealDate: "asc" },
      include: {
        selections: {
          include: { user: { select: { id: true, name: true, dietaryNotes: true } } },
        },
      },
    });
  }

  createMeal(data: {
    name: string;
    mealDate: string;
    departmentId?: string;
    notes?: string;
  }) {
    return this.prisma.mealPlan.create({
      data: {
        name: data.name,
        mealDate: new Date(data.mealDate),
        departmentId: data.departmentId,
        notes: data.notes,
      },
    });
  }

  selectMeal(
    mealPlanId: string,
    userId: string,
    choice?: string,
    dietaryNote?: string,
  ) {
    return this.prisma.mealSelection.upsert({
      where: { mealPlanId_userId: { mealPlanId, userId } },
      create: { mealPlanId, userId, choice, dietaryNote },
      update: { choice, dietaryNote },
    });
  }

  // ─── Kiosk check-in ────────────────────────────────────────────
  async kioskCheckIn(opts: {
    userId?: string;
    email?: string;
    badgeCode?: string;
    method?: string;
  }) {
    let userId = opts.userId;
    if (!userId && opts.email) {
      const u = await this.prisma.user.findUnique({
        where: { email: opts.email.toLowerCase() },
      });
      userId = u?.id;
    }
    if (!userId && opts.badgeCode) {
      const badge = await this.prisma.badgeAssignment.findUnique({
        where: { badgeCode: opts.badgeCode },
      });
      userId = badge?.userId;
    }
    if (!userId) throw new BadRequestException("User not found");

    const open = await this.prisma.staffCheckIn.findFirst({
      where: { userId, checkedOutAt: null },
    });
    if (open) {
      return this.prisma.staffCheckIn.update({
        where: { id: open.id },
        data: { checkedOutAt: new Date() },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
    }
    return this.prisma.staffCheckIn.create({
      data: {
        userId,
        method: opts.method || "kiosk",
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  kioskStatus() {
    return this.prisma.staffCheckIn.findMany({
      where: { checkedOutAt: null },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { checkedInAt: "desc" },
    });
  }

  // ─── Badge print payload ───────────────────────────────────────
  async badgePrintData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        departmentMembers: {
          include: { department: true },
        },
        badgeAssignments: { include: { badgeType: true } },
      },
    });
    if (!user) throw new NotFoundException();
    return {
      name: user.name,
      pronouns: user.pronouns,
      role: user.role,
      title: user.title,
      departments: user.departmentMembers.map((m) => m.department.name),
      badges: user.badgeAssignments.map((b) => ({
        type: b.badgeType.name,
        color: b.badgeType.color,
        accessLevel: b.badgeType.accessLevel,
        code: b.badgeCode,
      })),
    };
  }

  // ─── Audit ─────────────────────────────────────────────────────
  listAudit(limit = 100) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, name: true, email: true } } },
    });
  }


  // ─── Notifications ─────────────────────────────────────────────
  listNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  markNotificationRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async notify(userId: string, title: string, body?: string, href?: string) {
    return this.prisma.notification.create({
      data: { userId, title, body, href },
    });
  }

  // ─── Dashboard ─────────────────────────────────────────────────
  async dashboard(user: AuthUser) {
    const [openTodos, openTickets, unreadComms, upcomingShifts, notifications] =
      await Promise.all([
        this.prisma.todo.count({
          where: {
            status: { in: ["OPEN", "IN_PROGRESS"] },
            OR: [
              { assigneeId: user.id },
              ...(user.role === "CON_MANAGER" ? [{}] : []),
            ],
          },
        }),
        this.prisma.helpdeskTicket.count({
          where:
            user.role === "CON_MANAGER"
              ? { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } }
              : {
                  departmentId: { in: user.departmentIds },
                  status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] },
                },
        }),
        this.prisma.communication.count({
          where: {
            reads: { none: { userId: user.id } },
            OR: [
              { recipientIds: { has: user.id } },
              {
                departmentId: { in: user.departmentIds },
                recipientIds: { isEmpty: true },
              },
            ],
          },
        }),
        this.prisma.shiftAssignment.count({
          where: {
            userId: user.id,
            shift: { startsAt: { gte: new Date() } },
          },
        }),
        this.prisma.notification.count({
          where: { userId: user.id, readAt: null },
        }),
      ]);

    return {
      openTodos,
      openTickets,
      unreadComms,
      upcomingShifts,
      unreadNotifications: notifications,
    };
  }
}
