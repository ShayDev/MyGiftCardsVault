import React from "react";
import prisma from "../../lib/prisma";
import { getBalancesForCards } from "../../lib/balance";

type CardWithBalance = {
  id: string;
  name: string;
  provider: string;
  last4?: string | null;
  isReloadable: boolean;
  createdAt: string;
  balance: string; // Decimal string for rendering
};

export default async function Page() {
  // NOTE: in a real app familyId comes from auth/session. Using a placeholder here.
  const familyId = process.env.DEV_FAMILY_ID ?? null;

  if (!familyId) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold">No family selected</h2>
        <p className="text-sm text-muted-foreground">
          Set DEV_FAMILY_ID in env for local dev.
        </p>
      </div>
    );
  }

  const cards = await prisma.giftCard.findMany({
    where: { familyId },
    orderBy: { createdAt: "desc" },
  });

  const cardIds = cards.map((c) => c.id);
  const balances = await getBalancesForCards(cardIds);

  const payload: CardWithBalance[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    last4: c.last4,
    isReloadable: c.isReloadable,
    createdAt: c.createdAt.toISOString(),
    balance: balances.get(c.id)?.toString() ?? "0",
  }));

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Gift Cards</h1>
      <ul className="space-y-3">
        {payload.map((card) => (
          <li
            key={card.id}
            className="p-3 border rounded-md flex justify-between items-center"
          >
            <div>
              <div className="font-medium">{card.name}</div>
              <div className="text-sm text-slate-500">
                {card.provider} • {card.last4 ?? "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg">${card.balance}</div>
              <div className="text-sm text-slate-500">
                {card.isReloadable ? "Reloadable" : "One-time"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
