import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

type CardBalance = {
  giftCardId: string;
  balance: Prisma.Decimal;
};

/**
 * Get balances for a list of gift card IDs using grouped aggregates.
 * Returns a map of giftCardId -> Decimal balance (recharge - spend).
 */
export async function getBalancesForCards(cardIds: string[]) {
  if (!cardIds?.length) return new Map<string, Prisma.Decimal>();

  const groups = await prisma.transaction.groupBy({
    by: ["giftCardId", "type"],
    where: { giftCardId: { in: cardIds } },
    _sum: { amount: true },
  });

  const map = new Map<string, Prisma.Decimal>();

  for (const id of cardIds) {
    const rechargeEntry = groups.find(
      (g) => g.giftCardId === id && g.type === "RECHARGE",
    );
    const spendEntry = groups.find(
      (g) => g.giftCardId === id && g.type === "SPEND",
    );

    const recharge =
      rechargeEntry && rechargeEntry._sum.amount
        ? rechargeEntry._sum.amount
        : new Prisma.Decimal(0);
    const spend =
      spendEntry && spendEntry._sum.amount
        ? spendEntry._sum.amount
        : new Prisma.Decimal(0);

    const balance = recharge.sub(spend);
    map.set(id, balance);
  }

  return map;
}

export type { CardBalance };
