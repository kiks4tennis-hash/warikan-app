export type CurrencyCode =
  | 'JPY' | 'USD' | 'EUR' | 'GBP' | 'CNY' | 'CAD' | 'AUD' | 'CHF' | 'HKD' | 'SEK'
  | 'SGD' | 'NZD' | 'ZAR' | 'BRL' | 'RUB' | 'INR' | 'KRW' | 'MXN' | 'TRY' | 'IDR'
  | 'SAR' | 'TWD' | 'THB' | 'AED' | 'ARS' | 'MYR' | 'PLN' | 'ILS' | 'EGP' | 'CLP'
  | 'NOK' | 'COP' | 'PEN' | 'PHP' | 'QAR' | 'HUF' | 'VND' | 'UAH' | 'RON' | 'BGN'
  | 'DKK' | 'BDT' | 'BHD' | 'KWD' | 'OMR' | 'MAD' | 'PKR' | 'CZK' | 'NPR' | 'LKR';

export const CURRENCIES: { code: CurrencyCode; name: string; symbol: string }[] = [
  { code: 'JPY', name: '日本円', symbol: '¥' }, { code: 'USD', name: '米ドル', symbol: '$' },
  { code: 'EUR', name: 'ユーロ', symbol: '€' }, { code: 'GBP', name: '英ポンド', symbol: '£' },
  { code: 'CNY', name: '中国元', symbol: '¥' }, { code: 'CAD', name: 'カナダドル', symbol: 'CA$' },
  { code: 'AUD', name: '豪ドル', symbol: 'A$' }, { code: 'CHF', name: 'スイスフラン', symbol: 'CHF' },
  { code: 'HKD', name: '香港ドル', symbol: 'HK$' }, { code: 'SEK', name: 'スウェーデンクローナ', symbol: 'kr' },
  { code: 'SGD', name: 'シンガポールドル', symbol: 'S$' }, { code: 'NZD', name: 'ニュージーランドドル', symbol: 'NZ$' },
  { code: 'ZAR', name: '南アフリカランド', symbol: 'R' }, { code: 'BRL', name: 'ブラジルレアル', symbol: 'R$' },
  { code: 'RUB', name: 'ロシアルーブル', symbol: '₽' }, { code: 'INR', name: 'インドルピー', symbol: '₹' },
  { code: 'KRW', name: '韓国ウォン', symbol: '₩' }, { code: 'MXN', name: 'メキシコペソ', symbol: 'MX$' },
  { code: 'TRY', name: 'トルコリラ', symbol: '₺' }, { code: 'IDR', name: 'インドネシアルピア', symbol: 'Rp' },
  { code: 'SAR', name: 'サウジリヤル', symbol: '﷼' }, { code: 'TWD', name: '台湾ドル', symbol: 'NT$' },
  { code: 'THB', name: 'タイバーツ', symbol: '฿' }, { code: 'AED', name: 'UAEディルハム', symbol: 'د.إ' },
  { code: 'ARS', name: 'アルゼンチンペソ', symbol: 'AR$' }, { code: 'MYR', name: 'マレーシアリンギット', symbol: 'RM' },
  { code: 'PLN', name: 'ポーランドズウォティ', symbol: 'zł' }, { code: 'ILS', name: 'イスラエルシェケル', symbol: '₪' },
  { code: 'EGP', name: 'エジプトポンド', symbol: 'E£' }, { code: 'CLP', name: 'チリペソ', symbol: 'CL$' },
  { code: 'NOK', name: 'ノルウェークローネ', symbol: 'kr' }, { code: 'COP', name: 'コロンビアペソ', symbol: 'CO$' },
  { code: 'PEN', name: 'ペルーソル', symbol: 'S/' }, { code: 'PHP', name: 'フィリピンペソ', symbol: '₱' },
  { code: 'QAR', name: 'カタールリヤル', symbol: 'QR' }, { code: 'HUF', name: 'ハンガリーフォリント', symbol: 'Ft' },
  { code: 'VND', name: 'ベトナムドン', symbol: '₫' }, { code: 'UAH', name: 'ウクライナフリヴニャ', symbol: '₴' },
  { code: 'RON', name: 'ルーマニアレウ', symbol: 'lei' }, { code: 'BGN', name: 'ブルガリアレフ', symbol: 'лв' },
  { code: 'DKK', name: 'デンマーククローネ', symbol: 'kr' }, { code: 'BDT', name: 'バングラデシュタカ', symbol: '৳' },
  { code: 'BHD', name: 'バーレーンディナール', symbol: 'BD' }, { code: 'KWD', name: 'クウェートディナール', symbol: 'KD' },
  { code: 'OMR', name: 'オマーンリアル', symbol: 'ر.ع.' }, { code: 'MAD', name: 'モロッコディルハム', symbol: 'د.م.' },
  { code: 'PKR', name: 'パキスタンルピー', symbol: '₨' }, { code: 'CZK', name: 'チェココルナ', symbol: 'Kč' },
  { code: 'NPR', name: 'ネパールルピー', symbol: 'रु' }, { code: 'LKR', name: 'スリランカルピー', symbol: 'ரூ' },
];

export type GroupKind = 'trip' | 'event' | 'household' | 'shared-home';
export type TaskKind = 'packing' | 'todo' | 'plan' | 'itinerary' | 'shopping';

export type GroupMember = {
  id: string;
  displayName: string;
  accountId?: string;
  role: 'owner' | 'member';
};

export type ExpenseShare = { memberId: string; weight: number; excluded?: boolean };

export type Expense = {
  id: string;
  title: string;
  category: string;
  amountMinor: number;
  currency: CurrencyCode;
  /** Units of the group's base currency per one unit of this expense currency. */
  rateToBase: number;
  paidByMemberId: string;
  shares: ExpenseShare[];
  memo?: string;
  receiptUri?: string;
  createdAt: string;
  createdByMemberId: string;
};

export type ChecklistItem = {
  id: string;
  title: string;
  kind: TaskKind;
  completed: boolean;
  assignedToMemberId?: string;
  dueAt?: string;
  createdAt: string;
};

export type LedgerGroup = {
  id: string;
  title: string;
  kind: GroupKind;
  baseCurrency: CurrencyCode;
  members: GroupMember[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  createdAt: string;
};

const ZERO_DECIMAL_CURRENCIES = new Set<CurrencyCode>(['JPY', 'KRW', 'CLP', 'VND', 'IDR']);
const THREE_DECIMAL_CURRENCIES = new Set<CurrencyCode>(['BHD', 'KWD', 'OMR']);

export function currencyFractionDigits(code: CurrencyCode): number {
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function parseCurrencyAmount(input: string, code: CurrencyCode): number | null {
  const normalized = input.trim().replace(/,/g, '');
  if (!normalized || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  const factor = 10 ** currencyFractionDigits(code);
  const amount = Number(normalized) * factor;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}

export function formatCurrencyAmount(amountMinor: number, code: CurrencyCode): string {
  const currency = CURRENCIES.find((item) => item.code === code);
  const value = amountMinor / 10 ** currencyFractionDigits(code);
  return `${currency?.symbol ?? code} ${value.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyFractionDigits(code),
  })}`;
}

/** Largest-remainder allocation keeps every share in integer minor units. */
export function allocateWeightedAmount(
  totalMinor: number,
  shares: ExpenseShare[],
): { memberId: string; amountMinor: number }[] {
  const eligible = shares.filter((share) => !share.excluded && share.weight > 0);
  const weightTotal = eligible.reduce((sum, share) => sum + share.weight, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || weightTotal <= 0) return [];

  const parts = eligible.map((share, index) => {
    const exact = (totalMinor * share.weight) / weightTotal;
    return { memberId: share.memberId, amountMinor: Math.floor(exact), remainder: exact % 1, index };
  });
  let leftover = totalMinor - parts.reduce((sum, part) => sum + part.amountMinor, 0);
  const order = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < leftover; i += 1) order[i].amountMinor += 1;
  return parts.map(({ memberId, amountMinor }) => ({ memberId, amountMinor }));
}

export function expenseAmountInBaseMinor(expense: Expense, baseCurrency: CurrencyCode): number | null {
  if (expense.currency === baseCurrency) return expense.amountMinor;
  if (!Number.isFinite(expense.rateToBase) || expense.rateToBase <= 0) return null;
  const baseFactor = 10 ** currencyFractionDigits(baseCurrency);
  const sourceValue = expense.amountMinor / 10 ** currencyFractionDigits(expense.currency);
  return Math.round(sourceValue * expense.rateToBase * baseFactor);
}

export function calculateGroupBalances(group: LedgerGroup): Map<string, number> {
  const balances = new Map(group.members.map((member) => [member.id, 0]));
  for (const expense of group.expenses) {
    const baseAmount = expenseAmountInBaseMinor(expense, group.baseCurrency);
    if (baseAmount === null) continue;
    const allocated = allocateWeightedAmount(baseAmount, expense.shares);
    balances.set(expense.paidByMemberId, (balances.get(expense.paidByMemberId) ?? 0) + baseAmount);
    for (const share of allocated) {
      balances.set(share.memberId, (balances.get(share.memberId) ?? 0) - share.amountMinor);
    }
  }
  return balances;
}

