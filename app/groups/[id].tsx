import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { allocateWeightedAmount, CURRENCIES, expenseAmountInBaseMinor, formatCurrencyAmount, parseCurrencyAmount, type CurrencyCode, type ExpenseShare, type GroupKind } from '../domain';
import { addChecklistItem, addGroupExpense, attachReceipt, createGroupInvite, deleteChecklistItem, deleteGroupExpense, ensureAnonymousUser, getGroupChecklist, getGroupExpenses, getGroupMembers, getReceiptUrl, listMyGroups, removeGroupWatch, setChecklistItemDone, watchGroup, type GroupChecklistRow, type GroupExpenseRow, type GroupMemberRow } from '../../lib/groups';
import { guessReceiptFields } from '../receipt';
import { minimumTransfers } from '../settlement';

type Tab = 'expenses' | 'checklist' | 'analysis';
const TASK_KINDS: { key: GroupChecklistRow['kind']; label: string }[] = [
  { key: 'todo', label: 'やること' }, { key: 'packing', label: '持ち物' }, { key: 'shopping', label: '買い物' },
  { key: 'itinerary', label: '旅程' }, { key: 'plan', label: '計画' },
];
const GROUP_LABEL: Record<GroupKind, string> = { trip: '旅行', event: 'イベント', household: '家計', 'shared-home': 'ルームシェア' };
const EXPENSE_CATEGORIES = ['食事', '宿泊', '交通', '買い物', '家賃・光熱', 'その他'];

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<GroupKind>('trip');
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('JPY');
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [expenses, setExpenses] = useState<GroupExpenseRow[]>([]);
  const [tasks, setTasks] = useState<GroupChecklistRow[]>([]);
  const [tab, setTab] = useState<Tab>('expenses');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('その他');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('JPY');
  const [rateText, setRateText] = useState('1');
  const [payerId, setPayerId] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [showCurrencies, setShowCurrencies] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskKind, setTaskKind] = useState<GroupChecklistRow['kind']>('todo');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [readingReceipt, setReadingReceipt] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [memberRows, expenseRows, checklistRows, user] = await Promise.all([
      getGroupMembers(id), getGroupExpenses(id), getGroupChecklist(id), ensureAnonymousUser(),
    ]);
    setMembers(memberRows);
    setExpenses(expenseRows);
    setTasks(checklistRows);
    setUserId(user.id);
    setPayerId((current) => current || user.id);
    setBusy(false);
    setError('');
  }, [id]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!id) throw new Error('グループIDがありません。');
        const user = await ensureAnonymousUser();
        const [groupRows, memberRows, expenseRows, checklistRows] = await Promise.all([
          listMyGroups(user.id), getGroupMembers(id), getGroupExpenses(id), getGroupChecklist(id),
        ]);
        if (!active) return;
        const group = groupRows.find((item) => item.id === id);
        if (!group) throw new Error('このグループにアクセスできません。招待リンクから参加してください。');
        setTitle(group.title);
        setKind(group.kind);
        setBaseCurrency(group.baseCurrency);
        setMembers(memberRows);
        setExpenses(expenseRows);
        setTasks(checklistRows);
        setUserId(user.id);
        setPayerId(user.id);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'データを読み込めませんでした。');
      } finally {
        if (active) setBusy(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!id || !userId) return;
    const channel = watchGroup(id, () => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : '同期に失敗しました。')); });
    return () => { void removeGroupWatch(channel); };
  }, [id, userId, refresh]);

  const memberNames = useMemo(() => new Map(members.map((member) => [member.userId, member.displayName])), [members]);
  const memberLabel = (memberId: string) => {
    const member = members.find((item) => item.userId === memberId);
    if (!member) return 'メンバー';
    const duplicateIndex = members.filter((item) => item.displayName === member.displayName).findIndex((item) => item.userId === memberId);
    return members.filter((item) => item.displayName === member.displayName).length > 1 ? `${member.displayName}（${duplicateIndex + 1}）` : member.displayName;
  };

  async function onAddExpense() {
    const amountMinor = parseCurrencyAmount(amountText, currency);
    const rate = currency === baseCurrency ? 1 : Number(rateText);
    if (!expenseTitle.trim() || amountMinor === null || amountMinor <= 0 || !Number.isFinite(rate) || rate <= 0 || !payerId) {
      Alert.alert('入力を確認してください', '内容、金額、支払った人、基準通貨への換算レートを入力してください。');
      return;
    }
    const shares: ExpenseShare[] = members.map((member) => ({ memberId: member.userId, weight: 1, excluded: excluded.includes(member.userId) }));
    if (shares.every((share) => share.excluded)) {
      Alert.alert('負担する人を選んでください', '少なくとも1人は負担対象にしてください。');
      return;
    }
    setSaving(true);
    try {
      const expenseId = await addGroupExpense(id, userId, {
        title: expenseTitle, category: expenseCategory, amountMinor,
        currency, rateToBase: rate, payerId,
        shares: shares.map((share) => ({ memberId: share.memberId, weight: share.weight, excluded: Boolean(share.excluded) })),
      });
      if (receiptUri) await attachReceipt(id, expenseId, receiptUri);
      setExpenseTitle(''); setAmountText(''); setExcluded([]); setReceiptUri(null); setOcrText('');
      setExpenseCategory('その他');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '支出を追加できませんでした。');
    } finally { setSaving(false); }
  }

  async function onReadReceipt() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('写真へのアクセスが必要です', 'レシート画像を選択するため、写真ライブラリへのアクセスを許可してください。');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (picked.canceled || !picked.assets[0]) return;
      setReadingReceipt(true);
      const imageUri = picked.assets[0].uri;
      // Load the native module only when requested so the rest of the app can still run in Expo Go.
      const { recognizeText } = await import('expo-ocr-kit');
      const recognized = await recognizeText(imageUri);
      const guessed = guessReceiptFields(recognized.text);
      setExpenseTitle(guessed.title);
      setAmountText(guessed.amountText);
      setReceiptUri(imageUri);
      setOcrText(guessed.rawText);
      if (!guessed.amountText) Alert.alert('金額を確認してください', '文字は読み取れましたが、合計金額を特定できませんでした。内容を確認して金額を入力してください。');
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'レシートを読み取れませんでした。';
      Alert.alert('レシート読み取りに失敗しました', `${detail}\n\nOCRはExpo Goでは動作しません。必要な場合はEAS開発ビルドを作成してください。`);
    } finally { setReadingReceipt(false); }
  }

  async function onAddTask() {
    if (!taskTitle.trim()) return;
    setSaving(true);
    try { await addChecklistItem(id, userId, taskTitle, taskKind); setTaskTitle(''); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '項目を追加できませんでした。'); }
    finally { setSaving(false); }
  }

  async function onInvite() {
    try {
      const token = await createGroupInvite(id);
      const url = ExpoLinking.createURL(`/invite/${token}`);
      await Share.share({ title: `${title} に招待`, message: `${title}のグループに参加してください。\n${url}` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '招待リンクを作成できませんでした。'); }
  }

  async function onOpenReceipt(path: string) {
    try { await ExpoLinking.openURL(await getReceiptUrl(path)); }
    catch (reason) { Alert.alert('レシートを開けませんでした', reason instanceof Error ? reason.message : '時間をおいて再度お試しください。'); }
  }

  const balances = useMemo(() => {
    const result = new Map(members.map((member) => [member.userId, 0]));
    for (const expense of expenses) {
      const baseAmount = expenseAmountInBaseMinor({
        id: expense.id, title: expense.title, category: expense.category, amountMinor: expense.amountMinor,
        currency: expense.currency, rateToBase: expense.rateToBase, paidByMemberId: expense.payerId,
        shares: expense.shares, createdAt: expense.createdAt, createdByMemberId: expense.createdBy,
      }, baseCurrency);
      if (baseAmount === null) continue;
      result.set(expense.payerId, (result.get(expense.payerId) ?? 0) + baseAmount);
      const allocated = allocateWeightedAmount(baseAmount, expense.shares);
      for (const share of allocated) result.set(share.memberId, (result.get(share.memberId) ?? 0) - share.amountMinor);
    }
    return result;
  }, [members, expenses, baseCurrency]);
  const transfers = useMemo(() => minimumTransfers(members.map((member) => balances.get(member.userId) ?? 0)), [members, balances]);
  const paidTotals = useMemo(() => members.map((member) => ({ member, amount: expenses
    .filter((expense) => expense.payerId === member.userId)
    .reduce((sum, expense) => sum + (expenseAmountInBaseMinor({
      id: expense.id, title: expense.title, category: expense.category, amountMinor: expense.amountMinor,
      currency: expense.currency, rateToBase: expense.rateToBase, paidByMemberId: expense.payerId,
      shares: expense.shares, createdAt: expense.createdAt, createdByMemberId: expense.createdBy,
    }, baseCurrency) ?? 0), 0) })), [members, expenses, baseCurrency]);
  const categoryTotals = useMemo(() => EXPENSE_CATEGORIES.map((category) => ({ category, amount: expenses
    .filter((expense) => expense.category === category)
    .reduce((sum, expense) => sum + (expenseAmountInBaseMinor({
      id: expense.id, title: expense.title, category: expense.category, amountMinor: expense.amountMinor,
      currency: expense.currency, rateToBase: expense.rateToBase, paidByMemberId: expense.payerId,
      shares: expense.shares, createdAt: expense.createdAt, createdByMemberId: expense.createdBy,
    }, baseCurrency) ?? 0), 0) })), [expenses, baseCurrency]);

  if (busy) return <SafeAreaView style={s.safe}><ActivityIndicator style={s.loading} size="large" color="#285B39" /></SafeAreaView>;

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.top}>
        <Pressable onPress={() => router.back()}><Text style={s.back}>‹ グループ</Text></Pressable>
        <Pressable onPress={() => void onInvite()} style={s.invite}><Text style={s.inviteText}>メンバーを招待</Text></Pressable>
      </View>
      <Text style={s.eyebrow}>{GROUP_LABEL[kind]} · {baseCurrency}基準</Text>
      <Text style={s.heading}>{title}</Text>
      <Text style={s.memberLine}>参加者：{members.map((member) => member.displayName).join('、')}</Text>
      <View style={s.tabs}>{([
        ['expenses', '支出'], ['checklist', 'チェックリスト'], ['analysis', '精算・分析'],
      ] as [Tab, string][]).map(([key, label]) => <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.activeTab]}><Text style={[s.tabText, tab === key && s.activeTabText]}>{label}</Text></Pressable>)}</View>

      {tab === 'expenses' ? <>
        <View style={s.card}>
          <Text style={s.section}>支出をすばやく記録</Text>
          <Text style={s.label}>内容</Text><TextInput value={expenseTitle} onChangeText={setExpenseTitle} maxLength={80} placeholder="例：夕食、ホテル" style={s.input} />
          <Text style={s.label}>カテゴリ</Text><View style={s.chipRow}>{EXPENSE_CATEGORIES.map((category) => <Pressable key={category} onPress={() => setExpenseCategory(category)} style={[s.chip, expenseCategory === category && s.selectedChip]}><Text style={[s.chipText, expenseCategory === category && s.selectedChipText]}>{category}</Text></Pressable>)}</View>
          <Pressable onPress={() => void onReadReceipt()} disabled={readingReceipt} style={s.receiptButton}><Text style={s.receiptButtonText}>{readingReceipt ? 'レシートを読み取り中…' : receiptUri ? '✓ レシートを選択済み（タップして変更）' : 'レシートを読み取る'}</Text></Pressable>
          {!!receiptUri && <Text style={s.hint}>読み取り結果と金額を確認してから登録してください。登録時にレシート画像をSupabaseの非公開ストレージへ保存します。</Text>}
          {!!ocrText && <Text style={s.ocrPreview} numberOfLines={4}>読み取り内容：{ocrText}</Text>}
          <Text style={s.label}>金額・通貨</Text>
          <View style={s.row}><TextInput value={amountText} onChangeText={(value) => setAmountText(value.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" placeholder="0" style={[s.input, s.amountInput]} /><Pressable onPress={() => setShowCurrencies(true)} style={s.currencyButton}><Text style={s.currencyButtonText}>{currency}⌄</Text></Pressable></View>
          {currency !== baseCurrency && <><Text style={s.label}>換算レート（1 {currency} = ? {baseCurrency}）</Text><TextInput value={rateText} onChangeText={(value) => setRateText(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="1.0" style={s.input} /><Text style={s.hint}>為替レートは手入力です。カード明細の円換算額が分かる場合は、その額を基準にレートを入力してください。</Text></>}
          <Text style={s.label}>支払った人</Text><View style={s.chipRow}>{members.map((member) => <Pressable key={member.userId} onPress={() => setPayerId(member.userId)} style={[s.chip, payerId === member.userId && s.selectedChip]}><Text style={[s.chipText, payerId === member.userId && s.selectedChipText]}>{member.displayName}</Text></Pressable>)}</View>
          <Text style={s.label}>負担する人（外す人のチェックを外す）</Text>
          <View style={s.chipRow}>{members.map((member) => { const included = !excluded.includes(member.userId); return <Pressable key={member.userId} onPress={() => setExcluded((current) => included ? [...current, member.userId] : current.filter((id) => id !== member.userId))} style={[s.chip, included && s.includedChip]}><Text style={[s.chipText, included && s.includedChipText]}>{included ? '✓ ' : ''}{member.displayName}</Text></Pressable>; })}</View>
          <Pressable onPress={() => void onAddExpense()} disabled={saving} style={[s.primary, saving && s.disabled]}><Text style={s.primaryText}>{saving ? '保存中…' : '支出を追加'}</Text></Pressable>
          {!!error && <Text style={s.error}>{error}</Text>}
        </View>
        <View style={s.card}>
          <Text style={s.section}>支払い履歴</Text>
          {expenses.length === 0 ? <Text style={s.empty}>まだ支出はありません。</Text> : expenses.map((expense) => {
            const baseAmount = expenseAmountInBaseMinor({
              id: expense.id, title: expense.title, category: expense.category, amountMinor: expense.amountMinor,
              currency: expense.currency, rateToBase: expense.rateToBase, paidByMemberId: expense.payerId,
              shares: expense.shares, createdAt: expense.createdAt, createdByMemberId: expense.createdBy,
            }, baseCurrency);
            return <View key={expense.id} style={s.expenseRow}>
              <View style={s.expenseIcon}><Text style={s.expenseIconText}>¥</Text></View>
              <View style={s.grow}><Text style={s.expenseTitle}>{expense.title}</Text><Text style={s.meta}>{memberNames.get(expense.payerId) ?? 'メンバー'}が支払い · {new Date(expense.createdAt).toLocaleDateString('ja-JP')}</Text></View>
              <View style={s.expensePrice}><Text style={s.price}>{formatCurrencyAmount(expense.amountMinor, expense.currency)}</Text>{expense.receiptPath && <Pressable onPress={() => void onOpenReceipt(expense.receiptPath!)}><Text style={s.receiptLink}>レシートを見る</Text></Pressable>}{expense.currency !== baseCurrency && baseAmount !== null && <Text style={s.meta}>≈ {formatCurrencyAmount(baseAmount, baseCurrency)}</Text>}</View>
              {expense.createdBy === userId && <Pressable onPress={() => Alert.alert('支出を削除しますか？', expense.title, [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => { void deleteGroupExpense(expense.id).then(refresh).catch((reason) => setError(reason.message)); } }])}><Text style={s.delete}>×</Text></Pressable>}
            </View>;
          })}
        </View>
      </> : tab === 'checklist' ? <>
        <View style={s.card}>
          <Text style={s.section}>共有チェックリスト</Text>
          <View style={s.chipRow}>{TASK_KINDS.map((item) => <Pressable key={item.key} onPress={() => setTaskKind(item.key)} style={[s.chip, taskKind === item.key && s.selectedChip]}><Text style={[s.chipText, taskKind === item.key && s.selectedChipText]}>{item.label}</Text></Pressable>)}</View>
          <View style={[s.row, { marginTop: 12 }]}><TextInput value={taskTitle} onChangeText={setTaskTitle} placeholder="項目を追加" maxLength={120} style={[s.input, s.amountInput]} /><Pressable onPress={() => void onAddTask()} style={s.addTaskButton}><Text style={s.primaryText}>追加</Text></Pressable></View>
          <Text style={s.hint}>変更はグループの全メンバーに同期されます。</Text>
        </View>
        <View style={s.card}>
          <Text style={s.section}>進捗 {tasks.filter((task) => task.completed).length}/{tasks.length}</Text>
          {tasks.length === 0 ? <Text style={s.empty}>旅行の持ち物、やること、買い物、計画を追加できます。</Text> : tasks.map((task) => <View key={task.id} style={s.taskRow}>
            <Pressable onPress={() => void setChecklistItemDone(task.id, !task.completed).then(refresh).catch((reason) => setError(reason.message))} style={[s.check, task.completed && s.checked]}><Text style={s.checkText}>{task.completed ? '✓' : ''}</Text></Pressable>
            <View style={s.grow}><Text style={[s.taskTitle, task.completed && s.doneTask]}>{task.title}</Text><Text style={s.meta}>{TASK_KINDS.find((item) => item.key === task.kind)?.label}</Text></View>
            <Pressable onPress={() => Alert.alert('項目を削除しますか？', task.title, [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: () => { void deleteChecklistItem(task.id).then(refresh).catch((reason) => setError(reason.message)); } }])}><Text style={s.delete}>×</Text></Pressable>
          </View>)}
        </View>
      </> : <>
        <View style={s.card}>
          <Text style={s.section}>支出分析</Text>
          <Text style={s.hint}>立替額の多い順 · 基準通貨 {baseCurrency}</Text>
          {[...paidTotals].sort((a, b) => b.amount - a.amount).map(({ member, amount }) => <View key={member.userId} style={s.analysisRow}><Text style={s.person}>{memberLabel(member.userId)}</Text><Text style={s.paidAmount}>{formatCurrencyAmount(amount, baseCurrency)}</Text></View>)}
          <Text style={[s.section, { marginTop: 18 }]}>カテゴリ別支出</Text>
          {categoryTotals.filter(({ amount }) => amount > 0).map(({ category, amount }) => <View key={category} style={s.analysisRow}><Text style={s.person}>{category}</Text><Text style={s.paidAmount}>{formatCurrencyAmount(amount, baseCurrency)}</Text></View>)}
          <Text style={[s.section, { marginTop: 18 }]}>現在の精算残高</Text>
          {members.map((member) => <View key={member.userId} style={s.analysisRow}><Text style={s.person}>{memberLabel(member.userId)}</Text><Text style={[s.balance, (balances.get(member.userId) ?? 0) >= 0 ? s.positive : s.negative]}>{formatCurrencyAmount(balances.get(member.userId) ?? 0, baseCurrency)}</Text></View>)}
        </View>
        <View style={s.card}>
          <Text style={s.section}>送金回数を抑えた精算案</Text>
          {transfers.length === 0 ? <Text style={s.empty}>精算は完了しています。</Text> : transfers.map((transfer, index) => <View key={`${transfer.fromIndex}-${transfer.toIndex}-${index}`} style={s.transferRow}><Text style={s.transferNames}>{memberLabel(members[transfer.fromIndex]?.userId ?? '')} → {memberLabel(members[transfer.toIndex]?.userId ?? '')}</Text><Text style={s.price}>{formatCurrencyAmount(transfer.amount, baseCurrency)}</Text></View>)}
          <Text style={s.hint}>支出 {expenses.length}件を集計しています。</Text>
        </View>
      </>}
      <Text style={s.privacy}>グループの記録はSupabaseに保存され、メンバーが閲覧・編集できます。</Text>
    </ScrollView>

    <Modal visible={showCurrencies} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCurrencies(false)}>
      <SafeAreaView style={s.modalSafe}>
        <View style={s.modalHeader}><Text style={s.section}>通貨を選択</Text><Pressable onPress={() => setShowCurrencies(false)}><Text style={s.refresh}>閉じる</Text></Pressable></View>
        <ScrollView>{CURRENCIES.map((item) => <Pressable key={item.code} onPress={() => { setCurrency(item.code); setRateText(item.code === baseCurrency ? '1' : ''); setShowCurrencies(false); }} style={s.currencyRow}><Text style={s.person}>{item.name}</Text><Text style={s.meta}>{item.code} · {item.symbol}</Text></Pressable>)}</ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F4' }, loading: { flex: 1, alignSelf: 'center' }, page: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 32, maxWidth: 620, width: '100%', alignSelf: 'center' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, back: { color: '#31573D', fontWeight: '700', fontSize: 15 }, invite: { backgroundColor: '#E8EEE7', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 }, inviteText: { color: '#31573D', fontWeight: '700', fontSize: 13 }, eyebrow: { color: '#69776B', fontSize: 12, fontWeight: '700' }, heading: { color: '#1C3829', fontWeight: '800', fontSize: 26, marginTop: 3 }, memberLine: { color: '#768177', fontSize: 12, marginTop: 7, marginBottom: 16 }, tabs: { flexDirection: 'row', backgroundColor: '#E9EDE7', borderRadius: 12, padding: 4, marginBottom: 14 }, tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 }, activeTab: { backgroundColor: '#FFF' }, tabText: { color: '#758075', fontSize: 12, fontWeight: '700' }, activeTabText: { color: '#31573D' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 17, marginBottom: 13 }, section: { color: '#20372A', fontWeight: '800', fontSize: 17, marginBottom: 12 }, label: { color: '#57645A', fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#E4E9E3', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, color: '#20372A', backgroundColor: '#FCFDFC', fontSize: 15 }, row: { flexDirection: 'row', gap: 8, alignItems: 'center' }, amountInput: { flex: 1 }, currencyButton: { paddingHorizontal: 13, paddingVertical: 12, backgroundColor: '#EAF1E8', borderRadius: 11 }, currencyButtonText: { color: '#31573D', fontWeight: '800' }, hint: { color: '#89938A', fontSize: 11, lineHeight: 17, marginTop: 8 }, chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }, chip: { borderWidth: 1, borderColor: '#DDE5DC', borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8 }, chipText: { color: '#5E6B61', fontSize: 12, fontWeight: '700' }, selectedChip: { backgroundColor: '#285B39', borderColor: '#285B39' }, selectedChipText: { color: '#FFF' }, includedChip: { backgroundColor: '#EAF1E8', borderColor: '#D5E2D4' }, includedChipText: { color: '#31573D' }, primary: { backgroundColor: '#285B39', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 17 }, primaryText: { color: '#FFF', fontWeight: '800' }, disabled: { opacity: 0.6 },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' }, expenseIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F0F4EE', alignItems: 'center', justifyContent: 'center' }, expenseIconText: { color: '#588062', fontSize: 18, fontWeight: '800' }, grow: { flex: 1 }, expenseTitle: { color: '#27382B', fontWeight: '700', fontSize: 14 }, meta: { color: '#8A948B', fontSize: 10, marginTop: 4 }, expensePrice: { alignItems: 'flex-end' }, price: { color: '#285B39', fontWeight: '800', fontSize: 13 }, delete: { color: '#9A6258', fontSize: 23, paddingHorizontal: 5 }, empty: { color: '#879188', fontSize: 13, lineHeight: 20, paddingVertical: 6 },
  receiptButton: { borderWidth: 1, borderColor: '#BBD0BC', borderRadius: 11, padding: 12, alignItems: 'center', marginTop: 10 }, receiptButtonText: { color: '#31573D', fontSize: 13, fontWeight: '700' }, receiptLink: { color: '#31573D', fontSize: 10, fontWeight: '700', marginTop: 3 }, ocrPreview: { color: '#778278', fontSize: 11, lineHeight: 16, backgroundColor: '#F7F9F6', padding: 9, borderRadius: 9, marginTop: 7 },
  addTaskButton: { backgroundColor: '#285B39', borderRadius: 11, paddingHorizontal: 17, paddingVertical: 13 }, taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' }, check: { width: 23, height: 23, borderWidth: 1.5, borderColor: '#B7C5B6', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: '#285B39', borderColor: '#285B39' }, checkText: { color: '#FFF', fontWeight: '900', fontSize: 13 }, taskTitle: { color: '#2C3B30', fontSize: 14, fontWeight: '600' }, doneTask: { color: '#9AA39B', textDecorationLine: 'line-through' },
  analysisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' }, person: { color: '#2C3B30', fontSize: 14, fontWeight: '700' }, paidAmount: { color: '#285B39', fontSize: 14, fontWeight: '800' }, balance: { fontSize: 15, fontWeight: '800' }, positive: { color: '#316542' }, negative: { color: '#A15B4E' }, transferRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' }, transferNames: { color: '#405345', fontSize: 13, fontWeight: '600', flex: 1 }, error: { color: '#A04436', backgroundColor: '#FCEDEA', padding: 10, borderRadius: 9, marginTop: 12, fontSize: 12, lineHeight: 18 }, privacy: { color: '#8B958B', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  modalSafe: { flex: 1, backgroundColor: '#FFF' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#E8ECE7' }, refresh: { color: '#3F704C', fontWeight: '700', padding: 4 }, currencyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' },
});

