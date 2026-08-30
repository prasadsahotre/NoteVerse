import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

const connectionString = process.env.DATABASE_URL!

const adapter = new PrismaPg({
  connectionString,
})

const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.role.upsert({
    where: { name: 'EDUCATOR' },
    update: {},
    create: { name: 'EDUCATOR' },
  })

  await prisma.role.upsert({
    where: { name: 'STUDENT' },
    update: {},
    create: { name: 'STUDENT' },
  })

  console.log('Roles seeded successfully')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })