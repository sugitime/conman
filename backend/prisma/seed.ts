import {
  PrismaClient,
  SystemRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  DEFAULT_DEPARTMENT_FEATURES,
  DEFAULT_GLOBAL_FEATURES,
  PERMISSIONS,
} from "../src/common/permissions";

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
      conferenceName: "Example Convention",
      hotelSoloNightLimit: 3,
      hotelRoommateNightLimit: 5,
      globalFeatures: DEFAULT_GLOBAL_FEATURES,
    },
    update: {},
  });

  const fullAccess = await prisma.accessPolicy.upsert({
    where: { name: "Full Operations Access" },
    create: {
      name: "Full Operations Access",
      description: "Nearly all operational permissions (non-admin)",
      permissions: PERMISSIONS.filter((p) => !p.startsWith("settings.") && p !== "users.manage"),
      isSystem: true,
    },
    update: {},
  });

  await prisma.accessPolicy.upsert({
    where: { name: "Helpdesk Operator" },
    create: {
      name: "Helpdesk Operator",
      description: "Work helpdesk tickets",
      permissions: ["helpdesk.create", "helpdesk.work"],
      isSystem: true,
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: SystemRole.CON_MANAGER,
    },
    update: {
      name: adminName,
      passwordHash,
      role: SystemRole.CON_MANAGER,
      isActive: true,
    },
  });

  const depts = [
    {
      name: "Operations",
      color: "#6366f1",
      isOrderingDept: false,
      helpdeskQueueAccess: true,
    },
    {
      name: "Logistics",
      color: "#0ea5e9",
      isOrderingDept: true,
      helpdeskQueueAccess: true,
    },
    {
      name: "Guest Relations",
      color: "#10b981",
      isOrderingDept: false,
      helpdeskQueueAccess: true,
    },
    {
      name: "Tech / AV",
      color: "#f59e0b",
      isOrderingDept: false,
      helpdeskQueueAccess: true,
    },
  ];

  for (const d of depts) {
    await prisma.department.upsert({
      where: { name: d.name },
      create: {
        ...d,
        features: DEFAULT_DEPARTMENT_FEATURES,
      },
      update: {
        color: d.color,
        isOrderingDept: d.isOrderingDept,
        helpdeskQueueAccess: d.helpdeskQueueAccess,
      },
    });
  }

  const ops = await prisma.department.findUnique({ where: { name: "Operations" } });
  if (ops) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: { departmentId: ops.id, userId: admin.id },
      },
      create: { departmentId: ops.id, userId: admin.id, isLead: true },
      update: { isLead: true },
    });
  }

  // Demo lead + volunteer
  const leadHash = await bcrypt.hash("changeme123", 10);
  const lead = await prisma.user.upsert({
    where: { email: "lead@conman.local" },
    create: {
      email: "lead@conman.local",
      name: "Dept Lead",
      passwordHash: leadHash,
      role: SystemRole.DEPARTMENT_LEAD,
    },
    update: {},
  });
  const logistics = await prisma.department.findUnique({
    where: { name: "Logistics" },
  });
  if (logistics) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: {
          departmentId: logistics.id,
          userId: lead.id,
        },
      },
      create: {
        departmentId: logistics.id,
        userId: lead.id,
        isLead: true,
      },
      update: { isLead: true },
    });
  }

  const volHash = await bcrypt.hash("changeme123", 10);
  const volunteer = await prisma.user.upsert({
    where: { email: "volunteer@conman.local" },
    create: {
      email: "volunteer@conman.local",
      name: "Volunteer User",
      passwordHash: volHash,
      role: SystemRole.VOLUNTEER,
    },
    update: {},
  });
  if (logistics) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: {
          departmentId: logistics.id,
          userId: volunteer.id,
        },
      },
      create: {
        departmentId: logistics.id,
        userId: volunteer.id,
        isLead: false,
      },
      update: {},
    });
  }

  await prisma.accessPolicyAssignment.upsert({
    where: {
      userId_policyId: { userId: lead.id, policyId: fullAccess.id },
    },
    create: { userId: lead.id, policyId: fullAccess.id },
    update: {},
  });

  // Sample bible page
  await prisma.conBiblePage.upsert({
    where: { slug: "welcome" },
    create: {
      title: "Welcome to ConOps",
      slug: "welcome",
      category: "General",
      body: "This is your Con Bible. Document SOPs, contacts, and runbooks here.",
      authorId: admin.id,
      sortOrder: 0,
    },
    update: {},
  });

  // Sample rooms
  await prisma.room.upsert({
    where: { name: "Green Room" },
    create: { name: "Green Room", capacity: 20, location: "Level 2" },
    update: {},
  });
  await prisma.room.upsert({
    where: { name: "Ops Office" },
    create: { name: "Ops Office", capacity: 8, location: "Level 1" },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log("Seed complete.");
  // eslint-disable-next-line no-console
  console.log(`Con Manager: ${adminEmail} / ${adminPassword}`);
  // eslint-disable-next-line no-console
  console.log("Lead: lead@conman.local / changeme123");
  // eslint-disable-next-line no-console
  console.log("Volunteer: volunteer@conman.local / changeme123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
