import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { DepartmentsService } from "./departments.service";
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
} from "../common/decorators";

class DeptDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isOrderingDept?: boolean;

  @IsOptional()
  @IsBoolean()
  helpdeskQueueAccess?: boolean;

  @IsOptional()
  @IsObject()
  features?: Record<string, boolean>;
}

class MemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  isLead?: boolean;
}

@Controller("departments")
export class DepartmentsController {
  constructor(private departments: DepartmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.departments.list(user);
  }

  @Get("helpdesk-queues")
  helpdeskQueues() {
    return this.departments.helpdeskDepartments();
  }

  @Get("ordering")
  ordering() {
    return this.departments.orderingDepartments();
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.departments.get(id, user);
  }

  @Post()
  @RequirePermissions("departments.manage")
  create(@Body() dto: DeptDto) {
    return this.departments.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<DeptDto> & { isActive?: boolean },
  ) {
    return this.departments.update(id, user, dto);
  }

  @Post(":id/members")
  addMember(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: MemberDto,
  ) {
    return this.departments.addMember(id, user, dto.userId, dto.isLead);
  }

  @Delete(":id/members/:userId")
  removeMember(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.departments.removeMember(id, user, userId);
  }
}
