import { Injectable } from "@nestjs/common";
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

  async get() {
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
      smtpPassword: settings.smtpPassword ? "••••••••" : null,
      globalFeatures: features,
      featureCatalog: GLOBAL_FEATURES,
    };
  }

  async update(data: {
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
  }) {
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
