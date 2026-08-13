import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import {
  FEATURE_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  AuthUser,
} from "./decorators";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_GLOBAL_FEATURES,
  GlobalFeature,
} from "./permissions";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthUser>(err: Error | null, user: TUser): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException("Authentication required");
    }
    return user;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) throw new UnauthorizedException();

    if (user.role === "CON_MANAGER") return true;

    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length) {
      throw new ForbiddenException(
        `Missing permissions: ${missing.join(", ")}`,
      );
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) throw new UnauthorizedException();
    if (!roles.includes(user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      conferenceId?: string | null;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const { user } = req;
    // Con managers can always access APIs (UI may still hide nav)
    if (user?.role === "CON_MANAGER") return true;

    let featuresJson: unknown = null;
    const raw = req.headers["x-conference-id"];
    const headerId = Array.isArray(raw) ? raw[0] : raw;
    const conferenceId =
      req.conferenceId || user?.conferenceId || headerId || null;

    if (conferenceId) {
      const con = await this.prisma.conference.findUnique({
        where: { id: conferenceId },
        select: { globalFeatures: true },
      });
      featuresJson = con?.globalFeatures;
    } else {
      // Fallback: newest non-archived con features, then AppSettings
      const con = await this.prisma.conference.findFirst({
        where: { isArchived: false },
        orderBy: { year: "desc" },
        select: { globalFeatures: true },
      });
      if (con) {
        featuresJson = con.globalFeatures;
      } else {
        const settings = await this.prisma.appSettings.findUnique({
          where: { id: "default" },
        });
        featuresJson = settings?.globalFeatures;
      }
    }

    const map = {
      ...DEFAULT_GLOBAL_FEATURES,
      ...((featuresJson as Record<string, boolean>) || {}),
    };
    if (map[feature as GlobalFeature] === false) {
      throw new ForbiddenException(`Feature disabled: ${feature}`);
    }
    return true;
  }
}
