import { Module } from "@nestjs/common";
import { ProfilesService } from "./profiles.service";
import { ProfilesController } from "./profiles.controller";
import { AuditService } from "../audit/audit.service";

@Module({
  providers: [ProfilesService, AuditService],
  controllers: [ProfilesController],
  exports: [ProfilesService],
})
export class ProfilesModule {}
