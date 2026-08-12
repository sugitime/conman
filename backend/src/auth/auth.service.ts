import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SystemRole } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !user.isActive) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async login(email: string, password: string) {
    try {
      const user = await this.validateUser(email, password);
      if (!user) throw new UnauthorizedException("Invalid email or password");
      const token = await this.jwt.signAsync({
        sub: user.id,
        email: user.email,
      });
      return {
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      // Surface DB/schema issues instead of opaque 500
      const message = err instanceof Error ? err.message : String(err);
      throw new UnauthorizedException(`Login failed: ${message}`);
    }
  }

  async registerFromInvite(token: string, name: string, password: string) {
    const tokenHash = this.hashToken(token);
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException("Invalid or expired invite");
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
    });
    if (existing) {
      throw new BadRequestException("Account already exists for this email");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: invite.email.toLowerCase(),
          name,
          passwordHash,
          role: invite.role,
        },
      });
      if (invite.departmentId) {
        await tx.departmentMember.create({
          data: {
            departmentId: invite.departmentId,
            userId: created.id,
            isLead: invite.role === SystemRole.DEPARTMENT_LEAD,
          },
        });
      }
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });
    return this.login(user.email, password);
  }

  async createInvite(opts: {
    email: string;
    role: SystemRole;
    departmentId?: string;
    invitedById: string;
  }) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await this.prisma.invite.create({
      data: {
        email: opts.email.toLowerCase(),
        role: opts.role,
        departmentId: opts.departmentId,
        tokenHash,
        invitedById: opts.invitedById,
        expiresAt,
      },
    });
    const appUrl = this.config.get("APP_URL") || "http://localhost:5173";
    const link = `${appUrl}/accept-invite?token=${token}`;
    await this.mail.sendMail({
      to: opts.email,
      subject: "You're invited to ConMan",
      text: `You've been invited to ConMan. Create your account: ${link}`,
      html: `<p>You've been invited to ConMan.</p><p><a href="${link}">Create your account</a></p>`,
    });
    return { id: invite.id, email: invite.email, expiresAt, inviteLink: link };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        departmentMembers: {
          include: { department: true },
        },
        policyAssignments: { include: { policy: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash: _, ...safe } = user;
    return safe;
  }
}
