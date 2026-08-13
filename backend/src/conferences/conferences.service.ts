import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SystemRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/decorators";
import {
  DEFAULT_DEPARTMENT_FEATURES,
  DEFAULT_GLOBAL_FEATURES,
} from "../common/permissions";

/** Selective clone options for year-to-year duplication */
export type CloneOptions = {
  settings?: boolean;
  departments?: boolean;
  departmentMembers?: boolean;
  policies?: boolean;
  rooms?: boolean;
  badgeTypes?: boolean;
  bible?: boolean;
  radio?: boolean;
  orgChart?: boolean;
  vendors?: boolean;
  loadSchedule?: boolean;
  calendar?: boolean;
  shifts?: boolean;
  runOfShow?: boolean;
  surveys?: boolean;
  inventory?: boolean;
  documents?: boolean;
  /** Shift date-based resources by this many days (e.g. ~365 for next year) */
  dateShiftDays?: number;
};

export const DEFAULT_CLONE_OPTIONS: Required<
  Omit<CloneOptions, "dateShiftDays">
> & { dateShiftDays: number } = {
  settings: true,
  departments: true,
  departmentMembers: false,
  policies: true,
  rooms: true,
  badgeTypes: true,
  bible: true,
  radio: true,
  orgChart: true,
  vendors: true,
  loadSchedule: true,
  calendar: false,
  shifts: false,
  runOfShow: false,
  surveys: true,
  inventory: true,
  documents: false,
  dateShiftDays: 0,
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function shiftDate(d: Date | null | undefined, days: number) {
  if (!d) return d;
  if (!days) return d;
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

@Injectable()
export class ConferencesService {
  constructor(private prisma: PrismaService) {}

  async listForUser(user: AuthUser) {
    if (user.role === SystemRole.CON_MANAGER) {
      return this.prisma.conference.findMany({
        orderBy: [{ year: "desc" }, { name: "asc" }],
        include: {
          _count: { select: { departments: true, members: true } },
          members: {
            where: { userId: user.id },
            select: { role: true, isActive: true },
          },
        },
      });
    }
    return this.prisma.conference.findMany({
      where: {
        members: { some: { userId: user.id, isActive: true } },
        isArchived: false,
      },
      orderBy: [{ year: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { departments: true, members: true } },
        members: {
          where: { userId: user.id },
          select: { role: true, isActive: true },
        },
      },
    });
  }

  async get(id: string, user: AuthUser) {
    await this.assertMember(user, id);
    const con = await this.prisma.conference.findUnique({
      where: { id },
      include: {
        _count: { select: { departments: true, members: true } },
      },
    });
    if (!con) throw new NotFoundException("Conference not found");
    return {
      ...con,
      smtpPassword: con.smtpPassword ? "••••••••" : null,
      globalFeatures: {
        ...DEFAULT_GLOBAL_FEATURES,
        ...((con.globalFeatures as Record<string, boolean>) || {}),
      },
    };
  }

  async create(
    user: AuthUser,
    data: {
      name: string;
      slug?: string;
      year?: number;
      description?: string;
      hotelSoloNightLimit?: number;
      hotelRoommateNightLimit?: number;
      globalFeatures?: Record<string, boolean>;
    },
  ) {
    if (user.role !== SystemRole.CON_MANAGER) {
      throw new ForbiddenException("Only Con Managers can create conferences");
    }
    const baseSlug = data.slug?.trim() || slugify(data.name);
    const slug = await this.uniqueSlug(baseSlug);
    const con = await this.prisma.conference.create({
      data: {
        name: data.name.trim(),
        slug,
        year: data.year,
        description: data.description,
        hotelSoloNightLimit: data.hotelSoloNightLimit ?? 0,
        hotelRoommateNightLimit: data.hotelRoommateNightLimit ?? 0,
        globalFeatures: {
          ...DEFAULT_GLOBAL_FEATURES,
          ...(data.globalFeatures || {}),
        },
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: SystemRole.CON_MANAGER,
          },
        },
      },
    });
    return con;
  }

  async update(
    id: string,
    user: AuthUser,
    data: Partial<{
      name: string;
      year: number | null;
      description: string | null;
      isArchived: boolean;
      hotelSoloNightLimit: number;
      hotelRoommateNightLimit: number;
      smtpHost: string | null;
      smtpPort: number;
      smtpUser: string | null;
      smtpPassword: string | null;
      smtpFrom: string | null;
      smtpSecure: boolean;
      globalFeatures: Record<string, boolean>;
    }>,
  ) {
    await this.assertConManagerOf(user, id);
    const current = await this.prisma.conference.findUnique({ where: { id } });
    if (!current) throw new NotFoundException();

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

    return this.prisma.conference.update({
      where: { id },
      data: {
        name: data.name,
        year: data.year === undefined ? undefined : data.year,
        description: data.description,
        isArchived: data.isArchived,
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

  /**
   * Duplicate a conference into a new year/instance.
   * Caller chooses which resource groups to copy.
   */
  async clone(
    sourceId: string,
    user: AuthUser,
    opts: {
      name: string;
      slug?: string;
      year?: number;
      description?: string;
      copy?: CloneOptions;
    },
  ) {
    if (user.role !== SystemRole.CON_MANAGER) {
      throw new ForbiddenException("Only Con Managers can clone conferences");
    }
    await this.assertMember(user, sourceId);

    const source = await this.prisma.conference.findUnique({
      where: { id: sourceId },
    });
    if (!source) throw new NotFoundException("Source conference not found");

    const copy = { ...DEFAULT_CLONE_OPTIONS, ...(opts.copy || {}) };
    const shift = copy.dateShiftDays || 0;
    const baseSlug =
      opts.slug?.trim() ||
      slugify(
        opts.year ? `${opts.name}-${opts.year}` : `${opts.name}-copy`,
      );
    const slug = await this.uniqueSlug(baseSlug);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.conference.create({
        data: {
          name: opts.name.trim(),
          slug,
          year: opts.year ?? (source.year ? source.year + 1 : undefined),
          description: opts.description ?? source.description,
          hotelSoloNightLimit: copy.settings
            ? source.hotelSoloNightLimit
            : 0,
          hotelRoommateNightLimit: copy.settings
            ? source.hotelRoommateNightLimit
            : 0,
          smtpHost: copy.settings ? source.smtpHost : null,
          smtpPort: copy.settings ? source.smtpPort : 587,
          smtpUser: copy.settings ? source.smtpUser : null,
          smtpPassword: copy.settings ? source.smtpPassword : null,
          smtpFrom: copy.settings ? source.smtpFrom : null,
          smtpSecure: copy.settings ? source.smtpSecure : false,
          globalFeatures: copy.settings
            ? source.globalFeatures || DEFAULT_GLOBAL_FEATURES
            : DEFAULT_GLOBAL_FEATURES,
          createdById: user.id,
          members: {
            create: {
              userId: user.id,
              role: SystemRole.CON_MANAGER,
            },
          },
        },
      });

      const deptMap = new Map<string, string>();

      if (copy.departments) {
        const depts = await tx.department.findMany({
          where: { conferenceId: sourceId },
          include: { members: copy.departmentMembers },
        });
        for (const d of depts) {
          const nd = await tx.department.create({
            data: {
              conferenceId: created.id,
              name: d.name,
              description: d.description,
              color: d.color,
              isOrderingDept: d.isOrderingDept,
              helpdeskQueueAccess: d.helpdeskQueueAccess,
              features: d.features || DEFAULT_DEPARTMENT_FEATURES,
              isActive: d.isActive,
            },
          });
          deptMap.set(d.id, nd.id);

          if (copy.departmentMembers) {
            for (const m of d.members) {
              await tx.departmentMember.upsert({
                where: {
                  departmentId_userId: {
                    departmentId: nd.id,
                    userId: m.userId,
                  },
                },
                create: {
                  departmentId: nd.id,
                  userId: m.userId,
                  isLead: m.isLead,
                },
                update: { isLead: m.isLead },
              });
              await tx.conferenceMember.upsert({
                where: {
                  conferenceId_userId: {
                    conferenceId: created.id,
                    userId: m.userId,
                  },
                },
                create: {
                  conferenceId: created.id,
                  userId: m.userId,
                  role: SystemRole.VOLUNTEER,
                },
                update: {},
              });
            }
          }
        }
      }

      if (copy.policies) {
        const policies = await tx.accessPolicy.findMany({
          where: { conferenceId: sourceId },
        });
        for (const p of policies) {
          await tx.accessPolicy.create({
            data: {
              conferenceId: created.id,
              name: p.name,
              description: p.description,
              permissions: p.permissions,
              isSystem: p.isSystem,
            },
          });
        }
      }

      if (copy.rooms) {
        const rooms = await tx.room.findMany({
          where: { conferenceId: sourceId },
        });
        for (const r of rooms) {
          await tx.room.create({
            data: {
              conferenceId: created.id,
              name: r.name,
              capacity: r.capacity,
              location: r.location,
              notes: r.notes,
            },
          });
        }
      }

      if (copy.badgeTypes) {
        const badges = await tx.badgeType.findMany({
          where: { conferenceId: sourceId },
        });
        for (const b of badges) {
          await tx.badgeType.create({
            data: {
              conferenceId: created.id,
              name: b.name,
              description: b.description,
              color: b.color,
              accessLevel: b.accessLevel,
            },
          });
        }
      }

      if (copy.bible) {
        const pages = await tx.conBiblePage.findMany({
          where: { conferenceId: sourceId },
        });
        for (const page of pages) {
          await tx.conBiblePage.create({
            data: {
              conferenceId: created.id,
              title: page.title,
              slug: page.slug,
              body: page.body,
              category: page.category,
              sortOrder: page.sortOrder,
              isPublished: page.isPublished,
              authorId: user.id,
            },
          });
        }
      }

      if (copy.radio) {
        const channels = await tx.radioChannel.findMany({
          where: { conferenceId: sourceId },
        });
        for (const ch of channels) {
          await tx.radioChannel.create({
            data: {
              conferenceId: created.id,
              name: ch.name,
              frequency: ch.frequency,
              description: ch.description,
              departmentId: ch.departmentId
                ? deptMap.get(ch.departmentId) || null
                : null,
            },
          });
        }
      }

      if (copy.orgChart) {
        const nodes = await tx.orgChartNode.findMany({
          where: { conferenceId: sourceId },
        });
        const nodeMap = new Map<string, string>();
        // Create without parents first
        for (const n of nodes) {
          const nn = await tx.orgChartNode.create({
            data: {
              conferenceId: created.id,
              title: n.title,
              userId: n.userId,
              departmentId: n.departmentId
                ? deptMap.get(n.departmentId) || null
                : null,
              sortOrder: n.sortOrder,
            },
          });
          nodeMap.set(n.id, nn.id);
        }
        for (const n of nodes) {
          if (n.parentId && nodeMap.get(n.parentId)) {
            await tx.orgChartNode.update({
              where: { id: nodeMap.get(n.id)! },
              data: { parentId: nodeMap.get(n.parentId) },
            });
          }
        }
      }

      if (copy.vendors) {
        const vendors = await tx.vendor.findMany({
          where: { conferenceId: sourceId },
        });
        for (const v of vendors) {
          await tx.vendor.create({
            data: {
              conferenceId: created.id,
              name: v.name,
              contactName: v.contactName,
              contactEmail: v.contactEmail,
              contactPhone: v.contactPhone,
              booth: v.booth,
              notes: v.notes,
              departmentId: v.departmentId
                ? deptMap.get(v.departmentId) || null
                : null,
            },
          });
        }
      }

      if (copy.loadSchedule && deptMap.size) {
        const tasks = await tx.loadScheduleTask.findMany({
          where: { departmentId: { in: [...deptMap.keys()] } },
        });
        for (const t of tasks) {
          const newDeptId = deptMap.get(t.departmentId);
          if (!newDeptId) continue;
          await tx.loadScheduleTask.create({
            data: {
              departmentId: newDeptId,
              phase: t.phase,
              title: t.title,
              description: t.description,
              location: t.location,
              startsAt: shiftDate(t.startsAt, shift)!,
              endsAt: shiftDate(t.endsAt, shift)!,
              status: "PLANNED",
              sortOrder: t.sortOrder,
              createdById: user.id,
              // Don't copy assignee — people may change year to year
            },
          });
        }
      }

      if (copy.calendar && deptMap.size) {
        const events = await tx.calendarEvent.findMany({
          where: {
            OR: [
              { departmentId: { in: [...deptMap.keys()] } },
              { isMaster: true, ownerId: user.id },
            ],
          },
        });
        // Only copy events tied to source departments
        const sourceDeptIds = new Set(deptMap.keys());
        for (const e of events) {
          if (e.departmentId && !sourceDeptIds.has(e.departmentId)) continue;
          if (!e.departmentId && !e.isMaster) continue;
          await tx.calendarEvent.create({
            data: {
              title: e.title,
              description: e.description,
              location: e.location,
              startsAt: shiftDate(e.startsAt, shift)!,
              endsAt: shiftDate(e.endsAt, shift)!,
              allDay: e.allDay,
              isMaster: e.isMaster,
              isPublished: false,
              color: e.color,
              departmentId: e.departmentId
                ? deptMap.get(e.departmentId) || null
                : null,
              ownerId: user.id,
            },
          });
        }
      }

      if (copy.shifts && deptMap.size) {
        const shifts = await tx.shift.findMany({
          where: { departmentId: { in: [...deptMap.keys()] } },
        });
        for (const s of shifts) {
          const newDeptId = deptMap.get(s.departmentId);
          if (!newDeptId) continue;
          await tx.shift.create({
            data: {
              departmentId: newDeptId,
              title: s.title,
              description: s.description,
              startsAt: shiftDate(s.startsAt, shift)!,
              endsAt: shiftDate(s.endsAt, shift)!,
              location: s.location,
              slots: s.slots,
              allowSelfSignup: s.allowSelfSignup,
            },
          });
        }
      }

      if (copy.runOfShow && deptMap.size) {
        const items = await tx.runOfShowItem.findMany({
          where: {
            OR: [
              { departmentId: { in: [...deptMap.keys()] } },
              { departmentId: null },
            ],
          },
        });
        const sourceDeptIds = new Set(deptMap.keys());
        for (const item of items) {
          if (item.departmentId && !sourceDeptIds.has(item.departmentId)) {
            continue;
          }
          // Skip orphan null-dept items from other cons (no conferenceId on model)
          if (!item.departmentId) continue;
          await tx.runOfShowItem.create({
            data: {
              departmentId: deptMap.get(item.departmentId) || null,
              title: item.title,
              description: item.description,
              startsAt: shiftDate(item.startsAt, shift)!,
              endsAt: item.endsAt ? shiftDate(item.endsAt, shift) : null,
              location: item.location,
              sortOrder: item.sortOrder,
            },
          });
        }
      }

      if (copy.surveys) {
        const surveys = await tx.survey.findMany({
          where: {
            OR: [
              { departmentId: { in: [...deptMap.keys()] } },
              { isTemplate: true, departmentId: null },
            ],
          },
        });
        const sourceDeptIds = new Set(deptMap.keys());
        for (const s of surveys) {
          if (s.departmentId && !sourceDeptIds.has(s.departmentId)) continue;
          if (!s.departmentId && !s.isTemplate) continue;
          // Templates without dept: only if they were created in source context —
          // without conferenceId we only copy templates when departments are also copied
          // and we limit to isTemplate or mapped depts.
          await tx.survey.create({
            data: {
              title: s.title,
              description: s.description,
              departmentId: s.departmentId
                ? deptMap.get(s.departmentId) || null
                : null,
              questions: s.questions as Prisma.InputJsonValue,
              isOpen: true,
              isTemplate: s.isTemplate,
              templateKey: s.templateKey,
              createdById: user.id,
            },
          });
        }
      }

      if (copy.inventory && deptMap.size) {
        const items = await tx.inventoryItem.findMany({
          where: { departmentId: { in: [...deptMap.keys()] } },
        });
        for (const item of items) {
          const newDeptId = item.departmentId
            ? deptMap.get(item.departmentId)
            : null;
          // Fresh asset codes for new year
          const assetCode = `${created.slug}-${item.assetCode}`.slice(0, 80);
          try {
            await tx.inventoryItem.create({
              data: {
                departmentId: newDeptId || null,
                name: item.name,
                description: item.description,
                serialNumber: item.serialNumber,
                category: item.category,
                status: "AVAILABLE",
                location: item.location,
                assetCode,
                quantity: item.quantity,
                lowStockThreshold: item.lowStockThreshold,
              },
            });
          } catch {
            // Skip duplicate asset codes
          }
        }
      }

      if (copy.documents && deptMap.size) {
        const docs = await tx.document.findMany({
          where: {
            OR: [
              { departmentId: { in: [...deptMap.keys()] } },
              { departmentId: null },
            ],
          },
        });
        const sourceDeptIds = new Set(deptMap.keys());
        for (const d of docs) {
          if (d.departmentId && !sourceDeptIds.has(d.departmentId)) continue;
          if (!d.departmentId) continue; // no conference scope without dept
          await tx.document.create({
            data: {
              title: d.title,
              description: d.description,
              departmentId: deptMap.get(d.departmentId) || null,
              source: d.source,
              currentUrl: d.currentUrl,
              // Don't copy local file paths — they won't exist for new con
              currentPath: null,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes,
              uploadedById: user.id,
            },
          });
        }
      }

      return tx.conference.findUnique({
        where: { id: created.id },
        include: {
          _count: { select: { departments: true, members: true } },
        },
      });
    });
  }

  async assertMember(user: AuthUser, conferenceId: string) {
    if (user.role === SystemRole.CON_MANAGER) return;
    const m = await this.prisma.conferenceMember.findUnique({
      where: {
        conferenceId_userId: { conferenceId, userId: user.id },
      },
    });
    if (!m?.isActive) {
      throw new ForbiddenException("Not a member of this conference");
    }
  }

  async assertConManagerOf(user: AuthUser, conferenceId: string) {
    if (user.role === SystemRole.CON_MANAGER) return;
    const m = await this.prisma.conferenceMember.findUnique({
      where: {
        conferenceId_userId: { conferenceId, userId: user.id },
      },
    });
    if (!m?.isActive || m.role !== SystemRole.CON_MANAGER) {
      throw new ForbiddenException("Con Manager access required");
    }
  }

  /** Resolve active conference for request context */
  async resolveConferenceId(
    user: AuthUser,
    requestedId?: string | null,
  ): Promise<string | null> {
    const list = await this.listForUser(user);
    if (!list.length) return null;
    if (requestedId && list.some((c) => c.id === requestedId)) {
      return requestedId;
    }
    // Prefer non-archived, highest year
    const active = list.find((c) => !c.isArchived) || list[0];
    return active.id;
  }

  private async uniqueSlug(base: string) {
    let slug = base || "con";
    let i = 0;
    while (true) {
      const candidate = i === 0 ? slug : `${slug}-${i}`;
      const existing = await this.prisma.conference.findUnique({
        where: { slug: candidate },
      });
      if (!existing) return candidate;
      i += 1;
      if (i > 100) throw new BadRequestException("Could not allocate unique slug");
    }
  }
}
