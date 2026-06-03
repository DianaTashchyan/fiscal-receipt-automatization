import { PrismaClient, UserRole } from '@prisma/client'
import { hash } from 'bcryptjs'
import { createHash } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  // Refuse to create demo data when a real SRC credential is configured.
  // This prevents demo fixtures from leaking into production databases.
  const isConfiguredForProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.TAX_API_MODE === 'src_real' ||
    process.env.SRC_MODE === 'real'

  if (isConfiguredForProduction) {
    const force = process.env.SEED_FORCE === 'true'
    if (!force) {
      console.warn(
        '[seed] Running in production/real mode. Skipping demo data creation.\n' +
        '       Set SEED_FORCE=true to override (NOT recommended in production).'
      )
      return
    }
    console.warn('[seed] SEED_FORCE=true — creating demo data in production mode.')
  }

  console.log('Seeding database with demo fixtures...')

  const admin = await prisma.user.upsert({
    where: { email: 'admin@fiscal.am' },
    update: {},
    create: {
      email: 'admin@fiscal.am',
      passwordHash: await hash('admin123', 12),
      role: UserRole.ADMIN,
    },
  })

  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'demo-restaurant-1' },
    update: {},
    create: {
      id: 'demo-restaurant-1',
      name: 'Demo Restaurant',
      tin: '12345678',
      crn: 'HDM-001',
      address: 'Yerevan, Armenia',
      isActive: true,
    },
  })

  await prisma.userRestaurant.upsert({
    where: {
      userId_restaurantId: {
        userId: admin.id,
        restaurantId: restaurant.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      restaurantId: restaurant.id,
    },
  })

  const department = await prisma.department.upsert({
    where: { id: 'demo-dept-1' },
    update: {},
    create: {
      id: 'demo-dept-1',
      restaurantId: restaurant.id,
      name: 'Main Hall',
      taxDepartmentId: '1',
      taxRegime: '1',
      isDefault: true,
      isActive: true,
    },
  })

  await prisma.cashier.upsert({
    where: { id: 'demo-cashier-1' },
    update: {},
    create: {
      id: 'demo-cashier-1',
      restaurantId: restaurant.id,
      name: 'Default Cashier',
      taxCashierId: '3',
      pinCodeHash: await hash('1234', 12),
      isDefault: true,
      isActive: true,
    },
  })

  await prisma.product.upsert({
    where: { id: 'demo-product-1' },
    update: {},
    create: {
      id: 'demo-product-1',
      restaurantId: restaurant.id,
      departmentId: department.id,
      externalProductId: 'ext-prod-001',
      name: 'Margherita Pizza',
      goodCode: '2106-90',
      adgCode: '2106',
      unit: 'piece',
      price: 3500,
      isVariablePrice: false,
      isActive: true,
    },
  })

  await prisma.product.upsert({
    where: { id: 'demo-product-2' },
    update: {},
    create: {
      id: 'demo-product-2',
      restaurantId: restaurant.id,
      departmentId: department.id,
      externalProductId: 'ext-prod-002',
      name: 'House Wine',
      goodCode: '2204-21',
      adgCode: '2204',
      unit: 'piece',
      price: 1500,
      isVariablePrice: false,
      isActive: true,
    },
  })

  const demoRawKey = 'frk_demo_key_for_local_development_only'
  const demoKeyHash = createHash('sha256').update(demoRawKey).digest('hex')

  await prisma.restaurantApiKey.upsert({
    where: { keyHash: demoKeyHash },
    update: {},
    create: {
      restaurantId: restaurant.id,
      keyHash: demoKeyHash,
      label: 'Demo API Key',
      isActive: true,
    },
  })

  console.log('Seed complete.')
  console.log('Admin login: admin@fiscal.am / admin123')
  console.log(`Demo API key: ${demoRawKey}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
