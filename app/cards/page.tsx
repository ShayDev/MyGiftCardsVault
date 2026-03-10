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
  balance: number;
};

const PROVIDER_COLORS: Record<string, string> = {
  amazon:  "bg-amber-100 text-amber-700",
  target:  "bg-red-100 text-red-700",
  walmart: "bg-blue-100 text-blue-700",
  starbucks: "bg-green-100 text-green-700",
  apple:   "bg-slate-100 text-slate-700",
  google:  "bg-indigo-100 text-indigo-700",
};

function providerColor(provider: string): string {
  const key = provider.toLowerCase();
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
  const palette = [
    "bg-violet-100 text-violet-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-orange-100 text-orange-700",
    "bg-cyan-100 text-cyan-700",
  ];
  return palette[provider.charCodeAt(0) % palette.length];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function Page() {
  const familyId = process.env.DEV_FAMILY_ID ?? null;

  if (!familyId) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="font-semibold text-slate-800">No family selected</h2>
        <p className="text-sm text-slate-500 mt-1">Set DEV_FAMILY_ID in your .env.local for local dev.</p>
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
    balance: parseFloat(balances.get(c.id)?.toString() ?? "0"),
  }));

  const totalBalance = payload.reduce((sum, c) => sum + c.balance, 0);
  const reloadableCount = payload.filter((c) => c.isReloadable).length;
  const emptyCount = payload.filter((c) => c.balance <= 0).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Balance"
          value={formatCurrency(totalBalance)}
          valueClass="text-emerald-600"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          iconClass="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Total Cards"
          value={String(payload.length)}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          }
          iconClass="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Reloadable"
          value={String(reloadableCount)}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
          iconClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Empty Cards"
          value={String(emptyCount)}
          valueClass={emptyCount > 0 ? "text-rose-600" : undefined}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          }
          iconClass="bg-rose-50 text-rose-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 text-base">All Cards</h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {payload.length} card{payload.length !== 1 ? "s" : ""}
          </span>
        </div>

        {payload.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">No gift cards yet</p>
            <p className="text-sm text-slate-400 mt-1">Add your first card to get started.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left font-medium text-slate-500 px-5 py-3 w-[30%]">Card</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Provider</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Card #</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Type</th>
                    <th className="text-right font-medium text-slate-500 px-4 py-3">Balance</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Added</th>
                    <th className="text-right font-medium text-slate-500 px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payload.map((card) => (
                    <tr key={card.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Card Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${providerColor(card.provider)}`}>
                            {card.provider.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800 truncate">{card.name}</span>
                        </div>
                      </td>
                      {/* Provider */}
                      <td className="px-4 py-3.5 text-slate-600">{card.provider}</td>
                      {/* Last 4 */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-slate-500 tracking-widest text-xs">
                          {card.last4 ? `•••• ${card.last4}` : "—"}
                        </span>
                      </td>
                      {/* Type Badge */}
                      <td className="px-4 py-3.5">
                        {card.isReloadable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Reloadable
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            One-time
                          </span>
                        )}
                      </td>
                      {/* Balance */}
                      <td className="px-4 py-3.5 text-right">
                        <span className={`font-mono font-semibold text-sm ${card.balance > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {formatCurrency(card.balance)}
                        </span>
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                        {formatDate(card.createdAt)}
                      </td>
                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="min-h-[36px] px-3 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors whitespace-nowrap">
                            Spend
                          </button>
                          {card.isReloadable && (
                            <button className="min-h-[36px] px-3 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors whitespace-nowrap">
                              Recharge
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {payload.map((card) => (
                <div key={card.id} className="px-4 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${providerColor(card.provider)}`}>
                      {card.provider.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{card.name}</div>
                      <div className="text-xs text-slate-400">
                        {card.provider}
                        {card.last4 && (
                          <span className="font-mono ml-1.5 tracking-widest">•••• {card.last4}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-mono font-bold text-base ${card.balance > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {formatCurrency(card.balance)}
                      </div>
                      {card.isReloadable ? (
                        <span className="text-xs text-emerald-600">Reloadable</span>
                      ) : (
                        <span className="text-xs text-slate-400">One-time</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 min-h-[44px] text-sm font-medium rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors">
                      Spend
                    </button>
                    {card.isReloadable && (
                      <button className="flex-1 min-h-[44px] text-sm font-medium rounded-xl border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors">
                        Recharge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  iconClass,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className={`text-xl font-bold mt-0.5 ${valueClass ?? "text-slate-800"}`}>{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
