import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "../src/lib/db";
import { User } from "../src/models/User";
import { Estate } from "../src/models/Estate";
import { EstateProperty } from "../src/models/EstateProperty";
import { UtilityAccount } from "../src/models/UtilityAccount";

// Minimal shapes we care about for seeding relations
interface IdOnly {
  _id: Types.ObjectId;
}

async function seed() {
  console.log("[seed] Loading environment and connecting to MongoDB...");
  await connectToDatabase();
  console.log("✅ Connected to MongoDB");

  // Clear any old demo data so the script is idempotent
  console.log("🧹 Clearing existing demo data...");
  await Promise.all([
    User.deleteMany({ email: "demo@legatepro.test" }),
    Estate.deleteMany({ slug: "demo-estate" }),
    EstateProperty.deleteMany({ label: /Demo Property/ }),
    UtilityAccount.deleteMany({ notes: /demo seed/i }),
  ]);

  // 1) Demo user
  console.log("🌱 Seeding demo user...");
  const demoUser = await User.create({
    email: "demo@legatepro.test",
    name: "Legate Demo User",
    passwordHash: "demo-password-not-for-production",
    role: "user",
  });

  const demoUserId = demoUser._id as Types.ObjectId;

  // 2) Demo estate
  console.log("🌱 Seeding estate...");
  const demoEstate = (await Estate.create({
    ownerId: demoUserId,
    slug: "demo-estate",
    label: "Doe Estate (Demo)",
    status: "OPEN",
    jurisdiction: "Wayne County, Michigan",
    caseNumber: "2025-DEMO-123",
    decedentName: "John Q. Doe",
    dateOfDeath: new Date("2024-01-15"),
  })) as IdOnly;

  // 3) Primary residence property
  console.log("🌱 Seeding primary residence property...");
  const primaryResidence = (await EstateProperty.create({
    estateId: demoEstate._id,
    ownerId: demoUserId,
    label: "Demo Property – Primary Residence",
    propertyType: "single_family",
    street: "4395 Dickerson St",
    city: "Detroit",
    state: "MI",
    postalCode: "48215",
    isPrimaryResidence: true,
  })) as IdOnly;

  // 4) Utility accounts
  console.log("🌱 Seeding utility accounts...");

  const utilityAccounts = [
    {
      estateId: demoEstate._id,
      propertyId: primaryResidence._id,
      ownerId: demoUserId,
      utilityType: "electric",
      providerName: "DTE Energy",
      accountNumber: "DTE-123-456-789",
      status: "active",
      billingName: "Estate of John Q. Doe",
      email: "billing@dteenergy.test",
      phone: "313-555-1000",
      onlinePortalUrl: "https://my.dteenergy.com/login",
      isAutoPay: false,
      notes: "demo seed – electric service",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      estateId: demoEstate._id,
      propertyId: primaryResidence._id,
      ownerId: demoUserId,
      utilityType: "water",
      providerName: "Detroit Water & Sewerage",
      accountNumber: "DWSD-987-654-321",
      status: "active",
      billingName: "Estate of John Q. Doe",
      email: "billing@detroitwater.test",
      phone: "313-555-2000",
      onlinePortalUrl: "https://paydetroitwater.example.com",
      isAutoPay: false,
      notes: "demo seed – water/sewer",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  await UtilityAccount.insertMany(utilityAccounts);

  console.log("✅ Seed script completed successfully.");
}

seed()
  .then(() => mongoose.connection.close())
  .catch((err) => {
    console.error("❌ Seed script failed", err);
    mongoose.connection.close().finally(() => {
      process.exit(1);
    });
  });

// Make this file a module so top-level await / imports are allowed in TS
export {};
