import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { facilities, users } from '../shared/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seedDatabase() {
  try {
    console.log('Starting database seed...');

    // Create default facility
    const facilityData = {
      id: '1',
      name: 'デフォルト施設',
      address: '東京都港区虎ノ門1-2-3',
      phone: '03-1234-5678',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.insert(facilities).values(facilityData).onConflictDoNothing();
    console.log('Created facility:', facilityData.name);

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminData = {
      id: '1',
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      fullName: '管理者',
      role: 'admin' as const,
      isActive: true,
      facilityId: '1',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.insert(users).values(adminData).onConflictDoNothing();
    console.log('Created admin user:', adminData.email);

    console.log('Database seed completed successfully!');
    console.log('\nLogin credentials:');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();