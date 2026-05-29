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
      email: 'owner@cestech.in',
      displayName: 'Owner Vikram',
      jobTitle: 'Project Owner / Director',
      gradeCode: 'L5',
      roles: ['PROJECT_OWNER' as const, 'APPROVER' as const],
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

  // ---- Engineer #2 for allocation/overlap demos ----
  await prisma.user.upsert({
    where: { email: 'engineer2@cestech.in' },
    update: { displayName: 'Eng Priya', roles: ['ENGINEER'] },
    create: {
      azureOid: 'dev-engineer2@cestech.in',
      email: 'engineer2@cestech.in',
      displayName: 'Eng Priya',
      jobTitle: 'Network Engineer',
      gradeId: grades.find((g) => g.code === 'L3')!.id,
      roles: ['ENGINEER'],
    },
  });

  // ---- Sample clients + end customer + project (so /projects has data) ----
  const nttClient = await prisma.client.upsert({
    where: { name: 'NTT Data' },
    update: { kind: 'SI' },
    create: { name: 'NTT Data', kind: 'SI' },
  });
  const airtelClient = await prisma.client.upsert({
    where: { name: 'Airtel Business' },
    update: { kind: 'SI' },
    create: { name: 'Airtel Business', kind: 'SI' },
  });
  const sbiEC = await prisma.endCustomer.upsert({
    where: { name: 'State Bank of India' },
    update: { industry: 'Banking' },
    create: { name: 'State Bank of India', industry: 'Banking' },
  });
  const aaiEC = await prisma.endCustomer.upsert({
    where: { name: 'Airports Authority of India' },
    update: { industry: 'Aviation' },
    create: { name: 'Airports Authority of India', industry: 'Aviation' },
  });

  const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner@cestech.in' } });
  const pm = await prisma.user.findFirstOrThrow({ where: { email: 'pm@cestech.in' } });
  const eng1 = await prisma.user.findFirstOrThrow({ where: { email: 'engineer@cestech.in' } });
  const eng2 = await prisma.user.findFirstOrThrow({ where: { email: 'engineer2@cestech.in' } });

  // Reset projects/tasks/timelogs/travel/expenses each seed run so the sample
  // data stays predictable. Order matters: child rows before parents.
  await prisma.receiptFlag.deleteMany({});
  await prisma.receipt.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.reimbursement.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.travelRequest.deleteMany({});
  await prisma.timeLog.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.allocation.deleteMany({});
  await prisma.milestone.deleteMany({});
  await prisma.projectSite.deleteMany({});
  await prisma.project.deleteMany({ where: { code: { in: ['SBI-ACI-001', 'AAI-SDWAN-002'] } } });

  const projectSeeds = [
    {
      code: 'SBI-ACI-001',
      name: 'SBI Mumbai DC — Cisco ACI rollout',
      clientId: nttClient.id,
      endCustomerId: sbiEC.id,
      whiteLabel: true,
      category: 'ACI' as const,
      billingModel: 'FIXED_PRICE' as const,
      contractValue: '4500000',
      contractCurrency: 'INR',
      pmId: pm.id,
      plannedStart: new Date('2025-04-01'),
      plannedEnd: new Date('2025-09-30'),
      status: 'ACTIVE' as const,
      milestones: [
        {
          name: 'LLD sign-off',
          value: '900000',
          plannedDate: '2025-05-15',
          signedOffDate: '2025-05-22',
        },
        {
          name: 'Fabric build + migration',
          value: '2700000',
          plannedDate: '2025-08-15',
          signedOffDate: null,
        },
        {
          name: 'Hand-over + closure',
          value: '900000',
          plannedDate: '2025-09-30',
          signedOffDate: null,
        },
      ],
      tasks: [
        {
          name: 'LLD document',
          status: 'DONE' as const,
          percentComplete: 100,
          assignee: eng1.id,
          hours: 16,
        },
        {
          name: 'Spine-leaf bring-up',
          status: 'IN_PROGRESS' as const,
          percentComplete: 60,
          assignee: eng1.id,
          hours: 24,
        },
        {
          name: 'VRF + bridge domain config',
          status: 'IN_PROGRESS' as const,
          percentComplete: 40,
          assignee: eng2.id,
          hours: 12,
        },
        {
          name: 'Migration cutover (Mumbai)',
          status: 'TODO' as const,
          percentComplete: 0,
          assignee: eng2.id,
          hours: 0,
        },
      ],
    },
    {
      code: 'AAI-SDWAN-002',
      name: 'AAI airports — SD-WAN rollout (40 sites)',
      clientId: airtelClient.id,
      endCustomerId: aaiEC.id,
      whiteLabel: false,
      category: 'SD_WAN' as const,
      billingModel: 'MILESTONE' as const,
      contractValue: '6800000',
      contractCurrency: 'INR',
      pmId: pm.id,
      plannedStart: new Date('2025-05-01'),
      plannedEnd: new Date('2025-12-31'),
      status: 'ACTIVE' as const,
      milestones: [
        {
          name: 'Design & pilot (1 site)',
          value: '1200000',
          plannedDate: '2025-06-15',
          signedOffDate: '2025-06-20',
        },
        {
          name: 'Wave 1 — 15 sites live',
          value: '2400000',
          plannedDate: '2025-09-30',
          signedOffDate: null,
        },
        {
          name: 'Wave 2 — 25 sites live',
          value: '2400000',
          plannedDate: '2025-11-30',
          signedOffDate: null,
        },
        { name: 'Final closure', value: '800000', plannedDate: '2025-12-31', signedOffDate: null },
      ],
      tasks: [
        {
          name: 'Design template',
          status: 'DONE' as const,
          percentComplete: 100,
          assignee: pm.id,
          hours: 8,
        },
        {
          name: 'Pilot site (Delhi)',
          status: 'DONE' as const,
          percentComplete: 100,
          assignee: eng1.id,
          hours: 20,
        },
        {
          name: 'Wave-1 deployment',
          status: 'IN_PROGRESS' as const,
          percentComplete: 35,
          assignee: eng2.id,
          hours: 40,
        },
        {
          name: 'Wave-2 deployment',
          status: 'TODO' as const,
          percentComplete: 0,
          assignee: eng2.id,
          hours: 0,
        },
      ],
    },
  ];

  for (const p of projectSeeds) {
    const proj = await prisma.project.create({
      data: {
        code: p.code,
        name: p.name,
        clientId: p.clientId,
        endCustomerId: p.endCustomerId,
        whiteLabel: p.whiteLabel,
        category: p.category,
        billingModel: p.billingModel,
        contractValue: p.contractValue,
        contractCurrency: p.contractCurrency,
        pmId: p.pmId,
        // Slice 2B: Owner Vikram owns both seeded projects; budget = 8% of contract.
        ownerId: owner.id,
        budget: (Number(p.contractValue) * 0.08).toFixed(2),
        budgetCurrency: 'INR',
        plannedStart: p.plannedStart,
        plannedEnd: p.plannedEnd,
        status: p.status,
        milestones: {
          create: p.milestones.map((m) => ({
            name: m.name,
            value: m.value,
            currency: 'INR',
            plannedDate: new Date(m.plannedDate),
            signedOffDate: m.signedOffDate ? new Date(m.signedOffDate) : null,
          })),
        },
      },
    });

    for (const t of p.tasks) {
      const task = await prisma.task.create({
        data: {
          projectId: proj.id,
          name: t.name,
          status: t.status,
          percentComplete: t.percentComplete,
          assigneeId: t.assignee,
        },
      });
      if (t.hours > 0) {
        // Spread the hours across a few days starting 7 days ago so the P&L has data.
        const days = Math.ceil(t.hours / 8);
        const per = t.hours / days;
        for (let i = 0; i < days; i++) {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - (days - i));
          await prisma.timeLog.create({
            data: {
              taskId: task.id,
              userId: t.assignee,
              date: d,
              hours: per.toFixed(2),
            },
          });
        }
      }
    }

    // Allocate engineers to the project (current month).
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    await prisma.allocation.createMany({
      data: [
        { userId: eng1.id, projectId: proj.id, percentAllocation: 50, periodStart, periodEnd },
        { userId: eng2.id, projectId: proj.id, percentAllocation: 50, periodStart, periodEnd },
      ],
    });
  }
  console.info(`  ${projectSeeds.length} projects with milestones, tasks, time logs, allocations`);

  // ---- Phase 2C: sample attendance events + derived days + 1 open regularize ----
  await prisma.attendanceDay.deleteMany({});
  await prisma.attendanceEvent.deleteMany({});
  await prisma.attendanceRegularization.deleteMany({});

  // Pick the first project + first site for engineers' check-ins.
  const sbiProject = await prisma.project.findFirstOrThrow({ where: { code: 'SBI-ACI-001' } });
  // Ensure SBI has a Mumbai site + geofence so attendance has a target.
  const mumbaiCity = await prisma.city.findFirstOrThrow({
    where: { name: 'Mumbai', country: 'IN' },
  });
  const sbiSite = await prisma.projectSite.upsert({
    where: { id: '00000000-0000-0000-0000-000000005bb1' },
    update: { siteName: 'SBI Mumbai DC', address: 'Belapur, Navi Mumbai' },
    create: {
      id: '00000000-0000-0000-0000-000000005bb1',
      projectId: sbiProject.id,
      siteName: 'SBI Mumbai DC',
      cityId: mumbaiCity.id,
      address: 'Belapur, Navi Mumbai',
    },
  });
  await prisma.geofence.deleteMany({ where: { projectSiteId: sbiSite.id } });
  await prisma.geofence.create({
    data: {
      projectSiteId: sbiSite.id,
      centerLat: '19.018600',
      centerLng: '73.029700',
      radiusMeters: 200,
    },
  });

  // Synthesize the last 5 weekdays of events for engineer #1.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  for (let back = 1; back <= 7; back++) {
    const d = new Date(today.getTime() - back * dayMs);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue; // skip weekends
    // engineer #1: full on-site day with geofence pair
    const enter = new Date(d.getTime() + 9.5 * 3600 * 1000);
    const exit = new Date(d.getTime() + 18 * 3600 * 1000);
    await prisma.attendanceEvent.createMany({
      data: [
        {
          userId: eng1.id,
          kind: 'CHECK_IN',
          occurredAt: enter,
          lat: '19.018700',
          lng: '73.029500',
          accuracyMeters: 8,
          projectSiteId: sbiSite.id,
          source: 'MOBILE',
        },
        {
          userId: eng1.id,
          kind: 'GEOFENCE_ENTER',
          occurredAt: enter,
          projectSiteId: sbiSite.id,
          source: 'SYSTEM',
        },
        {
          userId: eng1.id,
          kind: 'GEOFENCE_EXIT',
          occurredAt: exit,
          projectSiteId: sbiSite.id,
          source: 'SYSTEM',
        },
        {
          userId: eng1.id,
          kind: 'CHECK_OUT',
          occurredAt: exit,
          lat: '19.018800',
          lng: '73.029400',
          accuracyMeters: 10,
          projectSiteId: sbiSite.id,
          source: 'MOBILE',
        },
      ],
    });
  }
  // engineer #2: today is a REMOTE day (only check-in, no geofence proximity).
  const ydayMid = new Date(today.getTime() - dayMs + 10 * 3600 * 1000);
  const ydayEnd = new Date(today.getTime() - dayMs + 17 * 3600 * 1000);
  await prisma.attendanceEvent.createMany({
    data: [
      {
        userId: eng2.id,
        kind: 'CHECK_IN',
        occurredAt: ydayMid,
        lat: '28.535000',
        lng: '77.391000',
        accuracyMeters: 25,
        source: 'MOBILE',
      },
      {
        userId: eng2.id,
        kind: 'CHECK_OUT',
        occurredAt: ydayEnd,
        lat: '28.535100',
        lng: '77.391100',
        accuracyMeters: 25,
        source: 'MOBILE',
      },
    ],
  });

  // Recompute day rows for both engineers across the last 8 days.
  // We mirror the service's derivation by going through the same code path
  // — calling prisma directly here keeps the seed dependency-free, so we
  // hand-derive a minimal day row instead.
  async function recomputeForRange(userId: string, days: number) {
    for (let back = 0; back <= days; back++) {
      const d = new Date(today.getTime() - back * dayMs);
      const next = new Date(d.getTime() + dayMs);
      const events = await prisma.attendanceEvent.findMany({
        where: { userId, occurredAt: { gte: d, lt: next } },
        orderBy: { occurredAt: 'asc' },
      });
      if (events.length === 0) continue;
      let onSiteMinutes = 0;
      let open: Date | null = null;
      const siteIds = new Set<string>();
      let first = events[0]!.occurredAt;
      let last = events[events.length - 1]!.occurredAt;
      let hasIn = false;
      let hasOut = false;
      for (const e of events) {
        if (e.projectSiteId) siteIds.add(e.projectSiteId);
        if (e.kind === 'CHECK_IN') hasIn = true;
        if (e.kind === 'CHECK_OUT') hasOut = true;
        if (e.kind === 'GEOFENCE_ENTER') open = e.occurredAt;
        else if (e.kind === 'GEOFENCE_EXIT' && open) {
          onSiteMinutes += Math.round((e.occurredAt.getTime() - open.getTime()) / 60000);
          open = null;
        }
      }
      let status: 'ON_SITE' | 'PARTIAL' | 'REMOTE' = 'REMOTE';
      let note = 'REMOTE: events recorded but no geofence proximity.';
      if (onSiteMinutes >= 240) {
        status = 'ON_SITE';
        note = `ON_SITE: ${Math.floor(onSiteMinutes / 60)}h ${onSiteMinutes % 60}m inside ${siteIds.size} project site${siteIds.size === 1 ? '' : 's'}.`;
      } else if (hasIn && !hasOut) {
        status = 'PARTIAL';
        note = `PARTIAL: check-in at ${first.toISOString()} but no check-out by end of day.`;
      }
      await prisma.attendanceDay.upsert({
        where: { userId_date: { userId, date: d } },
        create: {
          userId,
          date: d,
          firstEventAt: first,
          lastEventAt: last,
          onSiteMinutes,
          projectSiteIds: Array.from(siteIds),
          status,
          eventCount: events.length,
          derivationNote: note,
        },
        update: {
          firstEventAt: first,
          lastEventAt: last,
          onSiteMinutes,
          projectSiteIds: Array.from(siteIds),
          status,
          eventCount: events.length,
          derivationNote: note,
        },
      });
    }
  }
  await recomputeForRange(eng1.id, 8);
  await recomputeForRange(eng2.id, 2);

  // One open regularize from eng2 for the day they were marked REMOTE — claims
  // it was actually a customer-site visit not covered by a geofence.
  const remoteDay = new Date(today.getTime() - dayMs);
  await prisma.attendanceRegularization.create({
    data: {
      userId: eng2.id,
      date: remoteDay,
      reason: 'SITE_VISIT_NOT_GEOFENCED',
      notes: 'On-site at AAI Mumbai office (T2). No geofence configured for this customer site yet.',
      projectId: sbiProject.id,
      status: 'SUBMITTED',
    },
  });
  console.info('  Attendance: 5 days of on-site events for eng1, 1 remote day + open regularize for eng2');

  // ---- Phase 2D: Project baselines + 1 sample CR ----
  await prisma.changeRequest.deleteMany({});
  await prisma.projectBaseline.deleteMany({});
  const allProjects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: { milestones: true },
  });
  for (const p of allProjects) {
    await prisma.projectBaseline.create({
      data: {
        projectId: p.id,
        contractValue: p.contractValue,
        contractCurrency: p.contractCurrency,
        budget: p.budget,
        budgetCurrency: p.budgetCurrency,
        plannedStart: p.plannedStart,
        plannedEnd: p.plannedEnd,
        scopeSummary: `Baseline for ${p.code} at project creation.`,
        milestonesJson: p.milestones.map((m) => ({
          name: m.name,
          value: m.value.toString(),
          currency: m.currency,
          plannedDate: m.plannedDate.toISOString().slice(0, 10),
        })),
      },
    });
  }
  // Sample SUBMITTED CR on the SBI project — Owner gets to decide.
  await prisma.changeRequest.create({
    data: {
      projectId: sbiProject.id,
      code: 'CR-001',
      title: 'Scope add: HA pair upgrade for Mumbai DC',
      type: 'MIXED',
      reason: 'Client asked for HA pair (was single device in original SOW).',
      contractValueDelta: '450000',
      budgetDelta: '60000',
      daysDelta: 21,
      scopeDelta: 'Add HA pair for Mumbai DC spine, additional config + cutover window.',
      status: 'SUBMITTED',
      createdById: pm.id,
      submittedAt: new Date(),
    },
  });
  console.info('  Change requests: baselines for all projects + 1 SUBMITTED CR on SBI');

  // ---- Phase 2E: Anomaly rules + sample comments ----
  await prisma.anomaly.deleteMany({});
  await prisma.anomalyRule.deleteMany({});
  const ruleSeeds: Array<{
    kind:
      | 'RECEIPT_DUPLICATE'
      | 'RECEIPT_AMOUNT_MISMATCH'
      | 'ALLOCATION_OVERBOOK'
      | 'PROJECT_OVER_BUDGET'
      | 'PROJECT_MARGIN_RED'
      | 'ATTENDANCE_NO_PUNCH'
      | 'ATTENDANCE_REGULARIZATION_STALE';
    name: string;
    description: string;
    severity: 'INFO' | 'WARN' | 'CRITICAL';
    config: Record<string, unknown>;
  }> = [
    {
      kind: 'RECEIPT_DUPLICATE',
      name: 'Duplicate receipt content',
      description: 'Two receipts share the same SHA-256 or perceptual hash.',
      severity: 'CRITICAL',
      config: {},
    },
    {
      kind: 'RECEIPT_AMOUNT_MISMATCH',
      name: 'Claimed amount > OCR amount',
      description: 'The entered expense amount exceeds the OCR-detected receipt amount.',
      severity: 'WARN',
      config: { tolerancePercent: 5 },
    },
    {
      kind: 'ALLOCATION_OVERBOOK',
      name: 'Engineer allocated > 100%',
      description: 'Sum of active allocations for an engineer this month exceeds 100%.',
      severity: 'WARN',
      config: {},
    },
    {
      kind: 'PROJECT_OVER_BUDGET',
      name: 'Project cost exceeds budget',
      description: 'Live P&L cost is over the Owner-set project budget.',
      severity: 'CRITICAL',
      config: {},
    },
    {
      kind: 'PROJECT_MARGIN_RED',
      name: 'Project margin in the red zone',
      description: 'Computed margin % is below the configured threshold.',
      severity: 'WARN',
      config: { marginPercentBelow: 10 },
    },
    {
      kind: 'ATTENDANCE_NO_PUNCH',
      name: 'No attendance punch on a workday',
      description: 'No attendance events on a weekday for an active engineer.',
      severity: 'INFO',
      config: {},
    },
    {
      kind: 'ATTENDANCE_REGULARIZATION_STALE',
      name: 'Regularization stuck > 3 days',
      description: 'A submitted regularization has been waiting more than 3 days for a decision.',
      severity: 'WARN',
      config: { thresholdDays: 3 },
    },
  ];
  for (const r of ruleSeeds) {
    await prisma.anomalyRule.create({ data: r });
  }
  console.info(`  ${ruleSeeds.length} anomaly rules`);

  // Sample comments on the open CR + on the SBI project.
  await prisma.comment.deleteMany({});
  const cr = await prisma.changeRequest.findFirstOrThrow({
    where: { projectId: sbiProject.id, code: 'CR-001' },
  });
  await prisma.comment.create({
    data: {
      entityKind: 'CHANGE_REQUEST',
      entityId: cr.id,
      changeRequestId: cr.id,
      authorId: pm.id,
      body: 'Submitting for Owner decision — customer mail dated 2026-05-20.',
    },
  });
  await prisma.comment.create({
    data: {
      entityKind: 'PROJECT',
      entityId: sbiProject.id,
      authorId: owner.id,
      body: 'Cutover window is tight in August — confirm bandwidth.',
    },
  });
  console.info('  Comments: 1 on CR-001, 1 on SBI project');

  console.info('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
