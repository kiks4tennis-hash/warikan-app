import type { RealtimeChannel, User } from '@supabase/supabase-js';
import type { CurrencyCode, GroupKind } from '../app/domain';
import { isSupabaseConfigured, supabase } from './supabase';

export type GroupSummary = {
  id: string;
  title: string;
  kind: GroupKind;
  baseCurrency: CurrencyCode;
  createdAt: string;
};

export type GroupMemberRow = {
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
};

export type GroupExpenseRow = {
  id: string;
  title: string;
  category: string;
  amountMinor: number;
  currency: CurrencyCode;
  rateToBase: number;
  payerId: string;
  shares: { memberId: string; weight: number; excluded: boolean }[];
  memo: string;
  receiptPath: string | null;
  createdBy: string;
  createdAt: string;
};

export type GroupChecklistRow = {
  id: string;
  title: string;
  kind: 'packing' | 'todo' | 'plan' | 'itinerary' | 'shopping';
  completed: boolean;
  assignedTo: string | null;
  dueAt: string | null;
  createdAt: string;
};

function client() {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabaseの接続情報が未設定です。.envを確認してください。');
  }
  return supabase;
}

export async function ensureAnonymousUser(): Promise<User> {
  const api = client();
  const { data: current, error: currentError } = await api.auth.getUser();
  if (!currentError && current.user) return current.user;

  const { data, error } = await api.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error('匿名ユーザーを作成できませんでした。');
  return data.user;
}

export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const { data, error } = await client()
    .from('group_members')
    .select('ledger_groups!inner(id,title,kind,base_currency,created_at)')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const group = row.ledger_groups as unknown as {
      id: string; title: string; kind: GroupKind; base_currency: CurrencyCode; created_at: string;
    } | null;
    return group ? [{ id: group.id, title: group.title, kind: group.kind, baseCurrency: group.base_currency, createdAt: group.created_at }] : [];
  });
}

export async function createGroup(input: {
  title: string; kind: GroupKind; baseCurrency: CurrencyCode; displayName: string;
}): Promise<string> {
  const { data, error } = await client().rpc('create_group', {
    p_title: input.title.trim(),
    p_kind: input.kind,
    p_base_currency: input.baseCurrency,
    p_display_name: input.displayName.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('グループを作成できませんでした。');
  return data;
}

export async function getGroupMembers(groupId: string): Promise<GroupMemberRow[]> {
  const { data, error } = await client()
    .from('group_members')
    .select('user_id,display_name,role')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ userId: row.user_id, displayName: row.display_name, role: row.role }));
}

export async function getGroupExpenses(groupId: string): Promise<GroupExpenseRow[]> {
  const { data, error } = await client()
    .from('group_expenses')
    .select('id,title,category,amount_minor,currency,rate_to_base,payer_id,shares,memo,receipt_path,created_by,created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as CurrencyCode,
    rateToBase: Number(row.rate_to_base),
    payerId: row.payer_id,
    shares: Array.isArray(row.shares) ? row.shares as GroupExpenseRow['shares'] : [],
    memo: row.memo,
    receiptPath: row.receipt_path,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function addGroupExpense(groupId: string, userId: string, input: {
  title: string; category: string; amountMinor: number; currency: CurrencyCode;
  rateToBase: number; payerId: string; shares: GroupExpenseRow['shares']; memo?: string;
}): Promise<string> {
  const { data, error } = await client().from('group_expenses').insert({
    group_id: groupId,
    title: input.title.trim(),
    category: input.category.trim() || 'その他',
    amount_minor: input.amountMinor,
    currency: input.currency,
    rate_to_base: input.rateToBase,
    payer_id: input.payerId,
    shares: input.shares,
    memo: input.memo?.trim() ?? '',
    created_by: userId,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function attachReceipt(groupId: string, expenseId: string, uri: string): Promise<string> {
  const api = client();
  const response = await fetch(uri);
  if (!response.ok) throw new Error('レシート画像を読み込めませんでした。');
  const blob = await response.blob();
  const path = `${groupId}/${expenseId}.jpg`;
  const { error: uploadError } = await api.storage.from('group-receipts').upload(path, blob, {
    contentType: blob.type || 'image/jpeg', upsert: true,
  });
  if (uploadError) throw uploadError;
  const { error } = await api.from('group_expenses').update({ receipt_path: path }).eq('id', expenseId);
  if (error) throw error;
  return path;
}

export async function getReceiptUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from('group-receipts').createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteGroupExpense(expenseId: string): Promise<void> {
  const { error } = await client().from('group_expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

export async function getGroupChecklist(groupId: string): Promise<GroupChecklistRow[]> {
  const { data, error } = await client()
    .from('group_checklist_items')
    .select('id,title,kind,completed,assigned_to,due_at,created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, kind: row.kind, completed: row.completed,
    assignedTo: row.assigned_to, dueAt: row.due_at, createdAt: row.created_at,
  }));
}

export async function addChecklistItem(groupId: string, userId: string, title: string, kind: GroupChecklistRow['kind']): Promise<void> {
  const { error } = await client().from('group_checklist_items').insert({
    group_id: groupId, title: title.trim(), kind, created_by: userId,
  });
  if (error) throw error;
}

export async function setChecklistItemDone(itemId: string, completed: boolean): Promise<void> {
  const { error } = await client().from('group_checklist_items').update({ completed }).eq('id', itemId);
  if (error) throw error;
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  const { error } = await client().from('group_checklist_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function createGroupInvite(groupId: string): Promise<string> {
  const { data, error } = await client().rpc('create_group_invite', { p_group_id: groupId });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('招待リンクを作成できませんでした。');
  return data;
}

export async function joinGroupByInvite(token: string, displayName: string): Promise<string> {
  const { data, error } = await client().rpc('join_group_by_invite', {
    p_token: token, p_display_name: displayName.trim(),
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('招待リンクから参加できませんでした。');
  return data;
}

export function watchGroup(groupId: string, refresh: () => void): RealtimeChannel {
  return client()
    .channel(`group-${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_expenses', filter: `group_id=eq.${groupId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_checklist_items', filter: `group_id=eq.${groupId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, refresh)
    .subscribe();
}

export async function removeGroupWatch(channel: RealtimeChannel): Promise<void> {
  if (supabase) await supabase.removeChannel(channel);
}

