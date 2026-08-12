import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  DocumentSource,
  LostFoundStatus,
  OrderStatus,
  OverlayStatus,
  RoomBookingStatus,
  TicketSeverity,
  TicketStatus,
  TodoPriority,
  TodoStatus,
  SystemRole,
} from "@prisma/client";
import { OpsService } from "./ops.service";
import {
  AuthUser,
  CurrentUser,
  RequireFeature,
  RequirePermissions,
  RequireRoles,
} from "../common/decorators";

const uploadInterceptor = FileInterceptor("file", {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

@Controller()
export class OpsController {
  constructor(private ops: OpsService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: AuthUser) {
    return this.ops.dashboard(user);
  }

  // Todos
  @Get("todos")
  @RequireFeature("todos")
  listTodos(
    @CurrentUser() user: AuthUser,
    @Query("departmentId") departmentId?: string,
  ) {
    return this.ops.listTodos(user, departmentId);
  }

  @Post("todos")
  @RequireFeature("todos")
  createTodo(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      description?: string;
      priority?: TodoPriority;
      dueAt?: string;
      departmentId?: string;
      assigneeId?: string;
    },
  ) {
    return this.ops.createTodo(user, body);
  }

  @Patch("todos/:id")
  @RequireFeature("todos")
  updateTodo(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      title: string;
      description: string;
      status: TodoStatus;
      priority: TodoPriority;
      dueAt: string | null;
      assigneeId: string | null;
    }>,
  ) {
    return this.ops.updateTodo(id, body);
  }

  // Communications
  @Get("communications")
  @RequireFeature("communications_hub")
  listComms(
    @CurrentUser() user: AuthUser,
    @Query("departmentId") departmentId?: string,
  ) {
    return this.ops.listComms(user, departmentId);
  }

  @Post("communications")
  @RequireFeature("communications_hub")
  createComm(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      subject: string;
      body: string;
      departmentId?: string;
      recipientIds?: string[];
      isPinned?: boolean;
    },
  ) {
    return this.ops.createComm(user, body);
  }

  @Post("communications/:id/read")
  @RequireFeature("communications_hub")
  markRead(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.ops.markCommRead(id, user.id);
  }

  // Helpdesk
  @Get("helpdesk")
  @RequireFeature("helpdesk")
  listTickets(
    @CurrentUser() user: AuthUser,
    @Query("departmentId") departmentId?: string,
    @Query("master") master?: string,
  ) {
    return this.ops.listTickets(user, {
      departmentId,
      master: master === "1" || master === "true",
    });
  }

  @Get("helpdesk/:id")
  @RequireFeature("helpdesk")
  getTicket(@Param("id") id: string) {
    return this.ops.getTicket(id);
  }

  @Post("helpdesk")
  @RequireFeature("helpdesk")
  createTicket(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      description: string;
      severity?: TicketSeverity;
      departmentId: string;
    },
  ) {
    return this.ops.createTicket(user, body);
  }

  @Patch("helpdesk/:id")
  @RequireFeature("helpdesk")
  updateTicket(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      status: TicketStatus;
      severity: TicketSeverity;
      assigneeId: string | null;
      title: string;
      description: string;
    }>,
  ) {
    return this.ops.updateTicket(id, body);
  }

  @Post("helpdesk/:id/comments")
  @RequireFeature("helpdesk")
  comment(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { body: string; isInternal?: boolean },
  ) {
    return this.ops.addTicketComment(
      id,
      user.id,
      body.body,
      body.isInternal,
    );
  }

  // Calendar
  @Get("calendar")
  @RequireFeature("calendar")
  listEvents(
    @CurrentUser() user: AuthUser,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.ops.listEvents(user, { from, to });
  }

  @Post("calendar")
  @RequireFeature("calendar")
  createEvent(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
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
    return this.ops.createEvent(user, body);
  }

  @Patch("calendar/:id")
  @RequireFeature("calendar")
  updateEvent(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      title: string;
      description: string;
      location: string;
      startsAt: string;
      endsAt: string;
      allDay: boolean;
      color: string;
    }>,
  ) {
    return this.ops.updateEvent(id, body);
  }

  @Delete("calendar/:id")
  @RequireFeature("calendar")
  deleteEvent(@Param("id") id: string) {
    return this.ops.deleteEvent(id);
  }

  @Get("calendar/overlays")
  @RequireFeature("calendar")
  overlays(@CurrentUser() user: AuthUser) {
    return this.ops.myOverlayRequests(user.id);
  }

  @Post("calendar/overlays")
  @RequireFeature("calendar")
  requestOverlay(
    @CurrentUser() user: AuthUser,
    @Body() body: { targetId: string },
  ) {
    return this.ops.requestOverlay(user.id, body.targetId);
  }

  @Patch("calendar/overlays/:id")
  @RequireFeature("calendar")
  respondOverlay(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { status: OverlayStatus },
  ) {
    return this.ops.respondOverlay(id, user.id, body.status);
  }

  // Documents
  @Get("documents")
  @RequireFeature("documents")
  listDocs(
    @CurrentUser() user: AuthUser,
    @Query("departmentId") departmentId?: string,
  ) {
    return this.ops.listDocuments(user, departmentId);
  }

  @Get("documents/:id")
  @RequireFeature("documents")
  getDoc(@Param("id") id: string) {
    return this.ops.getDocument(id);
  }

  @Post("documents")
  @RequireFeature("documents")
  @UseInterceptors(uploadInterceptor)
  createDoc(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      title: string;
      description?: string;
      departmentId?: string;
      source?: DocumentSource;
      externalUrl?: string;
      notes?: string;
    },
  ) {
    return this.ops.createDocument(user, {
      title: body.title,
      description: body.description,
      departmentId: body.departmentId,
      source: body.source || (file ? DocumentSource.LOCAL : DocumentSource.EXTERNAL),
      externalUrl: body.externalUrl,
      file,
      notes: body.notes,
    });
  }

  @Post("documents/:id/revisions")
  @RequireFeature("documents")
  @UseInterceptors(uploadInterceptor)
  addRevision(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      source?: DocumentSource;
      externalUrl?: string;
      notes?: string;
    },
  ) {
    return this.ops.addRevision(id, user, {
      source:
        body.source || (file ? DocumentSource.LOCAL : DocumentSource.EXTERNAL),
      externalUrl: body.externalUrl,
      file,
      notes: body.notes,
    });
  }

  // Surveys
  @Get("surveys")
  @RequireFeature("surveys")
  listSurveys(@Query("departmentId") departmentId?: string) {
    return this.ops.listSurveys(departmentId);
  }

  @Post("surveys")
  @RequireFeature("surveys")
  createSurvey(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      description?: string;
      departmentId?: string;
      questions: unknown;
    },
  ) {
    return this.ops.createSurvey(user.id, body);
  }

  @Post("surveys/:id/responses")
  @RequireFeature("surveys")
  respond(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { answers: unknown },
  ) {
    return this.ops.respondSurvey(id, user.id, body.answers);
  }

  // Handover
  @Get("handovers")
  @RequireFeature("handover_notes")
  listHandovers(@Query("departmentId") departmentId: string) {
    return this.ops.listHandovers(departmentId);
  }

  @Post("handovers")
  @RequireFeature("handover_notes")
  createHandover(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      departmentId: string;
      title: string;
      body: string;
      shiftLabel?: string;
    },
  ) {
    return this.ops.createHandover(user.id, body);
  }

  // Shifts
  @Get("shifts")
  @RequireFeature("shift_scheduling")
  listShifts(@Query("departmentId") departmentId?: string) {
    return this.ops.listShifts(departmentId);
  }

  @Post("shifts")
  @RequireFeature("shift_scheduling")
  createShift(
    @Body()
    body: {
      departmentId: string;
      title: string;
      description?: string;
      startsAt: string;
      endsAt: string;
      location?: string;
      slots?: number;
    },
  ) {
    return this.ops.createShift(body);
  }

  @Post("shifts/:id/assign")
  @RequireFeature("shift_scheduling")
  assignShift(
    @Param("id") id: string,
    @Body() body: { userId: string },
  ) {
    return this.ops.assignShift(id, body.userId);
  }

  // Inventory
  @Get("inventory")
  @RequireFeature("asset_inventory")
  listInventory(@Query("departmentId") departmentId?: string) {
    return this.ops.listInventory(departmentId);
  }

  @Post("inventory")
  @RequireFeature("asset_inventory")
  createInventory(
    @Body()
    body: {
      name: string;
      departmentId?: string;
      sku?: string;
      description?: string;
      quantity?: number;
      location?: string;
    },
  ) {
    return this.ops.createInventoryItem(body);
  }

  @Post("inventory/:id/adjust")
  @RequireFeature("asset_inventory")
  adjustInventory(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { delta: number; note?: string },
  ) {
    return this.ops.adjustInventory(id, user.id, body.delta, body.note);
  }

  // Orders
  @Get("orders")
  @RequireFeature("item_orders")
  listOrders(@CurrentUser() user: AuthUser) {
    return this.ops.listOrders(user);
  }

  @Post("orders")
  @RequireFeature("item_orders")
  createOrder(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      description?: string;
      quantity?: number;
      fromDeptId?: string;
      toDeptId?: string;
    },
  ) {
    return this.ops.createOrder(user.id, body);
  }

  @Patch("orders/:id")
  @RequireFeature("item_orders")
  updateOrder(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { status: OrderStatus },
  ) {
    return this.ops.updateOrderStatus(id, body.status, user.id);
  }

  // Budget
  @Get("budget")
  @RequireFeature("budget_tracking")
  listBudget(@Query("departmentId") departmentId?: string) {
    return this.ops.listBudget(departmentId);
  }

  @Post("budget")
  @RequireFeature("budget_tracking")
  createBudget(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      label: string;
      amount: number;
      departmentId?: string;
      category?: string;
      notes?: string;
      incurredAt?: string;
    },
  ) {
    return this.ops.createBudget(user.id, body);
  }

  // Lost & Found
  @Get("lost-found")
  @RequireFeature("lost_and_found")
  listLostFound() {
    return this.ops.listLostFound();
  }

  @Post("lost-found")
  @RequireFeature("lost_and_found")
  createLostFound(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      description?: string;
      location?: string;
      status?: LostFoundStatus;
    },
  ) {
    return this.ops.createLostFound(user.id, body);
  }

  @Patch("lost-found/:id")
  @RequireFeature("lost_and_found")
  updateLostFound(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      status: LostFoundStatus;
      title: string;
      description: string;
      location: string;
    }>,
  ) {
    return this.ops.updateLostFound(id, body);
  }

  // Media
  @Get("media")
  @RequireFeature("media_gallery")
  listMedia() {
    return this.ops.listMedia();
  }

  @Post("media")
  @RequireFeature("media_gallery")
  @UseInterceptors(uploadInterceptor)
  createMedia(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { title: string; description?: string; externalUrl?: string },
  ) {
    return this.ops.createMedia(user.id, { ...body, file });
  }

  // Con Bible
  @Get("bible")
  @RequireFeature("con_bible")
  listBible() {
    return this.ops.listBible();
  }

  @Post("bible")
  @RequireFeature("con_bible")
  @RequirePermissions("bible.manage")
  createBible(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      title: string;
      slug: string;
      body: string;
      category?: string;
      sortOrder?: number;
      isPublished?: boolean;
    },
  ) {
    return this.ops.createBiblePage(user.id, body);
  }

  @Patch("bible/:id")
  @RequireFeature("con_bible")
  @RequirePermissions("bible.manage")
  updateBible(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      title: string;
      body: string;
      category: string;
      sortOrder: number;
      isPublished: boolean;
    }>,
  ) {
    return this.ops.updateBiblePage(id, body);
  }

  // Org chart
  @Get("org-chart")
  @RequireFeature("org_chart")
  listOrg() {
    return this.ops.listOrg();
  }

  @Post("org-chart")
  @RequireFeature("org_chart")
  @RequirePermissions("orgchart.manage")
  createOrg(
    @Body()
    body: {
      title: string;
      userId?: string;
      departmentId?: string;
      parentId?: string;
      sortOrder?: number;
    },
  ) {
    return this.ops.createOrgNode(body);
  }

  @Patch("org-chart/:id")
  @RequireFeature("org_chart")
  @RequirePermissions("orgchart.manage")
  updateOrg(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      title: string;
      userId: string | null;
      departmentId: string | null;
      parentId: string | null;
      sortOrder: number;
    }>,
  ) {
    return this.ops.updateOrgNode(id, body);
  }

  @Delete("org-chart/:id")
  @RequireFeature("org_chart")
  @RequirePermissions("orgchart.manage")
  deleteOrg(@Param("id") id: string) {
    return this.ops.deleteOrgNode(id);
  }

  // Badges
  @Get("badges")
  @RequireFeature("badge_system")
  listBadges() {
    return this.ops.listBadgeTypes();
  }

  @Post("badges")
  @RequireFeature("badge_system")
  createBadge(
    @Body() body: { name: string; description?: string; color?: string },
  ) {
    return this.ops.createBadgeType(body);
  }

  @Post("badges/:id/assign")
  @RequireFeature("badge_system")
  assignBadge(
    @Param("id") id: string,
    @Body() body: { userId: string; notes?: string },
  ) {
    return this.ops.assignBadge(id, body.userId, body.notes);
  }

  // Radio
  @Get("radio")
  @RequireFeature("radio_channels")
  listRadio() {
    return this.ops.listRadio();
  }

  @Post("radio")
  @RequireFeature("radio_channels")
  createRadio(
    @Body()
    body: {
      name: string;
      frequency?: string;
      description?: string;
      departmentId?: string;
    },
  ) {
    return this.ops.createRadioChannel(body);
  }

  @Post("radio/:id/assign")
  @RequireFeature("radio_channels")
  assignRadio(
    @Param("id") id: string,
    @Body() body: { userId: string; callSign?: string },
  ) {
    return this.ops.assignRadio(id, body.userId, body.callSign);
  }

  // On-call
  @Get("on-call")
  @RequireFeature("on_call_roster")
  listOnCall() {
    return this.ops.listOnCall();
  }

  @Post("on-call")
  @RequireFeature("on_call_roster")
  createOnCall(
    @Body()
    body: {
      userId: string;
      departmentId?: string;
      startsAt: string;
      endsAt: string;
      notes?: string;
    },
  ) {
    return this.ops.createOnCall(body);
  }

  // Rooms
  @Get("rooms")
  @RequireFeature("room_booking")
  listRooms() {
    return this.ops.listRooms();
  }

  @Post("rooms")
  @RequireFeature("room_booking")
  @RequireRoles(SystemRole.CON_MANAGER)
  createRoom(
    @Body()
    body: {
      name: string;
      capacity?: number;
      location?: string;
      notes?: string;
    },
  ) {
    return this.ops.createRoom(body);
  }

  @Post("rooms/bookings")
  @RequireFeature("room_booking")
  bookRoom(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      roomId: string;
      title: string;
      startsAt: string;
      endsAt: string;
      notes?: string;
    },
  ) {
    return this.ops.createBooking(user.id, body);
  }

  @Patch("rooms/bookings/:id")
  @RequireFeature("room_booking")
  updateBooking(
    @Param("id") id: string,
    @Body() body: { status: RoomBookingStatus },
  ) {
    return this.ops.updateBookingStatus(id, body.status);
  }

  // Run of show
  @Get("run-of-show")
  @RequireFeature("run_of_show")
  listRos(@Query("departmentId") departmentId?: string) {
    return this.ops.listRunOfShow(departmentId);
  }

  @Post("run-of-show")
  @RequireFeature("run_of_show")
  createRos(
    @Body()
    body: {
      title: string;
      description?: string;
      startsAt: string;
      endsAt?: string;
      location?: string;
      departmentId?: string;
      sortOrder?: number;
    },
  ) {
    return this.ops.createRunOfShow(body);
  }

  // Notifications
  @Get("notifications")
  listNotifications(@CurrentUser() user: AuthUser) {
    return this.ops.listNotifications(user.id);
  }

  @Post("notifications/:id/read")
  readNotification(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.markNotificationRead(id, user.id);
  }
}
