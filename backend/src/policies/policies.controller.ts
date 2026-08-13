import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { PoliciesService } from "./policies.service";
import {
  CurrentConferenceId,
  RequirePermissions,
} from "../common/decorators";

class PolicyDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  permissions!: string[];
}

@Controller("policies")
export class PoliciesController {
  constructor(private policies: PoliciesService) {}

  @Get()
  @RequirePermissions("policies.manage")
  list(@CurrentConferenceId() conferenceId: string | null) {
    return this.policies.list(conferenceId);
  }

  @Get("catalog")
  @RequirePermissions("policies.manage")
  catalog() {
    return this.policies.permissionCatalog();
  }

  @Get(":id")
  @RequirePermissions("policies.manage")
  get(@Param("id") id: string) {
    return this.policies.get(id);
  }

  @Post()
  @RequirePermissions("policies.manage")
  create(
    @Body() dto: PolicyDto,
    @CurrentConferenceId() conferenceId: string | null,
  ) {
    return this.policies.create(dto, conferenceId);
  }

  @Patch(":id")
  @RequirePermissions("policies.manage")
  update(@Param("id") id: string, @Body() dto: Partial<PolicyDto>) {
    return this.policies.update(id, dto);
  }

  @Delete(":id")
  @RequirePermissions("policies.manage")
  remove(@Param("id") id: string) {
    return this.policies.remove(id);
  }

  @Post(":id/assign/:userId")
  @RequirePermissions("policies.manage")
  assign(@Param("id") id: string, @Param("userId") userId: string) {
    return this.policies.assign(id, userId);
  }

  @Delete(":id/assign/:userId")
  @RequirePermissions("policies.manage")
  unassign(@Param("id") id: string, @Param("userId") userId: string) {
    return this.policies.unassign(id, userId);
  }
}
