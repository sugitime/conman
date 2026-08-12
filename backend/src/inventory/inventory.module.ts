import { Module } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { AuditService } from "../audit/audit.service";

@Module({
  providers: [InventoryService, AuditService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
