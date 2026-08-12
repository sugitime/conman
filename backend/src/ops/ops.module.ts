import { Module } from "@nestjs/common";
import { OpsService } from "./ops.service";
import { OpsController } from "./ops.controller";

@Module({
  providers: [OpsService],
  controllers: [OpsController],
  exports: [OpsService],
})
export class OpsModule {}
