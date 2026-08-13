import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import {
  DEFAULT_NOTIFICATION_PREFS,
  mergePrefs,
  NotificationEventKey,
  NotificationPrefs,
  NOTIFICATION_EVENTS,
  resolveChannels,
} from "./notification-prefs";

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  catalog() {
    return {
      events: NOTIFICATION_EVENTS,
      defaults: DEFAULT_NOTIFICATION_PREFS,
    };
  }

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    return mergePrefs(user?.notificationPrefs);
  }

  async updatePrefs(userId: string, prefs: Partial<NotificationPrefs>) {
    const current = await this.getPrefs(userId);
    const next: NotificationPrefs = {
      channels: {
        ...current.channels,
        ...(prefs.channels || {}),
      },
      events: {
        ...current.events,
        ...(prefs.events || {}),
      },
    };
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  list(userId: string, opts?: { unreadOnly?: boolean; limit?: number }) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        channel: "in_app",
        ...(opts?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, channel: "in_app", readAt: null },
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null, channel: "in_app" },
      data: { readAt: new Date() },
    });
  }

  /**
   * Notify a set of users for an event, respecting each user's prefs.
   * Skips the actor by default.
   */
  async notifyUsers(opts: {
    userIds: string[];
    eventKey: NotificationEventKey;
    title: string;
    body?: string;
    href?: string;
    entityType?: string;
    entityId?: string;
    skipUserId?: string;
  }) {
    const unique = Array.from(
      new Set(opts.userIds.filter((id) => id && id !== opts.skipUserId)),
    );
    if (!unique.length) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        notificationPrefs: true,
      },
    });

    for (const u of users) {
      const prefs = mergePrefs(u.notificationPrefs);
      const channels = resolveChannels(prefs, opts.eventKey);

      if (channels.inApp) {
        await this.prisma.notification.create({
          data: {
            userId: u.id,
            title: opts.title,
            body: opts.body,
            href: opts.href,
            eventKey: opts.eventKey,
            entityType: opts.entityType,
            entityId: opts.entityId,
            channel: "in_app",
          },
        });
      }

      if (channels.email && u.email) {
        await this.mail.sendMail({
          to: u.email,
          subject: `[ConMan] ${opts.title}`,
          text: [opts.body, opts.href ? `Open: ${opts.href}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          html: `<p>${opts.body || opts.title}</p>${
            opts.href ? `<p><a href="${opts.href}">Open in ConMan</a></p>` : ""
          }`,
        });
        await this.prisma.notification.create({
          data: {
            userId: u.id,
            title: opts.title,
            body: opts.body,
            href: opts.href,
            eventKey: opts.eventKey,
            entityType: opts.entityType,
            entityId: opts.entityId,
            channel: "email",
            readAt: new Date(), // email is "delivered", not an inbox item
          },
        });
      }
    }
  }

  // ─── Collaboration: activity + comments ────────────────────────

  logActivity(opts: {
    entityType: string;
    entityId: string;
    actorId?: string;
    action: string;
    summary: string;
    changes?: Record<string, { from: unknown; to: unknown }>;
  }) {
    return this.prisma.entityActivity.create({
      data: {
        entityType: opts.entityType,
        entityId: opts.entityId,
        actorId: opts.actorId,
        action: opts.action,
        summary: opts.summary,
        changes: opts.changes as Prisma.InputJsonValue | undefined,
      },
    });
  }

  listActivity(entityType: string, entityId: string) {
    return this.prisma.entityActivity.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        actor: { select: { id: true, name: true } },
      },
    });
  }

  listComments(entityType: string, entityId: string) {
    return this.prisma.entityComment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, name: true } },
      },
    });
  }

  addComment(opts: {
    entityType: string;
    entityId: string;
    authorId: string;
    body: string;
    isInternal?: boolean;
  }) {
    return this.prisma.entityComment.create({
      data: {
        entityType: opts.entityType,
        entityId: opts.entityId,
        authorId: opts.authorId,
        body: opts.body.trim(),
        isInternal: opts.isInternal ?? false,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });
  }

  /** Diff plain objects for activity log */
  diffFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    fields: string[],
  ): Record<string, { from: unknown; to: unknown }> | undefined {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) {
      const a = before[f] instanceof Date ? (before[f] as Date).toISOString() : before[f];
      const b = after[f] instanceof Date ? (after[f] as Date).toISOString() : after[f];
      if (String(a ?? "") !== String(b ?? "")) {
        changes[f] = { from: a ?? null, to: b ?? null };
      }
    }
    return Object.keys(changes).length ? changes : undefined;
  }
}
