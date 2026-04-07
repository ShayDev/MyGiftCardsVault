"use client";

import { create } from "zustand";

type ActiveCardFilter = "all" | "reloadable" | "one-time";

type TransactionModalState = {
  visible: boolean;
  cardId?: string | null;
};

type GlobalState = {
  familyId: string | null;
  setFamilyId: (id: string | null) => void;
  activeCardFilter: ActiveCardFilter;
  setActiveCardFilter: (f: ActiveCardFilter) => void;
  transactionModal: TransactionModalState;
  openTransactionModal: (cardId?: string) => void;
  closeTransactionModal: () => void;
};

export const useGlobalStore = create<GlobalState>((set) => ({
  familyId: null,
  setFamilyId: (id) => set({ familyId: id }),

  activeCardFilter: "all",
  setActiveCardFilter: (f) => set({ activeCardFilter: f }),

  transactionModal: { visible: false, cardId: null },
  openTransactionModal: (cardId) =>
    set({ transactionModal: { visible: true, cardId: cardId ?? null } }),
  closeTransactionModal: () =>
    set({ transactionModal: { visible: false, cardId: null } }),
}));

export default useGlobalStore;
