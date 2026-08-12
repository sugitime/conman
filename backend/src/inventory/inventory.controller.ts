import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { InventoryStatus } from "@prisma/client";
import { InventoryService } from "./inventory.service";
import {
  AuthUser,
  CurrentUser,
  RequireFeature,
} from "../common/decorators";

@Controller("inventory")
@RequireFeature("asset_inventory")
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get()
  list(
    @Query("departmentId") departmentId?: string,
    @Query("status") status?: InventoryStatus,
  ) {
    return this.inventory.list(departmentId, status);
  }

  @Get("dashboard")
  dashboard(@Query("departmentId") departmentId?: string) {
    return this.inventory.dashboard(departmentId);
  }

  @Get("alerts")
  alerts(@Query("departmentId") departmentId?: string) {
    return this.inventory.lowStock(departmentId);
  }

  @Get(":idOrCode")
  get(@Param("idOrCode") idOrCode: string) {
    return this.inventory.get(idOrCode);
  }

  @Get(":id/history")
  history(@Param("id") id: string) {
    return this.inventory.history(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
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
    return this.inventory.create(user, body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inventory.update(id, user, body as never);
  }

  @Post("checkout")
  checkout(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      codes: string[];
      userId?: string;
      location?: string;
      expectedReturnAt?: string;
      notes?: string;
    },
  ) {
    return this.inventory.checkout(user, body);
  }

  @Post("checkin")
  checkin(
    @CurrentUser() user: AuthUser,
    @Body() body: { codes: string[]; notes?: string; location?: string },
  ) {
    return this.inventory.checkin(user, body);
  }

  @Post("receive-order/:orderId")
  receiveOrder(
    @Param("orderId") orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventory.receiveFromOrder(user, orderId);
  }
}
