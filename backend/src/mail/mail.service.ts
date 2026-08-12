import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private prisma: PrismaService) {}

  private async getTransport() {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: "default" },
    });
    if (!settings?.smtpHost) {
      return null;
    }
    return {
      transporter: nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort || 587,
        secure: settings.smtpSecure,
        auth:
          settings.smtpUser
            ? {
                user: settings.smtpUser,
                pass: settings.smtpPassword || undefined,
              }
            : undefined,
      }),
      from: settings.smtpFrom || settings.smtpUser || "noreply@conman.local",
    };
  }

  async sendMail(opts: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
  }) {
    const transport = await this.getTransport();
    if (!transport) {
      this.logger.warn(
        `SMTP not configured — skipped email "${opts.subject}" to ${opts.to}`,
      );
      return { skipped: true };
    }
    await transport.transporter.sendMail({
      from: transport.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { skipped: false };
  }

  async sendTest(to: string) {
    return this.sendMail({
      to,
      subject: "ConMan SMTP test",
      text: "Your SMTP configuration is working.",
    });
  }
}
