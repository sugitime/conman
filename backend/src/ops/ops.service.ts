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

@Injectable()
export class OpsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
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

  createTodo(
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
        // volunteers can create personal todos only
        if (data.assigneeId && data.assigneeId !== user.id) {
          throw new ForbiddenException();
        }
      }
    }
    return this.prisma.todo.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || TodoPriority.MEDIUM,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        departmentId: data.departmentId,
        assigneeId: data.assigneeId,
        createdById: user.id,
      },
    });
  }

  updateTodo(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      status: TodoStatus;
      priority: TodoPriority;
      dueAt: string | null;
      assigneeId: string | null;
    }>,
  ) {
    return this.prisma.todo.update({
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
      },
    });
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
      isPinned?: boolean;
    },
  ) {
    return this.prisma.communication.create({
      data: {
        subject: data.subject,
        body: data.body,
        departmentId: data.departmentId,
        recipientIds: data.recipientIds || [],
        isPinned: data.isPinned ?? false,
        authorId: user.id,
      },
    });
  }

  markCommRead(id: string, userId: string) {
    return this.prisma.communicationRead.upsert({
      where: {
        communicationId_userId: { communicationId: id, userId },
      },
      create: { communicationId: id, userId },
      update: { readAt: new Date() },
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
    return this.prisma.helpdeskTicket.create({
      data: {
        title: data.title,
        description: data.description,
        severity: data.severity || TicketSeverity.MEDIUM,
        departmentId: data.departmentId,
        createdById: user.id,
      },
    });
  }

  updateTicket(
    id: string,
    data: Partial<{
      status: TicketStatus;
      severity: TicketSeverity;
      assigneeId: string | null;
      title: string;
      description: string;
    }>,
  ) {
    return this.prisma.helpdeskTicket.update({
      where: { id },
      data: {
        ...data,
        resolvedAt:
          data.status === "RESOLVED" || data.status === "CLOSED"
            ? new Date()
            : undefined,
      },
    });
  }

  getTicket(id: string) {
    return this.prisma.helpdeskTicket.findUnique({
      where: { id },
      include: {
        department: true,
        createdBy: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });
  }

  addTicketComment(
    ticketId: string,
    userId: string,
    body: string,
    isInternal = false,
  ) {
    return this.prisma.helpdeskComment.create({
      data: { ticketId, authorId: userId, body, isInternal },
    });
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
    },
  ) {
    return this.prisma.survey.create({
      data: {
        title: data.title,
        description: data.description,
        departmentId: data.departmentId,
        questions: data.questions as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
  }

  respondSurvey(surveyId: string, userId: string, answers: unknown) {
    return this.prisma.surveyResponse.upsert({
      where: { surveyId_userId: { surveyId, userId } },
      create: {
        surveyId,
        userId,
        answers: answers as Prisma.InputJsonValue,
      },
      update: { answers: answers as Prisma.InputJsonValue },
    });
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
      },
    });
  }

  assignShift(shiftId: string, userId: string) {
    return this.prisma.shiftAssignment.create({
      data: { shiftId, userId },
    });
  }

  // ─── Inventory ─────────────────────────────────────────────────
  listInventory(departmentId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: { name: "asc" },
    });
  }

  createInventoryItem(data: {
    name: string;
    departmentId?: string;
    sku?: string;
    description?: string;
    quantity?: number;
    location?: string;
  }) {
    return this.prisma.inventoryItem.create({ data });
  }

  async adjustInventory(
    itemId: string,
    userId: string,
    delta: number,
    note?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: { increment: delta } },
      });
      await tx.inventoryLog.create({
        data: { itemId, userId, delta, note },
      });
      return item;
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
        incurredAt: data.incurredAt ? new Date(data.incurredAt) : undefined,
        createdById: userId,
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

  createBooking(
    userId: string,
    data: {
      roomId: string;
      title: string;
      startsAt: string;
      endsAt: string;
      notes?: string;
    },
  ) {
    return this.prisma.roomBooking.create({
      data: {
        roomId: data.roomId,
        userId,
        title: data.title,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
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
        sortOrder: data.sortOrder ?? 0,
      },
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
