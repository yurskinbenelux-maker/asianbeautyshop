// Quick read-only script — pulls the most recent
// sendcloud.parcel.failed events and prints their full message + metadata
// so we can see why the Sendcloud API call failed.
//
// Run: pnpm tsx scripts/check-sendcloud-failure.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.orderEvent.findMany({
    where: { kind: "sendcloud.parcel.failed" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      order: { select: { publicNumber: true, email: true, status: true } },
    },
  });

  if (events.length === 0) {
    console.log("No sendcloud.parcel.failed events found.");
    return;
  }

  for (const e of events) {
    console.log("─".repeat(72));
    console.log(`Order: ${e.order.publicNumber} (${e.order.email}) status=${e.order.status}`);
    console.log(`When: ${e.createdAt.toISOString()}`);
    console.log(`Message: ${e.message ?? "(empty)"}`);
    console.log(`Metadata:`);
    console.log(JSON.stringify(e.metadata, null, 2));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
