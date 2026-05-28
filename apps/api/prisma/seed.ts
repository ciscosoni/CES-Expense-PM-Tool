/* eslint-disable no-console */
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed sample master data so the UI is clickable immediately on a fresh DB.
 *
 * Idempotent: re-running upserts rather than duplicating.
 *
 * Numbers below are placeholders for development only. Production rates,
 * per-diems, and entitlements come from admin configuration (CLAUDE.md §10 #1).
 */
async function main() {
  console.info('Seeding master data...');

  // ---- Grades (L1 Engineer … L5 Manager) ----
  const grades = await Promise.all(
    [
      { code: 'L1', name: 'Junior Engineer', seniorityOrder: 1 },
      { code: 'L2', name: 'Engineer', seniorityOrder: 2 },
      { code: 'L3', name: 'Senior Engineer', seniorityOrder: 3 },
      { code: 'L4', name: 'Lead Engineer', seniorityOrder: 4 },
      { code: 'L5', name: 'Manager', seniorityOrder: 5 },
    ].map((g) => prisma.grade.upsert({ where: { code: g.code }, update: g, create: g })),
  );
  console.info(`  ${grades.length} grades`);

  // ---- Cost rates per grade (INR per day, current effective date 2025-04-01) ----
  const costRateInputs: { gradeCode: string; ratePerDay: string }[] = [
    { gradeCode: 'L1', ratePerDay: '4000' },
    { gradeCode: 'L2', ratePerDay: '6000' },
    { gradeCode: 'L3', ratePerDay: '9000' },
    { gradeCode: 'L4', ratePerDay: '14000' },
    { gradeCode: 'L5', ratePerDay: '20000' },
  ];
  await prisma.costRate.deleteMany({}); // dev-only reset for simplicity
  for (const c of costRateInputs) {
    const grade = grades.find((g) => g.code === c.gradeCode)!;
    await prisma.costRate.create({
      data: {
        gradeId: grade.id,
        ratePerDay: c.ratePerDay,
        currency: 'INR',
        effectiveFrom: new Date('2025-04-01'),
      },
    });
  }
  console.info(`  ${costRateInputs.length} cost rates`);

  // ---- Cities (a representative slice across tiers) ----
  const cities: {
    name: string;
    state?: string;
    country: string;
    tier: 'METRO' | 'TIER_2' | 'TIER_3' | 'INTERNATIONAL';
  }[] = [
    { name: 'Delhi', state: 'DL', country: 'IN', tier: 'METRO' },
    { name: 'Mumbai', state: 'MH', country: 'IN', tier: 'METRO' },
    { name: 'Bengaluru', state: 'KA', country: 'IN', tier: 'METRO' },
    { name: 'Hyderabad', state: 'TG', country: 'IN', tier: 'METRO' },
    { name: 'Pune', state: 'MH', country: 'IN', tier: 'TIER_2' },
    { name: 'Ahmedabad', state: 'GJ', country: 'IN', tier: 'TIER_2' },
    { name: 'Lucknow', state: 'UP', country: 'IN', tier: 'TIER_2' },
    { name: 'Bhopal', state: 'MP', country: 'IN', tier: 'TIER_3' },
    { name: 'Patna', state: 'BR', country: 'IN', tier: 'TIER_3' },
    { name: 'Singapore', country: 'SG', tier: 'INTERNATIONAL' },
  ];
  for (const c of cities) {
    await prisma.city.upsert({
      where: { name_country: { name: c.name, country: c.country } },
      update: c,
      create: c,
    });
  }
  console.info(`  ${cities.length} cities`);

  // ---- Entitlement matrix (grade × city tier) ----
  await prisma.entitlementMatrixRow.deleteMany({});
  const entitlements: {
    gradeCode: string;
    cityTier: 'METRO' | 'TIER_2' | 'TIER_3' | 'INTERNATIONAL';
    perDiem: string;
    lodgingCap: string;
    travelClass: Prisma.EntitlementMatrixRowCreateInput['travelClass'];
    localConveyanceCap: string;
  }[] = [
    // L1
    {
      gradeCode: 'L1',
      cityTier: 'METRO',
      perDiem: '1200',
      lodgingCap: '3500',
      travelClass: 'TRAIN_3AC',
      localConveyanceCap: '400',
    },
    {
      gradeCode: 'L1',
      cityTier: 'TIER_2',
      perDiem: '1000',
      lodgingCap: '2800',
      travelClass: 'TRAIN_3AC',
      localConveyanceCap: '350',
    },
    {
      gradeCode: 'L1',
      cityTier: 'TIER_3',
      perDiem: '800',
      lodgingCap: '2200',
      travelClass: 'TRAIN_3AC',
      localConveyanceCap: '300',
    },
    // L2
    {
      gradeCode: 'L2',
      cityTier: 'METRO',
      perDiem: '1500',
      lodgingCap: '4500',
      travelClass: 'TRAIN_2AC',
      localConveyanceCap: '500',
    },
    {
      gradeCode: 'L2',
      cityTier: 'TIER_2',
      perDiem: '1200',
      lodgingCap: '3500',
      travelClass: 'TRAIN_2AC',
      localConveyanceCap: '400',
    },
    {
      gradeCode: 'L2',
      cityTier: 'TIER_3',
      perDiem: '1000',
      lodgingCap: '2800',
      travelClass: 'TRAIN_2AC',
      localConveyanceCap: '350',
    },
    // L3
    {
      gradeCode: 'L3',
      cityTier: 'METRO',
      perDiem: '2000',
      lodgingCap: '6000',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '700',
    },
    {
      gradeCode: 'L3',
      cityTier: 'TIER_2',
      perDiem: '1700',
      lodgingCap: '4500',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '600',
    },
    {
      gradeCode: 'L3',
      cityTier: 'TIER_3',
      perDiem: '1500',
      lodgingCap: '3500',
      travelClass: 'TRAIN_2AC',
      localConveyanceCap: '500',
    },
    // L4
    {
      gradeCode: 'L4',
      cityTier: 'METRO',
      perDiem: '2500',
      lodgingCap: '8000',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '900',
    },
    {
      gradeCode: 'L4',
      cityTier: 'TIER_2',
      perDiem: '2000',
      lodgingCap: '6000',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '700',
    },
    {
      gradeCode: 'L4',
      cityTier: 'TIER_3',
      perDiem: '1800',
      lodgingCap: '4500',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '600',
    },
    // L5
    {
      gradeCode: 'L5',
      cityTier: 'METRO',
      perDiem: '3000',
      lodgingCap: '10000',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '1200',
    },
    {
      gradeCode: 'L5',
      cityTier: 'TIER_2',
      perDiem: '2500',
      lodgingCap: '7500',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '900',
    },
    {
      gradeCode: 'L5',
      cityTier: 'TIER_3',
      perDiem: '2000',
      lodgingCap: '5500',
      travelClass: 'FLIGHT_ECONOMY',
      localConveyanceCap: '700',
    },
  ];
  for (const e of entitlements) {
    const grade = grades.find((g) => g.code === e.gradeCode)!;
    await prisma.entitlementMatrixRow.create({
      data: {
        gradeId: grade.id,
        cityTier: e.cityTier,
        perDiemAmount: e.perDiem,
        perDiemCurrency: 'INR',
        lodgingCapPerNight: e.lodgingCap,
        lodgingCurrency: 'INR',
        travelClass: e.travelClass,
        localConveyanceCapPerDay: e.localConveyanceCap,
        localConveyanceCurrency: 'INR',
        effectiveFrom: new Date('2025-04-01'),
      },
    });
  }
  console.info(`  ${entitlements.length} entitlement matrix rows`);

  // ---- DA policy (standard 50% on departure & return days) ----
  await prisma.daPolicy.deleteMany({});
  await prisma.daPolicy.create({
    data: {
      name: 'Standard 50% partial day',
      partialDayPercent: '0.5',
      intraCitySameDayPaysDa: false,
      effectiveFrom: new Date('2025-04-01'),
    },
  });
  console.info('  1 DA policy');

  // ---- Sample users (one per role; admin email matches DEV_AUTH_DEFAULT_EMAIL) ----
  const userInputs = [
    {
      email: 'admin@cestech.in',
      displayName: 'Admin Singh',
      jobTitle: 'Admin',
      roles: ['ADMIN' as const],
    },
    {
      email: 'finance@cestech.in',
      displayName: 'Finance Bhargav',
      jobTitle: 'Finance Manager',
      roles: ['FINANCE' as const],
    },
    {
      email: 'pm@cestech.in',
      displayName: 'PM Aishwarya',
      jobTitle: 'Project Manager',
      gradeCode: 'L5',
      roles: ['PROJECT_MANAGER' as const, 'APPROVER' as const],
    },
    {
      email: 'engineer@cestech.in',
      displayName: 'Eng Rohit',
      jobTitle: 'Network Engineer',
      gradeCode: 'L2',
      roles: ['ENGINEER' as const],
    },
  ];
  for (const u of userInputs) {
    const grade = u.gradeCode ? grades.find((g) => g.code === u.gradeCode) : undefined;
    await prisma.user.upsert({
      where: { email: u.email },
      update: { displayName: u.displayName, roles: u.roles, gradeId: grade?.id ?? null },
      create: {
        azureOid: `dev-${u.email}`,
        email: u.email,
        displayName: u.displayName,
        jobTitle: u.jobTitle,
        roles: u.roles,
        gradeId: grade?.id ?? null,
      },
    });
  }
  console.info(`  ${userInputs.length} users (including admin@cestech.in for dev auth)`);

  console.info('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
