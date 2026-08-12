import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ShirtSize } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/decorators";
import { MailService } from "../mail/mail.service";
import { AuditService } from "../audit/audit.service";

function nightsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  async getProfile(userId: string, viewer: AuthUser) {
    const canViewPrivate =
      viewer.id === userId ||
      viewer.role === "CON_MANAGER" ||
      viewer.role === "DEPARTMENT_LEAD";

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roommate: {
          select: { id: true, name: true, email: true, hotelCheckIn: true, hotelCheckOut: true },
        },
        departmentMembers: {
          include: { department: { select: { id: true, name: true, color: true } } },
        },
        badgeAssignments: {
          include: { badgeType: true },
        },
      },
    });
    if (!user) throw new NotFoundException();
    const { passwordHash: _, medicalNotes, dietaryNotes, emergencyName, emergencyPhone, ...rest } =
      user;

    if (!canViewPrivate) {
      return {
        ...rest,
        medicalNotes: null,
        dietaryNotes: null,
        emergencyName: null,
        emergencyPhone: null,
      };
    }
    return { ...rest, medicalNotes, dietaryNotes, emergencyName, emergencyPhone };
  }

  roommateOptions(userId: string, departmentIds: string[]) {
    return this.prisma.user.findMany({
      where: {
        id: { not: userId },
        isActive: true,
        role: { in: ["VOLUNTEER", "DEPARTMENT_LEAD", "GUEST"] },
        departmentMembers: departmentIds.length
          ? { some: { departmentId: { in: departmentIds } } }
          : undefined,
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }

  async updateProfile(
    userId: string,
    viewer: AuthUser,
    data: Partial<{
      name: string;
      phone: string;
      title: string;
      pronouns: string;
      hotelCheckIn: string | null;
      hotelCheckOut: string | null;
      roommateId: string | null;
      shirtSize: ShirtSize | null;
      emergencyName: string | null;
      emergencyPhone: string | null;
      dietaryNotes: string | null;
      medicalNotes: string | null;
    }>,
  ) {
    if (viewer.id !== userId && viewer.role !== "CON_MANAGER") {
      throw new ForbiddenException();
    }

    const hotelCheckIn =
      data.hotelCheckIn === undefined
        ? undefined
        : data.hotelCheckIn
          ? new Date(data.hotelCheckIn)
          : null;
    const hotelCheckOut =
      data.hotelCheckOut === undefined
        ? undefined
        : data.hotelCheckOut
          ? new Date(data.hotelCheckOut)
          : null;

    if (hotelCheckIn && hotelCheckOut && hotelCheckOut < hotelCheckIn) {
      throw new BadRequestException("Check-out must be after check-in");
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        phone: data.phone,
        title: data.title,
        pronouns: data.pronouns,
        hotelCheckIn,
        hotelCheckOut,
        roommateId: data.roommateId,
        shirtSize: data.shirtSize,
        emergencyName: data.emergencyName,
        emergencyPhone: data.emergencyPhone,
        dietaryNotes: data.dietaryNotes,
        medicalNotes: data.medicalNotes,
        profileComplete: true,
      },
    });

    // Sync hotel dates with roommate both ways
    if (data.roommateId !== undefined || hotelCheckIn !== undefined || hotelCheckOut !== undefined) {
      await this.syncRoommate(userId);
    }

    await this.evaluateHotelCompliance(userId);
    if (updated.roommateId) {
      await this.evaluateHotelCompliance(updated.roommateId);
    }

    await this.audit.log({
      actorId: viewer.id,
      action: "profile.update",
      entityType: "User",
      entityId: userId,
    });

    return this.getProfile(userId, viewer);
  }

  private async syncRoommate(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.roommateId) return;

    // Bidirectional roommate link + shared hotel dates
    await this.prisma.user.update({
      where: { id: user.roommateId },
      data: {
        roommateId: userId,
        hotelCheckIn: user.hotelCheckIn,
        hotelCheckOut: user.hotelCheckOut,
      },
    });
  }

  async evaluateHotelCompliance(userId: string) {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: "default" },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !settings || !user.hotelCheckIn || !user.hotelCheckOut) {
      return;
    }

    const nights = nightsBetween(user.hotelCheckIn, user.hotelCheckOut);
    const hasRoommate = !!user.roommateId;
    const limit = hasRoommate
      ? settings.hotelRoommateNightLimit
      : settings.hotelSoloNightLimit;

    let hotelCompliant = true;
    let hotelWarning: string | null = null;

    if (limit > 0 && nights > limit) {
      hotelCompliant = false;
      hotelWarning = hasRoommate
        ? `Roommate stay of ${nights} nights exceeds limit of ${limit} room-nights.`
        : `Solo stay of ${nights} nights exceeds limit of ${limit} room-nights.`;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { hotelCompliant, hotelWarning },
    });

    if (!hotelCompliant && hotelWarning) {
      await this.prisma.notification.create({
        data: {
          userId,
          title: "Hotel stay out of compliance",
          body: hotelWarning,
          href: "/profile",
        },
      });

      // Notify department leads
      const memberships = await this.prisma.departmentMember.findMany({
        where: { userId },
        include: {
          department: {
            include: {
              members: {
                where: { isLead: true },
                include: { user: true },
              },
            },
          },
        },
      });
      for (const m of memberships) {
        for (const lead of m.department.members) {
          await this.prisma.notification.create({
            data: {
              userId: lead.userId,
              title: `Hotel compliance: ${user.name}`,
              body: hotelWarning,
              href: `/profile/${userId}`,
            },
          });
          await this.mail.sendMail({
            to: lead.user.email,
            subject: `Hotel compliance warning — ${user.name}`,
            text: hotelWarning,
          });
        }
      }

      await this.mail.sendMail({
        to: user.email,
        subject: "Hotel stay compliance notice",
        text: hotelWarning,
      });
    }
  }

  async staffDirectory(viewer: AuthUser, includePrivate = false) {
    const canPrivate =
      includePrivate &&
      (viewer.role === "CON_MANAGER" || viewer.permissions.includes("stafflists.print"));

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        title: true,
        pronouns: true,
        shirtSize: canPrivate,
        emergencyName: canPrivate,
        emergencyPhone: canPrivate,
        dietaryNotes: canPrivate,
        departmentMembers: {
          include: { department: { select: { id: true, name: true } } },
        },
        badgeAssignments: { include: { badgeType: true } },
      },
    });
    return users;
  }
}
