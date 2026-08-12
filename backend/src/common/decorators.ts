import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { Permission } from "./permissions";
import { SystemRole } from "@prisma/client";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = "permissions";
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const ROLES_KEY = "roles";
export const RequireRoles = (...roles: SystemRole[]) =>
  SetMetadata(ROLES_KEY, roles);

export const FEATURE_KEY = "feature";
export const RequireFeature = (feature: string) =>
  SetMetadata(FEATURE_KEY, feature);

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  permissions: string[];
  departmentIds: string[];
  leadDepartmentIds: string[];
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
