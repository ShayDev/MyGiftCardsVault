const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  // Create a demo family
  const family = await prisma.familyGroup.create({
    data: { name: "Demo Family" },
  });

  console.log("FAMILY_ID:" + family.id);

  // Gift cards
  const cardA = await prisma.giftCard.create({
    data: {
      familyId: family.id,
      name: "Amazon Gift Card",
      provider: "Amazon",
      last4: "4242",
      isReloadable: true,
    },
  });

  const cardB = await prisma.giftCard.create({
    data: {
      familyId: family.id,
      name: "Bookstore Card",
      provider: "LocalBooks",
      last4: "0007",
      isReloadable: false,
    },
  });

  // Transactions: amounts as strings to preserve Decimal precision
  await prisma.transaction.create({
    data: {
      giftCardId: cardA.id,
      type: "RECHARGE",
      amount: "150.00",
      notes: "Initial load",
    },
  });

  await prisma.transaction.create({
    data: {
      giftCardId: cardA.id,
      type: "SPEND",
      amount: "25.50",
      notes: "Groceries",
    },
  });

  await prisma.transaction.create({
    data: {
      giftCardId: cardB.id,
      type: "RECHARGE",
      amount: "50.00",
      notes: "Gift",
    },
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
