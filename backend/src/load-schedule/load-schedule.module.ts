import { Module } from "@nestjs/common";
import { LoadScheduleService } from "./load-schedule.service";
import { LoadScheduleController } from "./load-schedule.controller";

@Module({
  providers: [LoadScheduleService],
  controllers: [LoadScheduleController],
  exports: [LoadScheduleService],
})
export class LoadScheduleModule {}
