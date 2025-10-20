/**
 * Multi-tenant test data seeding script
 *
 * Creates test data for cross-tenant access testing:
 * - Multiple companies
 * - Multiple facilities per company
 * - Test users for each facility
 */

import { db } from "../server/db";
import { companies, facilities, users } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedMultiTenantTestData() {
  console.log("🌱 Starting multi-tenant test data seeding...");

  try {
    // ========== Company 1: 東海メディカルグループ (Existing) ==========
    const tokaiCompanyResult = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, "tokai"))
      .limit(1);

    const tokaiCompany = tokaiCompanyResult[0];

    if (!tokaiCompany) {
      console.error("❌ Tokai company not found. Please run seed-database.ts first.");
      return;
    }

    console.log(`✅ Company: ${tokaiCompany.name} (${tokaiCompany.slug})`);

    // Get existing facilities
    const tokaiMintKoshigayaResult = await db
      .select()
      .from(facilities)
      .where(and(eq(facilities.slug, "mint-koshigaya"), eq(facilities.companyId, tokaiCompany.id)))
      .limit(1);

    const tokaiMintKoshigaya = tokaiMintKoshigayaResult[0];

    const tokaiGenkiKamifukuokaResult = await db
      .select()
      .from(facilities)
      .where(and(eq(facilities.slug, "genki-kamifukuoka"), eq(facilities.companyId, tokaiCompany.id)))
      .limit(1);

    const tokaiGenkiKamifukuoka = tokaiGenkiKamifukuokaResult[0];

    if (tokaiMintKoshigaya) {
      console.log(`  ✅ Facility: ${tokaiMintKoshigaya.name} (${tokaiMintKoshigaya.slug})`);
    }

    if (tokaiGenkiKamifukuoka) {
      console.log(`  ✅ Facility: ${tokaiGenkiKamifukuoka.name} (${tokaiGenkiKamifukuoka.slug})`);
    }

    // ========== Company 2: 関西ケアグループ (New) ==========
    console.log("\n📦 Creating new company: 関西ケアグループ");

    const [kansaiCompany] = await db
      .insert(companies)
      .values({
        name: "関西ケアグループ",
        slug: "kansai",
        domain: "kansai-care.example.com",
      })
      .onConflictDoUpdate({
        target: companies.slug,
        set: {
          name: "関西ケアグループ",
          domain: "kansai-care.example.com",
        }
      })
      .returning();

    console.log(`✅ Company created: ${kansaiCompany.name} (${kansaiCompany.slug})`);

    // Facility 1: 大阪ケアステーション
    // Check if facility already exists
    let osakaFacility = await db.query.facilities.findFirst({
      where: (f, { and, eq }) => and(
        eq(f.companyId, kansaiCompany.id),
        eq(f.slug, "osaka-care")
      )
    });

    if (!osakaFacility) {
      [osakaFacility] = await db
        .insert(facilities)
        .values({
          name: "大阪ケアステーション",
          slug: "osaka-care",
          companyId: kansaiCompany.id,
          isHeadquarters: false,
          address: "大阪府大阪市中央区本町1-2-3",
          phone: "06-1234-5678",
          email: "osaka@kansai-care.example.com",
        })
        .returning();
    }

    console.log(`  ✅ Facility: ${osakaFacility.name} (${osakaFacility.slug})`);

    // Facility 2: 神戸ケアステーション
    let kobeFacility = await db.query.facilities.findFirst({
      where: (f, { and, eq }) => and(
        eq(f.companyId, kansaiCompany.id),
        eq(f.slug, "kobe-care")
      )
    });

    if (!kobeFacility) {
      [kobeFacility] = await db
        .insert(facilities)
        .values({
          name: "神戸ケアステーション",
          slug: "kobe-care",
          companyId: kansaiCompany.id,
          isHeadquarters: false,
          address: "兵庫県神戸市中央区三宮町1-2-3",
          phone: "078-1234-5678",
          email: "kobe@kansai-care.example.com",
        })
        .returning();
    }

    console.log(`  ✅ Facility: ${kobeFacility.name} (${kobeFacility.slug})`);

    // Facility 3: 関西本社 (Headquarters)
    let kansaiHQ = await db.query.facilities.findFirst({
      where: (f, { and, eq }) => and(
        eq(f.companyId, kansaiCompany.id),
        eq(f.slug, "kansai-hq")
      )
    });

    if (!kansaiHQ) {
      [kansaiHQ] = await db
        .insert(facilities)
        .values({
          name: "関西ケアグループ本社",
          slug: "kansai-hq",
          companyId: kansaiCompany.id,
          isHeadquarters: true,
          address: "大阪府大阪市北区梅田1-1-1",
          phone: "06-0000-0000",
          email: "hq@kansai-care.example.com",
        })
        .returning();
    }

    console.log(`  ✅ Facility (HQ): ${kansaiHQ.name} (${kansaiHQ.slug})`);

    // ========== Create Test Users ==========
    console.log("\n👥 Creating test users...");

    const hashedPassword = await bcrypt.hash("password123", 10);

    // User 1: Nurse at Osaka Care Station
    await db
      .insert(users)
      .values({
        username: "nurse.osaka",
        email: "nurse.osaka@kansai-care.example.com",
        password: hashedPassword,
        fullName: "田中 花子",
        role: "nurse",
        accessLevel: "facility",
        facilityId: osakaFacility.id,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          email: "nurse.osaka@kansai-care.example.com",
          fullName: "田中 花子",
          facilityId: osakaFacility.id,
        }
      });

    console.log(`  ✅ User: nurse.osaka (大阪ケアステーション)`);

    // User 2: Admin at Kobe Care Station
    await db
      .insert(users)
      .values({
        username: "admin.kobe",
        email: "admin.kobe@kansai-care.example.com",
        password: hashedPassword,
        fullName: "鈴木 太郎",
        role: "admin",
        accessLevel: "facility",
        facilityId: kobeFacility.id,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          email: "admin.kobe@kansai-care.example.com",
          fullName: "鈴木 太郎",
          facilityId: kobeFacility.id,
        }
      });

    console.log(`  ✅ User: admin.kobe (神戸ケアステーション)`);

    // User 3: Corporate Admin at Kansai HQ
    await db
      .insert(users)
      .values({
        username: "corporate.kansai",
        email: "corporate@kansai-care.example.com",
        password: hashedPassword,
        fullName: "山田 一郎",
        role: "corporate_admin",
        accessLevel: "corporate",
        facilityId: kansaiHQ.id,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          email: "corporate@kansai-care.example.com",
          fullName: "山田 一郎",
          role: "corporate_admin",
          accessLevel: "corporate",
          facilityId: kansaiHQ.id,
        }
      });

    console.log(`  ✅ User: corporate.kansai (関西ケアグループ本社 - Corporate Admin)`);

    // ========== Summary ==========
    console.log("\n" + "=".repeat(60));
    console.log("✅ Multi-tenant test data seeding completed!");
    console.log("=".repeat(60));
    console.log("\n📊 Test Data Summary:");
    console.log("\n🏢 Companies:");
    console.log("  1. 東海メディカルグループ (tokai) - Existing");
    console.log("  2. 関西ケアグループ (kansai) - New");

    console.log("\n🏥 Facilities:");
    console.log("  東海メディカルグループ:");
    console.log("    - ミントクリニック越谷 (mint-koshigaya)");
    console.log("    - 元気クリニック上福岡 (genki-kamifukuoka)");
    console.log("  関西ケアグループ:");
    console.log("    - 大阪ケアステーション (osaka-care)");
    console.log("    - 神戸ケアステーション (kobe-care)");
    console.log("    - 関西ケアグループ本社 (kansai-hq) [Headquarters]");

    console.log("\n👤 Test Users (password: password123):");
    console.log("  東海メディカルグループ:");
    console.log("    - nurse.mint.koshigaya (ミントクリニック越谷 - Nurse)");
    console.log("    - admin.genki.kamifukuoka (元気クリニック上福岡 - Admin)");
    console.log("  関西ケアグループ:");
    console.log("    - nurse.osaka (大阪ケアステーション - Nurse)");
    console.log("    - admin.kobe (神戸ケアステーション - Admin)");
    console.log("    - corporate.kansai (関西本社 - Corporate Admin)");

    console.log("\n🧪 Cross-Tenant Testing URLs:");
    console.log("  東海 - ミント越谷:");
    console.log("    /tokai/mint-koshigaya/patients");
    console.log("  東海 - 元気上福岡:");
    console.log("    /tokai/genki-kamifukuoka/patients");
    console.log("  関西 - 大阪:");
    console.log("    /kansai/osaka-care/patients");
    console.log("  関西 - 神戸:");
    console.log("    /kansai/kobe-care/patients");

    console.log("\n✅ Ready for cross-tenant access testing!");

  } catch (error) {
    console.error("❌ Error seeding multi-tenant test data:", error);
    throw error;
  }
}

// Run the seeding function
seedMultiTenantTestData()
  .then(() => {
    console.log("\n✅ Seeding complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seeding failed:", error);
    process.exit(1);
  });
