import { db } from '../server/db';
import { companies, facilities, users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  try {
    // Create tables manually to ensure they exist
    console.log('Creating database schema...');

    // Create user_role enum
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'nurse', 'manager', 'corporate_admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create user_access_level enum
    await db.execute(`
      DO $$ BEGIN
        CREATE TYPE user_access_level AS ENUM ('facility', 'corporate');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create companies table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        domain text NOT NULL UNIQUE,
        address text,
        phone text,
        email text,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
      );
    `);

    // Create facilities table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS facilities (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id varchar NOT NULL REFERENCES companies(id),
        name text NOT NULL,
        slug text NOT NULL,
        is_headquarters boolean NOT NULL DEFAULT false,
        address text,
        phone text,
        email text,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
      );
    `);

    // Add access_level column to users table
    await db.execute(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS access_level user_access_level DEFAULT 'facility';
    `);

    // 1. Create company
    console.log('📊 Creating company...');
    const existingCompany = await db.select().from(companies).where(eq(companies.domain, 'localhost'));

    let company;
    if (existingCompany.length === 0) {
      const [newCompany] = await db.insert(companies).values({
        name: 'NASRECO株式会社',
        domain: 'localhost',
        address: '東京都港区虎ノ門1-1-1',
        phone: '03-1234-5678',
        email: 'contact@nasreco.com',
      }).returning();
      company = newCompany;
    } else {
      company = existingCompany[0];
    }
    console.log(`✅ Company: ${company.name} (ID: ${company.id})`);

    // 2. Create facilities
    console.log('🏢 Creating facilities...');
    const facilitiesData = [
      {
        companyId: company.id,
        name: '本社',
        slug: 'headquarters',
        isHeadquarters: true,
        address: '東京都港区虎ノ門1-1-1',
        phone: '03-1234-5678',
        email: 'headquarters@nasreco.com',
      },
      {
        companyId: company.id,
        name: '東京本院',
        slug: 'tokyo-honin',
        isHeadquarters: false,
        address: '東京都渋谷区神宮前2-2-2',
        phone: '03-2345-6789',
        email: 'tokyo@nasreco.com',
      },
      {
        companyId: company.id,
        name: 'さくら訪問看護ステーション',
        slug: 'sakura-station',
        isHeadquarters: false,
        address: '東京都世田谷区三軒茶屋3-3-3',
        phone: '03-3456-7890',
        email: 'sakura@nasreco.com',
      },
    ];

    const facilityObjects = [];
    for (const facilityData of facilitiesData) {
      const existingFacility = await db.select()
        .from(facilities)
        .where(eq(facilities.slug, facilityData.slug));

      if (existingFacility.length === 0) {
        const [newFacility] = await db.insert(facilities).values(facilityData).returning();
        facilityObjects.push(newFacility);
        console.log(`✅ Facility: ${newFacility.name} (/${newFacility.slug})`);
      } else {
        facilityObjects.push(existingFacility[0]);
        console.log(`⚠️  Facility already exists: ${existingFacility[0].name}`);
      }
    }

    // 3. Create test users
    console.log('👤 Creating test users...');
    const hashedPassword = await bcrypt.hash('password123', 10);

    const usersData = [
      {
        facilityId: facilityObjects[0].id, // Headquarters
        username: 'admin',
        password: hashedPassword,
        email: 'admin@nasreco.com',
        fullName: '管理者 太郎',
        role: 'corporate_admin' as const,
        accessLevel: 'corporate' as const,
        phone: '03-1111-1111',
        isActive: true,
      },
      {
        facilityId: facilityObjects[1].id, // Tokyo
        username: 'tokyo-admin',
        password: hashedPassword,
        email: 'tokyo-admin@nasreco.com',
        fullName: '東京 花子',
        role: 'admin' as const,
        accessLevel: 'facility' as const,
        phone: '03-2222-2222',
        isActive: true,
      },
      {
        facilityId: facilityObjects[2].id, // Sakura
        username: 'sakura-admin',
        password: hashedPassword,
        email: 'sakura-admin@nasreco.com',
        fullName: 'さくら 次郎',
        role: 'admin' as const,
        accessLevel: 'facility' as const,
        phone: '03-3333-3333',
        isActive: true,
      },
    ];

    for (const userData of usersData) {
      const existingUser = await db.select()
        .from(users)
        .where(eq(users.username, userData.username));

      if (existingUser.length === 0) {
        const [newUser] = await db.insert(users).values(userData).returning();
        console.log(`✅ User: ${newUser.fullName} (${newUser.username}) - ${newUser.role}`);
      } else {
        console.log(`⚠️  User already exists: ${existingUser[0].username}`);
      }
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Test Accounts:');
    console.log('Corporate Admin: admin / password123');
    console.log('Tokyo Admin: tokyo-admin / password123');
    console.log('Sakura Admin: sakura-admin / password123');
    console.log('\n🌐 URLs:');
    console.log('Headquarters: http://headquarters.localhost:5000');
    console.log('Tokyo: http://tokyo-honin.localhost:5000');
    console.log('Sakura: http://sakura-station.localhost:5000');

    process.exit(0);
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();