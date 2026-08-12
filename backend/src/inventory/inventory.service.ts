import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryEventType,
  InventoryStatus,
  OrderStatus,
} from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../common/decorators";

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private code() {
    return `INV-${randomBytes(4).toString("hex").toUpperCase()}`;
  }

  list(departmentId?: string, status?: InventoryStatus) {
    return this.prisma.inventoryItem.findMany({
      where: {
        departmentId: departmentId || undefined,
        status: status || undefined,
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        department: { select: { id: true, name: true } },
        checkedOutTo: { select: { id: true, name: true, email: true } },
      },
    });
  }

  dashboard(departmentId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: {
        departmentId: departmentId || undefined,
        status: InventoryStatus.CHECKED_OUT,
      },
      orderBy: { checkedOutAt: "desc" },
      include: {
        checkedOutTo: { select: { id: true, name: true, email: true, phone: true } },
        department: { select: { id: true, name: true } },
      },
    });
  }

  async get(idOrCode: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        OR: [{ id: idOrCode }, { assetCode: idOrCode }],
      },
      include: {
        department: true,
        checkedOutTo: { select: { id: true, name: true, email: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException("Item not found");
    return item;
  }

  async create(
    actor: AuthUser,
    data: {
      name: string;
      description?: string;
      serialNumber?: string;
      category?: string;
      location?: string;
      departmentId?: string;
      quantity?: number;
      lowStockThreshold?: number;
      assetCode?: string;
    },
  ) {
    const item = await this.prisma.inventoryItem.create({
      data: {
        name: data.name,
        description: data.description,
        serialNumber: data.serialNumber,
        category: data.category,
        location: data.location,
        departmentId: data.departmentId,
        quantity: data.quantity ?? 1,
        lowStockThreshold: data.lowStockThreshold,
        assetCode: data.assetCode || this.code(),
        status: InventoryStatus.AVAILABLE,
      },
    });
    await this.prisma.inventoryEvent.create({
      data: {
        itemId: item.id,
        actorId: actor.id,
        type: InventoryEventType.CREATED,
      },
    });
    await this.audit.log({
      actorId: actor.id,
      action: "inventory.create",
      entityType: "InventoryItem",
      entityId: item.id,
    });
    return item;
  }

  async update(
    id: string,
    actor: AuthUser,
    data: Partial<{
      name: string;
      description: string;
      serialNumber: string;
      category: string;
      location: string;
      departmentId: string | null;
      status: InventoryStatus;
      lowStockThreshold: number | null;
    }>,
  ) {
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data,
    });
    await this.prisma.inventoryEvent.create({
      data: {
        itemId: id,
        actorId: actor.id,
        type: InventoryEventType.UPDATED,
        meta: data as object,
      },
    });
    return item;
  }

  async checkout(
    actor: AuthUser,
    opts: {
      codes: string[];
      userId?: string;
      location?: string;
      expectedReturnAt?: string;
      notes?: string;
    },
  ) {
    if (!opts.codes?.length) throw new BadRequestException("No items");
    const results = [];
    for (const code of opts.codes) {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { OR: [{ assetCode: code }, { id: code }] },
      });
      if (!item) {
        results.push({ code, ok: false, error: "Not found" });
        continue;
      }
      if (item.status !== InventoryStatus.AVAILABLE) {
        results.push({ code, ok: false, error: `Status is ${item.status}` });
        continue;
      }
      const updated = await this.prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          status: InventoryStatus.CHECKED_OUT,
          checkedOutToId: opts.userId,
          checkedOutAt: new Date(),
          expectedReturnAt: opts.expectedReturnAt
            ? new Date(opts.expectedReturnAt)
            : null,
          checkoutNotes: opts.notes,
          location: opts.location || item.location,
        },
      });
      await this.prisma.inventoryEvent.create({
        data: {
          itemId: item.id,
          actorId: actor.id,
          type: InventoryEventType.CHECK_OUT,
          notes: opts.notes,
          meta: {
            toUserId: opts.userId,
            expectedReturnAt: opts.expectedReturnAt,
          },
        },
      });
      results.push({ code, ok: true, item: updated });
    }
    return results;
  }

  async checkin(actor: AuthUser, opts: { codes: string[]; notes?: string; location?: string }) {
    if (!opts.codes?.length) throw new BadRequestException("No items");
    const results = [];
    for (const code of opts.codes) {
      const item = await this.prisma.inventoryItem.findFirst({
        where: { OR: [{ assetCode: code }, { id: code }] },
      });
      if (!item) {
        results.push({ code, ok: false, error: "Not found" });
        continue;
      }
      if (item.status !== InventoryStatus.CHECKED_OUT && item.status !== InventoryStatus.MAINTENANCE) {
        results.push({ code, ok: false, error: `Status is ${item.status}` });
        continue;
      }
      const updated = await this.prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          status: InventoryStatus.AVAILABLE,
          checkedOutToId: null,
          checkedOutAt: null,
          expectedReturnAt: null,
          checkoutNotes: null,
          location: opts.location || item.location,
        },
      });
      await this.prisma.inventoryEvent.create({
        data: {
          itemId: item.id,
          actorId: actor.id,
          type: InventoryEventType.CHECK_IN,
          notes: opts.notes,
        },
      });
      results.push({ code, ok: true, item: updated });
    }
    return results;
  }

  /** When an order is fulfilled, create inventory assets */
  async receiveFromOrder(actor: AuthUser, orderId: string) {
    const order = await this.prisma.itemOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== OrderStatus.FULFILLED && order.status !== OrderStatus.APPROVED) {
      throw new BadRequestException("Order must be approved/fulfilled");
    }
    if (order.receivedToInventory) {
      throw new BadRequestException("Already received into inventory");
    }

    const created = [];
    for (let i = 0; i < order.quantity; i++) {
      const item = await this.prisma.inventoryItem.create({
        data: {
          name: order.title,
          description: order.description,
          departmentId: order.fromDeptId || order.toDeptId,
          assetCode: this.code(),
          sourceOrderId: order.id,
          status: InventoryStatus.AVAILABLE,
          category: "Ordered",
        },
      });
      await this.prisma.inventoryEvent.create({
        data: {
          itemId: item.id,
          actorId: actor.id,
          type: InventoryEventType.RECEIVED_FROM_ORDER,
          meta: { orderId },
        },
      });
      created.push(item);
    }

    await this.prisma.itemOrder.update({
      where: { id: orderId },
      data: { status: OrderStatus.FULFILLED, receivedToInventory: true, fulfilledById: actor.id },
    });

    return created;
  }

  lowStock(departmentId?: string) {
    // quantity-based consumables + lost items
    return this.prisma.inventoryItem.findMany({
      where: {
        departmentId: departmentId || undefined,
        OR: [
          { status: InventoryStatus.LOST },
          {
            AND: [
              { lowStockThreshold: { not: null } },
              // Prisma can't compare columns easily; filter in app
            ],
          },
        ],
      },
    }).then((items) =>
      items.filter(
        (i) =>
          i.status === InventoryStatus.LOST ||
          (i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold),
      ),
    );
  }

  history(itemId: string) {
    return this.prisma.inventoryEvent.findMany({
      where: { itemId },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, name: true } } },
    });
  }
}
