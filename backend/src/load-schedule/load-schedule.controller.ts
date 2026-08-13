import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { LoadPhase, LoadTaskStatus } from "@prisma/client";
import { LoadScheduleService } from "./load-schedule.service";
import {
  AuthUser,
  CurrentUser,
  RequireFeature,
} from "../common/decorators";

@Controller("load-schedule")
@RequireFeature("load_schedule")
export class LoadScheduleController {
  constructor(private loadSchedule: LoadScheduleService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("departmentId") departmentId?: string,
    @Query("phase") phase?: LoadPhase,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.loadSchedule.list(user, { departmentId, phase, from, to });
  }

  @Get("gantt")
  gantt(
    @CurrentUser() user: AuthUser,
    @Query("phase") phase?: LoadPhase,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.loadSchedule.gantt(user, { phase, from, to });
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.loadSchedule.get(id, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
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
    return this.loadSchedule.create(user, body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body()
    body: Partial<{
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
    return this.loadSchedule.update(id, user, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.loadSchedule.remove(id, user);
  }
}
