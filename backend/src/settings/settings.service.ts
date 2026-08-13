import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_GLOBAL_FEATURES,
  GLOBAL_FEATURES,
} from "../common/permissions";
import { MailService } from "../mail/mail.service";

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  /**
   * Settings are per-conference. Falls back to AppSettings legacy row
   * only when no conference context is available.
   */
  async get(conferenceId?: string | null) {
    if (conferenceId) {
      const con = await this.prisma.conference.findUnique({
        where: { id: conferenceId },
      });
      if (!con) throw new NotFoundException("Conference not found");
      const features = {
        ...DEFAULT_GLOBAL_FEATURES,
        ...((con.globalFeatures as Record<string, boolean>) || {}),
      };
      return {
        id: con.id,
        conferenceId: con.id,
        conferenceName: con.name,
        year: con.year,
        slug: con.slug,
        hotelSoloNightLimit: con.hotelSoloNightLimit,
        hotelRoommateNightLimit: con.hotelRoommateNightLimit,
        smtpHost: con.smtpHost,
        smtpPort: con.smtpPort,
        smtpUser: con.smtpUser,
        smtpPassword: con.smtpPassword ? "••••••••" : null,
        smtpFrom: con.smtpFrom,
        smtpSecure: con.smtpSecure,
        globalFeatures: features,
        featureCatalog: GLOBAL_FEATURES,
        isArchived: con.isArchived,
      };
    }

    // Legacy fallback
    const settings = await this.prisma.appSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        globalFeatures: DEFAULT_GLOBAL_FEATURES,
      },
      update: {},
    });
    const features = {
      ...DEFAULT_GLOBAL_FEATURES,
      ...((settings.globalFeatures as Record<string, boolean>) || {}),
    };
    return {
      ...settings,
      conferenceId: null,
      smtpPassword: settings.smtpPassword ? "••••••••" : null,
      globalFeatures: features,
      featureCatalog: GLOBAL_FEATURES,
    };
  }

  async update(
    data: {
      conferenceName?: string;
      hotelSoloNightLimit?: number;
      hotelRoommateNightLimit?: number;
      smtpHost?: string | null;
      smtpPort?: number;
      smtpUser?: string | null;
      smtpPassword?: string | null;
      smtpFrom?: string | null;
      smtpSecure?: boolean;
      globalFeatures?: Record<string, boolean>;
    },
    conferenceId?: string | null,
  ) {
    if (conferenceId) {
      const current = await this.prisma.conference.findUnique({
        where: { id: conferenceId },
      });
      if (!current) throw new NotFoundException("Conference not found");

      const password =
        data.smtpPassword === "••••••••" || data.smtpPassword === undefined
          ? current.smtpPassword
          : data.smtpPassword;

      const features = data.globalFeatures
        ? {
            ...DEFAULT_GLOBAL_FEATURES,
            ...((current.globalFeatures as object) || {}),
            ...data.globalFeatures,
          }
        : undefined;

      const updated = await this.prisma.conference.update({
        where: { id: conferenceId },
        data: {
          name: data.conferenceName,
          hotelSoloNightLimit: data.hotelSoloNightLimit,
          hotelRoommateNightLimit: data.hotelRoommateNightLimit,
          smtpHost: data.smtpHost,
          smtpPort: data.smtpPort,
          smtpUser: data.smtpUser,
          smtpPassword: password,
          smtpFrom: data.smtpFrom,
          smtpSecure: data.smtpSecure,
          ...(features ? { globalFeatures: features } : {}),
        },
      });
      return this.get(updated.id);
    }

    const current = await this.prisma.appSettings.findUnique({
      where: { id: "default" },
    });
    const password =
      data.smtpPassword === "••••••••" || data.smtpPassword === undefined
        ? current?.smtpPassword
        : data.smtpPassword;

    const features = data.globalFeatures
      ? {
          ...DEFAULT_GLOBAL_FEATURES,
          ...((current?.globalFeatures as object) || {}),
          ...data.globalFeatures,
        }
      : undefined;

    return this.prisma.appSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        conferenceName: data.conferenceName || "Conference",
        hotelSoloNightLimit: data.hotelSoloNightLimit ?? 0,
        hotelRoommateNightLimit: data.hotelRoommateNightLimit ?? 0,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort ?? 587,
        smtpUser: data.smtpUser,
        smtpPassword: password,
        smtpFrom: data.smtpFrom,
        smtpSecure: data.smtpSecure ?? false,
        globalFeatures: features || DEFAULT_GLOBAL_FEATURES,
      },
      update: {
        conferenceName: data.conferenceName,
        hotelSoloNightLimit: data.hotelSoloNightLimit,
        hotelRoommateNightLimit: data.hotelRoommateNightLimit,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpUser: data.smtpUser,
        smtpPassword: password,
        smtpFrom: data.smtpFrom,
        smtpSecure: data.smtpSecure,
        ...(features ? { globalFeatures: features } : {}),
      },
    });
  }

  testSmtp(to: string) {
    return this.mail.sendTest(to);
  }
}
