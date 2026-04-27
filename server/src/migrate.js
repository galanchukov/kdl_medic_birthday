// server/src/migrate.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const doctorsJsonPath = path.join(__dirname, '../doctors.json');

async function main() {
  console.log('🔄 Starting migration from doctors.json to Database...');
  
  const rawData = fs.readFileSync(doctorsJsonPath, 'utf8');
  const doctors = JSON.parse(rawData);

  for (const doc of doctors) {
    try {
      await prisma.doctor.upsert({
        where: { id: doc.id },
        update: {
          name: doc.name,
          department: doc.department,
          clinic: doc.clinic,
          birthday: doc.birthday,
          phone: doc.phone,
          email: doc.email,
          photo: doc.photo,
          code: doc.code
        },
        create: {
          id: doc.id,
          name: doc.name,
          department: doc.department,
          clinic: doc.clinic,
          birthday: doc.birthday,
          phone: doc.phone,
          email: doc.email,
          photo: doc.photo,
          code: doc.code
        }
      });
      console.log(`✅ Migrated: ${doc.name}`);
    } catch (e) {
      console.error(`❌ Failed: ${doc.name}`, e);
    }
  }

  console.log('✨ Migration complete!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
