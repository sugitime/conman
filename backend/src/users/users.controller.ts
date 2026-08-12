import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { SystemRole } from "@prisma/client";
import { UsersService } from "./users.service";
import {
  AuthUser,
  CurrentUser,
  RequirePermissions,
  RequireRoles,
} from "../common/decorators";

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(SystemRole)
  role!: SystemRole;

  @IsOptional()
  @IsArray()
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  leadDepartmentIds?: string[];

  @IsOptional()
  @IsArray()
  policyIds?: string[];
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(SystemRole)
  role?: SystemRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsArray()
  policyIds?: string[];
}

class InviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(SystemRole)
  role!: SystemRole;

  @IsOptional()
  @IsString()
  departmentId?: string;
}

@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @RequirePermissions("users.manage")
  list() {
    return this.users.list();
  }

  @Post("invite")
  @RequireRoles(SystemRole.CON_MANAGER, SystemRole.DEPARTMENT_LEAD)
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteDto) {
    return this.users.invite(user, dto);
  }

  @Post()
  @RequirePermissions("users.manage")
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() _user: AuthUser) {
    return this.users.get(id);
  }

  @Patch(":id")
  @RequirePermissions("users.manage")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }
}
