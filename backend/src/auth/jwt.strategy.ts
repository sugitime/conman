import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE_PERMISSIONS } from "../common/permissions";
import { AuthUser } from "../common/decorators";

type JwtPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET") || "dev-secret",
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        policyAssignments: { include: { policy: true } },
        departmentMembers: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("User inactive or not found");
    }

    const rolePerms = ROLE_PERMISSIONS[user.role] || [];
    const policyPerms = user.policyAssignments.flatMap(
      (a) => a.policy.permissions,
    );
    const permissions = Array.from(new Set([...rolePerms, ...policyPerms]));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions,
      departmentIds: user.departmentMembers.map((m) => m.departmentId),
      leadDepartmentIds: user.departmentMembers
        .filter((m) => m.isLead)
        .map((m) => m.departmentId),
    };
  }
}
