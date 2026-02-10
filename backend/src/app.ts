import cors from "cors";
import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import {
  generateOtp,
  generateSessionToken,
  normalizePhone,
  sha256,
} from "./services/security.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "15mb" }));

const OTP_EXPIRY_MINUTES = 5;
const SESSION_EXPIRY_DAYS = 30;
const MAX_OTP_ATTEMPTS = 5;
const ROLE_VALUES = [
  "ADMIN",
  "WARDEN",
  "SERVICE_MANAGER",
  "SERVICE_SUPERVISOR",
  "MONITORING_OFFICIAL",
] as const;

function generateTempMachineCode(phone: string, index: number): string {
  const suffix = phone.slice(-4);
  const ts = Date.now().toString().slice(-6);
  return `TMP-${suffix}-${ts}-${index + 1}`;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function getSessionUser(req: express.Request) {
  const raw = req.headers.authorization;
  if (!raw || !raw.startsWith("Bearer ")) {
    return null;
  }

  const token = raw.slice(7).trim();
  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return null;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session.user;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "roti-service-backend" });
});

app.post("/api/admin/bootstrap", async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2),
    phone: z.string().min(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const phone = normalizePhone(parsed.data.phone);

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN", phonePrimary: phone },
  });

  if (existingAdmin) {
    return res.status(200).json({
      message: "Admin already exists.",
      admin: {
        id: existingAdmin.id,
        fullName: existingAdmin.fullName,
        phone: existingAdmin.phonePrimary,
      },
    });
  }

  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      fullName: parsed.data.fullName,
      phonePrimary: phone,
      isActive: true,
    },
  });

  return res.status(201).json({
    message: "Admin created.",
    admin: {
      id: admin.id,
      fullName: admin.fullName,
      phone: admin.phonePrimary,
    },
  });
});

app.post("/api/auth/otp/request", async (req, res) => {
  const schema = z.object({
    phone: z.string().min(10),
    role: z.enum(ROLE_VALUES).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const phone = normalizePhone(parsed.data.phone);
  const user = await prisma.user.findUnique({ where: { phonePrimary: phone } });

  if (!user || !user.isActive) {
    return res.status(404).json({
      error: "This phone number is not registered. Please contact Admin.",
    });
  }

  if (parsed.data.role && user.role !== parsed.data.role) {
    return res.status(403).json({ error: "Role mismatch for this phone number." });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      phone,
      userId: user.id,
      codeHash: sha256(otp),
      purpose: "LOGIN",
      expiresAt,
    },
  });

  return res.status(200).json({
    message: "OTP generated.",
    expiresInMinutes: OTP_EXPIRY_MINUTES,
    devOtp: otp,
  });
});

app.post("/api/auth/otp/verify", async (req, res) => {
  const schema = z.object({
    phone: z.string().min(10),
    otp: z.string().length(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const phone = normalizePhone(parsed.data.phone);

  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      phone,
      purpose: "LOGIN",
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });

  if (!otpRecord) {
    return res.status(404).json({ error: "OTP not found. Request a new OTP." });
  }

  if (otpRecord.expiresAt < new Date()) {
    return res.status(400).json({ error: "OTP expired. Request a new OTP." });
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ error: "Too many attempts. Request a new OTP." });
  }

  const isValid = sha256(parsed.data.otp) === otpRecord.codeHash;

  if (!isValid) {
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    return res.status(400).json({ error: "Invalid OTP." });
  }

  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    }),
    prisma.authSession.create({
      data: {
        userId: otpRecord.userId,
        tokenHash: sha256(sessionToken),
        expiresAt,
      },
    }),
  ]);

  return res.status(200).json({
    message: "Login successful.",
    sessionToken,
    user: {
      id: otpRecord.user.id,
      fullName: otpRecord.user.fullName,
      role: otpRecord.user.role,
      phone: otpRecord.user.phonePrimary,
    },
  });
});

app.post("/api/wardens/pre-register", async (req, res) => {
  const schema = z
    .object({
      uploadedByAdminId: z.string(),
      fullName: z.string().min(2),
      phone: z.string().min(10),
      districtId: z.string(),
      machineSerialNumbers: z.array(z.string().min(4)).optional(),
      machineCount: z.number().int().positive().max(20).optional(),
      hostelId: z.string().optional(),
    })
    .refine(
      (v) =>
        (v.machineSerialNumbers && v.machineSerialNumbers.length > 0) ||
        (v.machineCount && v.machineCount > 0),
      {
        message: "Provide either machineSerialNumbers or machineCount.",
      },
    );

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const admin = await prisma.user.findUnique({
    where: { id: parsed.data.uploadedByAdminId },
  });

  if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
    return res.status(403).json({ error: "Only active Admin can pre-register wardens." });
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);

  const warden = await prisma.user.upsert({
    where: { phonePrimary: normalizedPhone },
    create: {
      role: "WARDEN",
      fullName: parsed.data.fullName,
      phonePrimary: normalizedPhone,
      districtId: parsed.data.districtId,
      isActive: true,
    },
    update: {
      role: "WARDEN",
      fullName: parsed.data.fullName,
      districtId: parsed.data.districtId,
      isActive: true,
    },
  });

  const assignedTempCodes: string[] = [];
  const assignedSerials: string[] = [];

  if (parsed.data.machineSerialNumbers && parsed.data.machineSerialNumbers.length > 0) {
    const serialSet = Array.from(new Set(parsed.data.machineSerialNumbers));
    const machines = await prisma.machine.findMany({
      where: { serialNumber: { in: serialSet } },
      select: { id: true, serialNumber: true, tempMachineCode: true },
    });

    const foundSerials = new Set(
      machines
        .map((m) => m.serialNumber)
        .filter((serial): serial is string => typeof serial === "string"),
    );
    const missingSerials = serialSet.filter((s) => !foundSerials.has(s));

    if (missingSerials.length > 0) {
      return res.status(404).json({
        error: "Some machine serial numbers were not found.",
        missingSerials,
      });
    }

    await prisma.machine.updateMany({
      where: { id: { in: machines.map((m) => m.id) } },
      data: {
        assignedWardenId: warden.id,
        hostelId: parsed.data.hostelId,
      },
    });

    assignedSerials.push(...serialSet);
    assignedTempCodes.push(...machines.map((m) => m.tempMachineCode));
  } else {
    const count = parsed.data.machineCount ?? 0;
    const created = await Promise.all(
      Array.from({ length: count }).map((_, index) =>
        prisma.machine.create({
          data: {
            tempMachineCode: generateTempMachineCode(normalizedPhone, index),
            districtId: parsed.data.districtId,
            hostelId: parsed.data.hostelId,
            assignedWardenId: warden.id,
            registrationUploadedBy: admin.id,
          },
          select: { tempMachineCode: true },
        }),
      ),
    );

    assignedTempCodes.push(...created.map((m) => m.tempMachineCode));
  }

  return res.status(200).json({
    message: "Warden pre-registered and machine mapping saved.",
    warden: {
      id: warden.id,
      fullName: warden.fullName,
      phone: warden.phonePrimary,
    },
    assignedSerials,
    assignedTempMachineCodes: assignedTempCodes,
  });
});

app.get("/api/wardens/me/machines", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (user.role !== Role.WARDEN) {
    return res.status(403).json({ error: "Only wardens can access this endpoint." });
  }

  const machines = await prisma.machine.findMany({
    where: { assignedWardenId: user.id },
    select: {
      id: true,
      tempMachineCode: true,
      serialNumber: true,
      serialVerificationStatus: true,
      claimedSerialNumber: true,
      warrantyStatus: true,
      warrantyStartDate: true,
      warrantyEndDate: true,
      installationDate: true,
      district: { select: { id: true, name: true } },
      hostel: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return res.status(200).json({
    warden: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phonePrimary,
    },
    machines,
  });
});

app.post("/api/wardens/me/serial-claim", async (req, res) => {
  const schema = z.object({
    tempMachineCode: z.string().min(4),
    claimedSerialNumber: z.string().min(4),
    installationDate: z.string().datetime(),
    claimNotes: z.string().max(500).optional(),
    hostelId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (user.role !== "WARDEN") {
    return res.status(403).json({ error: "Only wardens can submit serial claim." });
  }

  const machine = await prisma.machine.findUnique({
    where: { tempMachineCode: parsed.data.tempMachineCode },
    select: {
      id: true,
      assignedWardenId: true,
      serialVerificationStatus: true,
    },
  });

  if (!machine) {
    return res.status(404).json({ error: "Machine placeholder not found." });
  }

  if (machine.assignedWardenId !== user.id) {
    return res.status(403).json({ error: "Machine is not assigned to this warden." });
  }

  if (machine.serialVerificationStatus === "APPROVED") {
    return res.status(400).json({ error: "Serial already approved for this machine." });
  }

  const updated = await prisma.machine.update({
    where: { id: machine.id },
    data: {
      claimedSerialNumber: parsed.data.claimedSerialNumber.trim(),
      claimedInstallationDate: new Date(parsed.data.installationDate),
      serialClaimedAt: new Date(),
      serialClaimNotes: parsed.data.claimNotes,
      serialVerificationStatus: "PENDING",
      serialRejectionReason: null,
      hostelId: parsed.data.hostelId,
    },
    select: {
      id: true,
      tempMachineCode: true,
      claimedSerialNumber: true,
      serialVerificationStatus: true,
      claimedInstallationDate: true,
    },
  });

  return res.status(200).json({
    message: "Serial claim submitted. Waiting for Admin approval.",
    machine: updated,
  });
});

app.post("/api/admin/machines/:machineId/serial-review", async (req, res) => {
  const schema = z.object({
    adminUserId: z.string(),
    action: z.enum(["APPROVE", "REJECT"]),
    approvedSerialNumber: z.string().min(4).optional(),
    rejectionReason: z.string().max(500).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const admin = await prisma.user.findUnique({ where: { id: parsed.data.adminUserId } });
  if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
    return res.status(403).json({ error: "Only active Admin can review serial claims." });
  }

  const machine = await prisma.machine.findUnique({
    where: { id: req.params.machineId },
    select: {
      id: true,
      assignedWardenId: true,
      claimedSerialNumber: true,
      claimedInstallationDate: true,
      serialVerificationStatus: true,
    },
  });

  if (!machine) {
    return res.status(404).json({ error: "Machine not found." });
  }

  if (parsed.data.action === "REJECT") {
    const rejected = await prisma.machine.update({
      where: { id: machine.id },
      data: {
        serialVerificationStatus: "REJECTED",
        serialRejectionReason:
          parsed.data.rejectionReason ?? "Serial number did not match records.",
        serialVerifiedById: admin.id,
        serialVerifiedAt: new Date(),
      },
      select: {
        id: true,
        tempMachineCode: true,
        claimedSerialNumber: true,
        serialVerificationStatus: true,
        serialRejectionReason: true,
      },
    });

    return res.status(200).json({
      message: "Serial claim rejected.",
      machine: rejected,
    });
  }

  const finalSerial = parsed.data.approvedSerialNumber ?? machine.claimedSerialNumber ?? "";
  if (!finalSerial) {
    return res.status(400).json({ error: "No serial number available to approve." });
  }
  if (!machine.claimedInstallationDate) {
    return res.status(400).json({ error: "Installation date is missing in the claim." });
  }

  const warrantyEndDate = addMonths(machine.claimedInstallationDate, 12);

  try {
    const approved = await prisma.machine.update({
      where: { id: machine.id },
      data: {
        serialNumber: finalSerial,
        serialVerificationStatus: "APPROVED",
        serialVerifiedById: admin.id,
        serialVerifiedAt: new Date(),
        serialRejectionReason: null,
        installationDate: machine.claimedInstallationDate,
        warrantyStartDate: machine.claimedInstallationDate,
        warrantyEndDate,
        warrantyStatus:
          warrantyEndDate >= new Date() ? "ACTIVE" : "EXPIRED",
        warrantyClaimedById: machine.assignedWardenId ?? null,
        warrantyClaimedAt: new Date(),
      },
      select: {
        id: true,
        tempMachineCode: true,
        serialNumber: true,
        serialVerificationStatus: true,
        warrantyStatus: true,
        warrantyStartDate: true,
        warrantyEndDate: true,
      },
    });

    return res.status(200).json({
      message: "Serial approved and warranty activated.",
      machine: approved,
    });
  } catch {
    return res.status(409).json({
      error: "This serial number is already used by another machine.",
    });
  }
});

app.post("/api/warranty/claim", async (req, res) => {
  const schema = z.object({
    serialNumber: z.string().min(4),
    installationDate: z.string().datetime(),
    hostelId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (user.role !== "WARDEN") {
    return res.status(403).json({ error: "Only wardens can claim warranty." });
  }

  const machine = await prisma.machine.findUnique({
    where: { serialNumber: parsed.data.serialNumber },
    select: {
      id: true,
      serialNumber: true,
      assignedWardenId: true,
      serialVerificationStatus: true,
      warrantyStatus: true,
      warrantyStartDate: true,
      warrantyEndDate: true,
    },
  });

  if (!machine) {
    return res.status(404).json({ error: "Machine not found." });
  }

  if (machine.assignedWardenId !== user.id) {
    return res.status(403).json({
      error: "This machine serial is not assigned to your account.",
    });
  }

  if (machine.serialVerificationStatus !== "APPROVED") {
    return res.status(400).json({
      error: "Serial is not admin-approved yet. Submit serial claim and wait for approval.",
    });
  }

  const installDate = new Date(parsed.data.installationDate);
  const warrantyEndDate = addMonths(installDate, 12);

  const updated = await prisma.machine.update({
    where: { id: machine.id },
    data: {
      installationDate: installDate,
      warrantyStartDate: installDate,
      warrantyEndDate,
      warrantyStatus: warrantyEndDate >= new Date() ? "ACTIVE" : "EXPIRED",
      warrantyClaimedById: user.id,
      warrantyClaimedAt: new Date(),
      hostelId: parsed.data.hostelId,
    },
    select: {
      serialNumber: true,
      warrantyStatus: true,
      warrantyStartDate: true,
      warrantyEndDate: true,
    },
  });

  return res.status(200).json({
    message: "Warranty claimed successfully.",
    machine: updated,
  });
});

app.post("/api/teams/register", async (req, res) => {
  const schema = z.object({
    role: z.enum(["SERVICE_MANAGER", "SERVICE_SUPERVISOR"]),
    fullName: z.string().min(2),
    phonePrimary: z.string().min(10),
    phoneSecondary: z.string().min(10),
    aadhaarNumber: z.string().length(12),
    districtId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await prisma.user.upsert({
    where: { phonePrimary: normalizePhone(parsed.data.phonePrimary) },
    create: {
      role: parsed.data.role,
      fullName: parsed.data.fullName,
      phonePrimary: normalizePhone(parsed.data.phonePrimary),
      phoneSecondary: normalizePhone(parsed.data.phoneSecondary),
      aadhaarNumber: parsed.data.aadhaarNumber,
      districtId: parsed.data.districtId,
      isActive: true,
    },
    update: {
      role: parsed.data.role,
      fullName: parsed.data.fullName,
      phoneSecondary: normalizePhone(parsed.data.phoneSecondary),
      aadhaarNumber: parsed.data.aadhaarNumber,
      districtId: parsed.data.districtId,
      isActive: true,
    },
  });

  return res.status(201).json({
    message: "Team member registered.",
    user: {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      phonePrimary: user.phonePrimary,
    },
  });
});

app.get("/api/monitoring/summary", (_req, res) => {
  return res.json({
    message: "Placeholder analytics response",
    data: {
      complaintsByDistrict: [],
      complaintsByCategory: [],
      averageResponseHours: 0,
      averageResolutionHours: 0,
    },
  });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
