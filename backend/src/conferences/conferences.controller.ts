import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ConferencesService, CloneOptions } from "./conferences.service";
import {
  AuthUser,
  CurrentUser,
  RequireRoles,
} from "../common/decorators";
import { SystemRole } from "@prisma/client";

class CreateConferenceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  hotelSoloNightLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  hotelRoommateNightLimit?: number;

  @IsOptional()
  @IsObject()
  globalFeatures?: Record<string, boolean>;
}

class UpdateConferenceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  year?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsInt()
  hotelSoloNightLimit?: number;

  @IsOptional()
  @IsInt()
  hotelRoommateNightLimit?: number;

  @IsOptional()
  @IsString()
  smtpHost?: string | null;

  @IsOptional()
  @IsInt()
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUser?: string | null;

  @IsOptional()
  @IsString()
  smtpPassword?: string | null;

  @IsOptional()
  @IsString()
  smtpFrom?: string | null;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsObject()
  globalFeatures?: Record<string, boolean>;
}

class CloneCopyDto implements CloneOptions {
  @IsOptional() @IsBoolean() settings?: boolean;
  @IsOptional() @IsBoolean() departments?: boolean;
  @IsOptional() @IsBoolean() departmentMembers?: boolean;
  @IsOptional() @IsBoolean() policies?: boolean;
  @IsOptional() @IsBoolean() rooms?: boolean;
  @IsOptional() @IsBoolean() badgeTypes?: boolean;
  @IsOptional() @IsBoolean() bible?: boolean;
  @IsOptional() @IsBoolean() radio?: boolean;
  @IsOptional() @IsBoolean() orgChart?: boolean;
  @IsOptional() @IsBoolean() vendors?: boolean;
  @IsOptional() @IsBoolean() loadSchedule?: boolean;
  @IsOptional() @IsBoolean() calendar?: boolean;
  @IsOptional() @IsBoolean() shifts?: boolean;
  @IsOptional() @IsBoolean() runOfShow?: boolean;
  @IsOptional() @IsBoolean() surveys?: boolean;
  @IsOptional() @IsBoolean() inventory?: boolean;
  @IsOptional() @IsBoolean() documents?: boolean;
  @IsOptional() @IsInt() dateShiftDays?: number;
}

class CloneConferenceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CloneCopyDto)
  copy?: CloneCopyDto;
}

@Controller("conferences")
export class ConferencesController {
  constructor(private conferences: ConferencesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conferences.listForUser(user);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.conferences.get(id, user);
  }

  @Post()
  @RequireRoles(SystemRole.CON_MANAGER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConferenceDto) {
    return this.conferences.create(user, dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateConferenceDto,
  ) {
    return this.conferences.update(id, user, dto);
  }

  @Post(":id/clone")
  @RequireRoles(SystemRole.CON_MANAGER)
  clone(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CloneConferenceDto,
  ) {
    return this.conferences.clone(id, user, dto);
  }
}
