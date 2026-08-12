import { PrismaClient, SystemRole, InventoryStatus } from "@prisma/client";
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
    update: {
      globalFeatures: DEFAULT_GLOBAL_FEATURES,
    },
  });

  await prisma.accessPolicy.upsert({
    where: { name: "Full Operations Access" },
    create: {
      name: "Full Operations Access",
      description: "Broad operational permissions for leads",
      permissions: PERMISSIONS.filter(
        (p) => !["settings.manage", "users.manage", "policies.manage"].includes(p),
      ),
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
      profileComplete: true,
    },
    update: {
      name: adminName,
      passwordHash,
      role: SystemRole.CON_MANAGER,
      isActive: true,
    },
  });

  const depts = [
    { name: "Operations", color: "#6366f1", isOrderingDept: false, helpdeskQueueAccess: true },
    { name: "Logistics", color: "#0ea5e9", isOrderingDept: true, helpdeskQueueAccess: true },
    { name: "Guest Relations", color: "#10b981", isOrderingDept: false, helpdeskQueueAccess: true },
    { name: "Tech / AV", color: "#f59e0b", isOrderingDept: false, helpdeskQueueAccess: true },
    { name: "Inventory", color: "#8b5cf6", isOrderingDept: true, helpdeskQueueAccess: false },
  ];

  for (const d of depts) {
    await prisma.department.upsert({
      where: { name: d.name },
      create: { ...d, features: DEFAULT_DEPARTMENT_FEATURES },
      update: {
        color: d.color,
        isOrderingDept: d.isOrderingDept,
        helpdeskQueueAccess: d.helpdeskQueueAccess,
      },
    });
  }

  const ops = await prisma.department.findUnique({ where: { name: "Operations" } });
  const logistics = await prisma.department.findUnique({ where: { name: "Logistics" } });
  const inventoryDept = await prisma.department.findUnique({ where: { name: "Inventory" } });

  if (ops) {
    await prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId: ops.id, userId: admin.id } },
      create: { departmentId: ops.id, userId: admin.id, isLead: true },
      update: { isLead: true },
    });
  }

  const leadHash = await bcrypt.hash("changeme123", 10);
  const lead = await prisma.user.upsert({
    where: { email: "lead@conman.local" },
    create: {
      email: "lead@conman.local",
      name: "Dept Lead",
      passwordHash: leadHash,
      role: SystemRole.DEPARTMENT_LEAD,
      profileComplete: true,
      shirtSize: "L",
    },
    update: {},
  });
  if (logistics) {
    await prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId: logistics.id, userId: lead.id } },
      create: { departmentId: logistics.id, userId: lead.id, isLead: true },
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
      shirtSize: "M",
      profileComplete: false,
    },
    update: {},
  });
  if (logistics) {
    await prisma.departmentMember.upsert({
      where: {
        departmentId_userId: { departmentId: logistics.id, userId: volunteer.id },
      },
      create: { departmentId: logistics.id, userId: volunteer.id, isLead: false },
      update: {},
    });
  }

  // Sample inventory assets
  const invDeptId = inventoryDept?.id || logistics?.id;
  const samples = [
    { name: "Radio HT-01", category: "Radios", serialNumber: "RAD-001", location: "Ops cage" },
    { name: "Radio HT-02", category: "Radios", serialNumber: "RAD-002", location: "Ops cage" },
    { name: "Master keys set A", category: "Keys", serialNumber: "KEY-A", location: "Security" },
    { name: "Laptop Loaner 1", category: "Laptops", serialNumber: "LT-100", location: "Tech room" },
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

  // Badge types
  for (const b of [
    { name: "Staff", color: "#4f46e5", accessLevel: "All areas" },
    { name: "Volunteer", color: "#0ea5e9", accessLevel: "Backstage" },
    { name: "Guest", color: "#10b981", accessLevel: "Green room" },
    { name: "Press", color: "#f59e0b", accessLevel: "Press room" },
    { name: "Vendor", color: "#64748b", accessLevel: "Exhibit hall" },
  ]) {
    await prisma.badgeType.upsert({
      where: { name: b.name },
      create: b,
      update: { color: b.color, accessLevel: b.accessLevel },
    });
  }

  const staffBadge = await prisma.badgeType.findUnique({ where: { name: "Staff" } });
  if (staffBadge) {
    await prisma.badgeAssignment.upsert({
      where: { badgeTypeId_userId: { badgeTypeId: staffBadge.id, userId: admin.id } },
      create: { badgeTypeId: staffBadge.id, userId: admin.id },
      update: {},
    });
  }

  await prisma.conBiblePage.upsert({
    where: { slug: "welcome" },
    create: {
      title: "Welcome to ConOps",
      slug: "welcome",
      category: "General",
      body: "Emergency procedures, radio codes, and venue maps live here.",
      authorId: admin.id,
      sortOrder: 0,
    },
    update: {},
  });

  await prisma.conBiblePage.upsert({
    where: { slug: "radio-codes" },
    create: {
      title: "Radio codes",
      slug: "radio-codes",
      category: "Comms",
      body: "Channel 1 — Ops\nChannel 2 — Medical\nChannel 3 — Security",
      authorId: admin.id,
      sortOrder: 1,
    },
    update: {},
  });

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

  // After-action survey template
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
          { id: "q1", type: "scale", label: "Overall ops rating (1-5)", required: true },
          { id: "q2", type: "textarea", label: "What went well?", required: false },
          { id: "q3", type: "textarea", label: "What should improve?", required: false },
        ],
      },
    });
  }

  // Org chart roots
  const orgCount = await prisma.orgChartNode.count();
  if (orgCount === 0) {
    const root = await prisma.orgChartNode.create({
      data: { title: "Con Chair", userId: admin.id, sortOrder: 0 },
    });
    if (ops) {
      await prisma.orgChartNode.create({
        data: {
          title: "Head of Operations",
          departmentId: ops.id,
          parentId: root.id,
          userId: admin.id,
          sortOrder: 1,
        },
      });
    }
    if (logistics) {
      await prisma.orgChartNode.create({
        data: {
          title: "Logistics Lead",
          departmentId: logistics.id,
          parentId: root.id,
          userId: lead.id,
          sortOrder: 2,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`Con Manager: ${adminEmail} / ${adminPassword}`);
  console.log("Lead: lead@conman.local / changeme123");
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
