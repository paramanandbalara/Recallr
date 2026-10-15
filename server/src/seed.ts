import { db } from './db.js';

// Example plans to start from; change prices and limits in the admin panel
const PLANS = [
  { name: 'Starter', description: 'Try it for a week of interviews.', pricePaise: 29900, durationDays: 7, listeningMinutes: 120, tokenLimit: 300_000, sortOrder: 1 },
  { name: 'Pro', description: 'A month of interviews and practice.', pricePaise: 79900, durationDays: 30, listeningMinutes: 600, tokenLimit: 2_000_000, sortOrder: 2 },
  { name: 'Top-up', description: '3 more hours, valid 30 days.', pricePaise: 19900, durationDays: 30, listeningMinutes: 180, tokenLimit: 600_000, sortOrder: 3 },
];

// Every new account gets this once; turn it off or change it under Admin → Plans
const TRIAL = {
  name: 'Free trial', description: '30 minutes of listening to try Recallr in a mock or real interview.',
  pricePaise: 0, durationDays: 3, listeningMinutes: 30, tokenLimit: 100_000, isTrial: true, sortOrder: 0,
};

if ((await db.plan.count({ where: { isTrial: false } })) === 0) {
  await db.plan.createMany({ data: PLANS });
  console.log(`Added ${PLANS.length} example plans.`);
} else {
  console.log('Plans already exist; none added.');
}
if ((await db.plan.count({ where: { isTrial: true } })) === 0) {
  await db.plan.create({ data: TRIAL });
  console.log('Added the free trial.');
}
await db.$disconnect();
