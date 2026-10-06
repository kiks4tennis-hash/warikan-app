export type SettlementTransfer = {
  fromIndex: number;
  toIndex: number;
  amount: number;
};

type Balance = { index: number; amount: number };

/**
 * Creates a minimum-count settlement for up to 12 non-zero balances by
 * partitioning them into the largest possible number of zero-sum groups.
 * Larger groups use the same deterministic greedy fallback without blocking
 * the UI on an exponential search.
 */
export function minimumTransfers(balances: number[]): SettlementTransfer[] {
  const entries: Balance[] = balances
    .map((amount, index) => ({ index, amount: Math.trunc(amount) }))
    .filter((entry) => entry.amount !== 0);
  if (entries.length < 2) return [];

  const groups = entries.length <= 12 ? minimumZeroSumGroups(entries) : null;
  if (groups) return groups.flatMap((group) => settleGroup(group));
  return settleGroup(entries);
}

function minimumZeroSumGroups(entries: Balance[]): Balance[][] | null {
  const count = entries.length;
  const size = 1 << count;
  const sums = new Array<number>(size).fill(0);
  const best = new Array<number>(size).fill(-1);
  const choice = new Array<number>(size).fill(0);
  best[0] = 0;

  for (let mask = 1; mask < size; mask += 1) {
    const bit = mask & -mask;
    const index = 31 - Math.clz32(bit);
    sums[mask] = sums[mask ^ bit] + entries[index].amount;
    if (sums[mask] !== 0) continue;

    const anchor = bit;
    for (let subset = mask; subset; subset = (subset - 1) & mask) {
      if ((subset & anchor) === 0 || sums[subset] !== 0) continue;
      const remainder = mask ^ subset;
      if (best[remainder] < 0) continue;
      const groups = 1 + best[remainder];
      if (groups > best[mask]) {
        best[mask] = groups;
        choice[mask] = subset;
      }
    }
  }

  const full = size - 1;
  if (best[full] < 0) return null;

  const result: Balance[][] = [];
  for (let mask = full; mask; ) {
    const subset = choice[mask];
    if (!subset) return null;
    result.push(entries.filter((_, index) => (subset & (1 << index)) !== 0));
    mask ^= subset;
  }
  return result;
}

function settleGroup(group: Balance[]): SettlementTransfer[] {
  const creditors = group
    .filter((entry) => entry.amount > 0)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.amount - a.amount || a.index - b.index);
  const debtors = group
    .filter((entry) => entry.amount < 0)
    .map((entry) => ({ index: entry.index, amount: -entry.amount }))
    .sort((a, b) => b.amount - a.amount || a.index - b.index);

  const transfers: SettlementTransfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const amount = Math.min(creditors[creditorIndex].amount, debtors[debtorIndex].amount);
    transfers.push({
      fromIndex: debtors[debtorIndex].index,
      toIndex: creditors[creditorIndex].index,
      amount,
    });
    creditors[creditorIndex].amount -= amount;
    debtors[debtorIndex].amount -= amount;
    if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
    if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
  }
  return transfers;
}

