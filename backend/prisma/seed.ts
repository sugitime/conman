import { PrismaClient, SystemRole, InventoryStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  DEFAULT_DEPARTMENT_FEATURES,
  DEFAULT_GLOBAL_FEATURES,
  PERMISSIONS,
} from "../src/common/permissions";
import { DEFCON_DEPARTMENTS } from "../src/common/defcon-departments";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL || "admin@conman.local"
  ).toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "changeme123";
  const adminName = process.env.SEED_ADMIN_NAME || "Con Manager";

  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      conferenceName: "DEF CON",
      hotelSoloNightLimit: 3,
      hotelRoommateNightLimit: 5,
      globalFeatures: DEFAULT_GLOBAL_FEATURES,
    },
    update: {
      conferenceName: "DEF CON",
      globalFeatures: DEFAULT_GLOBAL_FEATURES,
    },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: SystemRole.CON_MANAGER,
      profileComplete: true,
    },
    update: {
      name: adminName,
      passwordHash,
      role: SystemRole.CON_MANAGER,
      isActive: true,
    },
  });

  // Primary conference: DEF CON (current year sample)
  const year = new Date().getFullYear();
  const con = await prisma.conference.upsert({
    where: { slug: "def-con" },
    create: {
      name: "DEF CON",
      slug: "def-con",
      year,
      description: "Primary DEF CON ops conference",
      hotelSoloNightLimit: 3,
      hotelRoommateNightLimit: 5,
      globalFeatures: DEFAULT_GLOBAL_FEATURES,
      createdById: admin.id,
    },
    update: {
      name: "DEF CON",
      year,
      globalFeatures: DEFAULT_GLOBAL_FEATURES,
      isArchived: false,
    },
  });

  await prisma.conferenceMember.upsert({
    where: {
      conferenceId_userId: { conferenceId: con.id, userId: admin.id },
    },
    create: {
      conferenceId: con.id,
      userId: admin.id,
      role: SystemRole.CON_MANAGER,
    },
    update: { isActive: true, role: SystemRole.CON_MANAGER },
  });

  // System policies for this con
  await prisma.accessPolicy.upsert({
    where: {
      conferenceId_name: {
        conferenceId: con.id,
        name: "Full Operations Access",
      },
    },
    create: {
      conferenceId: con.id,
      name: "Full Operations Access",
      description: "Broad operational permissions for leads",
      permissions: PERMISSIONS.filter(
        (p) =>
          !["settings.manage", "users.manage", "policies.manage"].includes(p),
      ),
      isSystem: true,
    },
    update: {},
  });

  await prisma.accessPolicy.upsert({
    where: {
      conferenceId_name: {
        conferenceId: con.id,
        name: "Helpdesk Operator",
      },
    },
    create: {
      conferenceId: con.id,
      name: "Helpdesk Operator",
      description: "Work helpdesk tickets",
      permissions: ["helpdesk.create", "helpdesk.work"],
      isSystem: true,
    },
    update: {},
  });

  for (const d of DEFCON_DEPARTMENTS) {
    await prisma.department.upsert({
      where: {
        conferenceId_name: { conferenceId: con.id, name: d.name },
      },
      create: {
        conferenceId: con.id,
        name: d.name,
        description: d.description,
        color: d.color,
        isOrderingDept: d.isOrderingDept,
        helpdeskQueueAccess: d.helpdeskQueueAccess,
        features: DEFAULT_DEPARTMENT_FEATURES,
      },
      update: {
        description: d.description,
        color: d.color,
        isOrderingDept: d.isOrderingDept,
        helpdeskQueueAccess: d.helpdeskQueueAccess,
      },
    });
  }

  const kevops = await prisma.department.findUnique({
    where: { conferenceId_name: { conferenceId: con.id, name: "KEVOPS" } },
  });
  const qm = await prisma.department.findUnique({
    where: {
      conferenceId_name: { conferenceId: con.id, name: "Quartermaster" },
    },
  });
  const dispatch = await prisma.department.findUnique({
    where: { conferenceId_name: { conferenceId: con.id, name: "Dispatch" } },
  });

  if (kevops) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: { departmentId: kevops.id, userId: admin.id },
      },
      create: { departmentId: kevops.id, userId: admin.id, isLead: true },
      update: { isLead: true },
    });
  }

  const leadHash = await bcrypt.hash("changeme123", 10);
  const lead = await prisma.user.upsert({
    where: { email: "lead@conman.local" },
    create: {
      email: "lead@conman.local",
      name: "Quartermaster Lead",
      passwordHash: leadHash,
      role: SystemRole.DEPARTMENT_LEAD,
      profileComplete: true,
      shirtSize: "L",
    },
    update: { name: "Quartermaster Lead" },
  });
  await prisma.conferenceMember.upsert({
    where: {
      conferenceId_userId: { conferenceId: con.id, userId: lead.id },
    },
    create: {
      conferenceId: con.id,
      userId: lead.id,
      role: SystemRole.DEPARTMENT_LEAD,
    },
    update: { isActive: true },
  });
  if (qm) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: { departmentId: qm.id, userId: lead.id },
      },
      create: { departmentId: qm.id, userId: lead.id, isLead: true },
      update: { isLead: true },
    });
  }

  const volHash = await bcrypt.hash("changeme123", 10);
  const volunteer = await prisma.user.upsert({
    where: { email: "volunteer@conman.local" },
    create: {
      email: "volunteer@conman.local",
      name: "Dispatch Volunteer",
      passwordHash: volHash,
      role: SystemRole.VOLUNTEER,
      shirtSize: "M",
      profileComplete: false,
    },
    update: { name: "Dispatch Volunteer" },
  });
  await prisma.conferenceMember.upsert({
    where: {
      conferenceId_userId: { conferenceId: con.id, userId: volunteer.id },
    },
    create: {
      conferenceId: con.id,
      userId: volunteer.id,
      role: SystemRole.VOLUNTEER,
    },
    update: { isActive: true },
  });
  if (dispatch) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: {
          departmentId: dispatch.id,
          userId: volunteer.id,
        },
      },
      create: {
        departmentId: dispatch.id,
        userId: volunteer.id,
        isLead: false,
      },
      update: {},
    });
  }

  // Sample inventory under Quartermaster
  const invDeptId = qm?.id || kevops?.id;
  const samples = [
    {
      name: "Radio HT-01",
      category: "Radios",
      serialNumber: "RAD-001",
      location: "QM cage",
    },
    {
      name: "Radio HT-02",
      category: "Radios",
      serialNumber: "RAD-002",
      location: "QM cage",
    },
    {
      name: "Master keys set A",
      category: "Keys",
      serialNumber: "KEY-A",
      location: "KEVOPS",
    },
    {
      name: "Laptop Loaner 1",
      category: "Laptops",
      serialNumber: "LT-100",
      location: "NOC",
    },
  ];
  for (const s of samples) {
    const code = `INV-${s.serialNumber}`;
    await prisma.inventoryItem.upsert({
      where: { assetCode: code },
      create: {
        ...s,
        assetCode: code,
        departmentId: invDeptId,
        status: InventoryStatus.AVAILABLE,
      },
      update: { name: s.name, location: s.location },
    });
  }

  for (const b of [
    { name: "Staff", color: "#4f46e5", accessLevel: "All areas" },
    { name: "Volunteer", color: "#0ea5e9", accessLevel: "Backstage" },
    { name: "Goon", color: "#0ea5e9", accessLevel: "Staff areas" },
    { name: "Press", color: "#f59e0b", accessLevel: "Press room" },
    { name: "Vendor", color: "#64748b", accessLevel: "Vendor hall" },
    { name: "Speaker", color: "#10b981", accessLevel: "Speaker ops" },
    { name: "Black Badge", color: "#111827", accessLevel: "Contest winner" },
  ]) {
    await prisma.badgeType.upsert({
      where: {
        conferenceId_name: { conferenceId: con.id, name: b.name },
      },
      create: { ...b, conferenceId: con.id },
      update: { color: b.color, accessLevel: b.accessLevel },
    });
  }

  const staffBadge = await prisma.badgeType.findUnique({
    where: {
      conferenceId_name: { conferenceId: con.id, name: "Staff" },
    },
  });
  if (staffBadge) {
    await prisma.badgeAssignment.upsert({
      where: {
        badgeTypeId_userId: { badgeTypeId: staffBadge.id, userId: admin.id },
      },
      create: { badgeTypeId: staffBadge.id, userId: admin.id },
      update: {},
    });
  }

  await prisma.conBiblePage.upsert({
    where: {
      conferenceId_slug: { conferenceId: con.id, slug: "welcome" },
    },
    create: {
      conferenceId: con.id,
      title: "Welcome to DEF CON ops",
      slug: "welcome",
      category: "General",
      body: "Emergency procedures, radio codes, and venue maps live here. This is staff/goon ConOps — not attendee registration.",
      authorId: admin.id,
      sortOrder: 0,
    },
    update: {
      title: "Welcome to DEF CON ops",
      body: "Emergency procedures, radio codes, and venue maps live here. This is staff/goon ConOps — not attendee registration.",
    },
  });

  await prisma.conBiblePage.upsert({
    where: {
      conferenceId_slug: { conferenceId: con.id, slug: "radio-codes" },
    },
    create: {
      conferenceId: con.id,
      title: "Radio channels",
      slug: "radio-codes",
      category: "Comms",
      body: "Ch1 — Dispatch / KEVOPS\nCh2 — SOC\nCh3 — NOC\nCh4 — Medical / Hotline (confirm on-site)",
      authorId: admin.id,
      sortOrder: 1,
    },
    update: {},
  });

  await prisma.room.upsert({
    where: {
      conferenceId_name: {
        conferenceId: con.id,
        name: "Speaker Ready Room",
      },
    },
    create: {
      conferenceId: con.id,
      name: "Speaker Ready Room",
      capacity: 30,
      location: "Speaker Ops",
    },
    update: {},
  });
  await prisma.room.upsert({
    where: {
      conferenceId_name: { conferenceId: con.id, name: "KEVOPS Office" },
    },
    create: {
      conferenceId: con.id,
      name: "KEVOPS Office",
      capacity: 12,
      location: "Staff area",
    },
    update: {},
  });

  await prisma.radioChannel.upsert({
    where: { id: "seed-radio-dispatch" },
    create: {
      id: "seed-radio-dispatch",
      conferenceId: con.id,
      name: "Dispatch",
      frequency: "Ch1",
      description: "Primary dispatch",
      departmentId: dispatch?.id,
    },
    update: { conferenceId: con.id },
  }).catch(async () => {
    const existing = await prisma.radioChannel.findFirst({
      where: { conferenceId: con.id, name: "Dispatch" },
    });
    if (!existing) {
      await prisma.radioChannel.create({
        data: {
          conferenceId: con.id,
          name: "Dispatch",
          frequency: "Ch1",
          description: "Primary dispatch",
          departmentId: dispatch?.id,
        },
      });
    }
  });

  const existingTemplate = await prisma.survey.findFirst({
    where: { templateKey: "after_action" },
  });
  if (!existingTemplate) {
    await prisma.survey.create({
      data: {
        title: "After-Action Feedback",
        description: "Post-con feedback template",
        isTemplate: true,
        templateKey: "after_action",
        isOpen: true,
        createdById: admin.id,
        questions: [
          {
            id: "q1",
            type: "scale",
            label: "Overall ops rating (1-5)",
            required: true,
          },
          {
            id: "q2",
            type: "textarea",
            label: "What went well?",
            required: false,
          },
          {
            id: "q3",
            type: "textarea",
            label: "What should improve?",
            required: false,
          },
        ],
      },
    });
  }

  const orgCount = await prisma.orgChartNode.count({
    where: { conferenceId: con.id },
  });
  if (orgCount === 0) {
    const root = await prisma.orgChartNode.create({
      data: {
        conferenceId: con.id,
        title: "DEF CON Ops",
        userId: admin.id,
        sortOrder: 0,
      },
    });
    if (kevops) {
      await prisma.orgChartNode.create({
        data: {
          conferenceId: con.id,
          title: "KEVOPS Lead",
          departmentId: kevops.id,
          parentId: root.id,
          userId: admin.id,
          sortOrder: 1,
        },
      });
    }
    if (qm) {
      await prisma.orgChartNode.create({
        data: {
          conferenceId: con.id,
          title: "Quartermaster Lead",
          departmentId: qm.id,
          parentId: root.id,
          userId: lead.id,
          sortOrder: 2,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`Conference: ${con.name} (${con.slug}) id=${con.id}`);
  console.log(`Con Manager: ${adminEmail} / ${adminPassword}`);
  console.log("Lead (Quartermaster): lead@conman.local / changeme123");
  console.log("Volunteer (Dispatch): volunteer@conman.local / changeme123");
  console.log(`Departments: ${DEFCON_DEPARTMENTS.length} DEF CON depts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
