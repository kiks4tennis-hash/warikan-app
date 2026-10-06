import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { minimumTransfers } from './settlement';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Person = { id: string; name: string; weight: string; paid: string };
type Transfer = { fromId: string; toId: string; from: string; to: string; amount: number };
type Saved = { id: string; title: string; total: number; createdAt: string; transfers: Transfer[]; people: Person[] };
const HISTORY_KEY = 'warikan.history.v1';
const SUPPORT_EMAIL = 'kiks4tennis@gmail.com';
const fmt = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const newPerson = (i: number): Person => ({ id: `${Date.now()}-${Math.random()}`, name: `参加者${i}`, weight: '1', paid: '' });

function calculate(total: number, people: Person[]): { owed: number[]; transfers: Transfer[] } {
  const weights = people.map((p) => Number(p.weight));
  const sumWeight = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sumWeight);
  const owed = raw.map(Math.floor);
  let remainder = total - owed.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, fraction: v - Math.floor(v) })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let k = 0; k < remainder; k += 1) owed[order[k].i] += 1;

  const balances = people.map((p, i) => Number(p.paid || 0) - owed[i]);
  const labels = getPersonLabels(people);
  const transfers: Transfer[] = minimumTransfers(balances).map(({ fromIndex, toIndex, amount }) => ({
    fromId: people[fromIndex].id,
    toId: people[toIndex].id,
    from: labels[fromIndex],
    to: labels[toIndex],
    amount,
  }));
  return { owed, transfers };
}

function getPersonLabels(people: Person[]): string[] {
  const baseNames = people.map((person, index) => person.name.trim() || `参加者${index + 1}`);
  const counts = new Map<string, number>();
  baseNames.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  const seen = new Map<string, number>();
  return baseNames.map((name) => {
    if ((counts.get(name) ?? 0) < 2) return name;
    const occurrence = (seen.get(name) ?? 0) + 1;
    seen.set(name, occurrence);
    return `${name} (${occurrence})`;
  });
}

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState('飲み会');
  const [totalText, setTotalText] = useState('');
  const [people, setPeople] = useState<Person[]>([newPerson(1), newPerson(2)]);
  const [result, setResult] = useState<{ owed: number[]; transfers: Transfer[] } | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => { void AsyncStorage.getItem(HISTORY_KEY).then((raw) => { if (raw) setHistory(JSON.parse(raw) as Saved[]); }).catch(() => {}); }, []);

  const total = Number(totalText.replace(/,/g, ''));
  const paidTotal = people.reduce((sum, p) => sum + Number(p.paid || 0), 0);
  const weightTotal = people.reduce((sum, p) => sum + Number(p.weight), 0);
  const canCalculate = Number.isSafeInteger(total) && total > 0 && people.length >= 2 && weightTotal > 0 && people.every((p) => Number(p.weight) > 0 && Number.isFinite(Number(p.weight)) && Number(p.paid || 0) >= 0) && paidTotal === total;

  const validation = useMemo(() => {
    if (!totalText) return '会計の合計金額を入力してください';
    if (!Number.isSafeInteger(total) || total <= 0) return '合計は1円以上の整数で入力してください';
    if (people.length < 2) return '参加者を2人以上追加してください';
    if (people.some((p) => !Number.isFinite(Number(p.weight)) || Number(p.weight) <= 0)) return '負担比率は全員1以上で入力してください';
    if (people.some((p) => !Number.isSafeInteger(Number(p.paid || 0)) || Number(p.paid || 0) < 0)) return '立替額は0円以上の整数で入力してください';
    if (paidTotal !== total) return `立替額の合計 ${fmt(paidTotal)} が会計合計 ${fmt(total)} と一致していません`;
    return '';
  }, [totalText, total, people, paidTotal]);

  function updatePerson(id: string, key: 'name' | 'weight' | 'paid', value: string) {
    setPeople((current) => current.map((p) => p.id === id ? { ...p, [key]: key === 'name' ? value : value.replace(/[^0-9]/g, '') } : p));
    setResult(null); setSavedId(null);
  }
  function runCalculation() {
    Keyboard.dismiss();
    if (!canCalculate) { Alert.alert('入力を確認してください', validation); return; }
    setResult(calculate(total, people));
    setSavedId(null);
  }
  async function save() {
    if (!result) return;
    const record: Saved = { id: savedId ?? `${Date.now()}`, title: title.trim() || '精算', total, createdAt: new Date().toISOString(), transfers: result.transfers, people };
    const next = [record, ...history.filter((x) => x.id !== record.id)].slice(0, 30);
    try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)); setHistory(next); setSavedId(record.id); Alert.alert('保存しました', 'この端末に精算を保存しました。'); }
    catch { Alert.alert('保存できませんでした', '端末の空き容量を確認して、もう一度お試しください。'); }
  }
  async function share() {
    if (!result) return;
    const labels = getPersonLabels(people);
    const lines = [`${title.trim() || '精算'}｜合計 ${fmt(total)}`, '', '負担額', ...people.map((p, i) => `${labels[i]}：${fmt(result.owed[i])}`), '', '送金', ...(result.transfers.length ? result.transfers.map((t) => `${t.from} → ${t.to}：${fmt(t.amount)}`) : ['送金はありません'])];
    try { await Share.share({ message: lines.join('\n') }); } catch { Alert.alert('共有できませんでした', 'もう一度お試しください。'); }
  }
  function load(saved: Saved) {
    setTitle(saved.title); setTotalText(String(saved.total)); setPeople(saved.people); setResult(calculate(saved.total, saved.people)); setSavedId(saved.id); setShowHistory(false);
  }
  async function deleteHistory() {
    Alert.alert('履歴をすべて削除しますか？', '削除した履歴は元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'すべて削除', style: 'destructive', onPress: () => { void AsyncStorage.removeItem(HISTORY_KEY).then(() => setHistory([])); } },
    ]);
  }
  async function contactSupport() {
    try { await Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }
    catch { Alert.alert('メールを開けませんでした', `お問い合わせ先: ${SUPPORT_EMAIL}`); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.top}><View><Text style={s.eyebrow}>かんたん精算</Text><Text style={s.brand}>割り勘ノート</Text></View><View style={s.topActions}>{!showSettings && <Pressable onPress={() => { setShowHistory((v) => !v); }} style={s.historyButton} accessibilityRole="button"><Text style={s.historyButtonText}>{showHistory ? '新規精算' : '履歴'}</Text></Pressable>}<Pressable onPress={() => { setShowSettings((v) => !v); setShowHistory(false); }} style={s.historyButton} accessibilityRole="button"><Text style={s.historyButtonText}>{showSettings ? '戻る' : '設定'}</Text></Pressable></View></View>

        {showSettings ? <View style={s.card}>
          <Text style={s.sectionTitle}>設定・サポート</Text>
          <Text style={s.settingIntro}>個人精算の履歴は端末内、グループ台帳の情報はSupabaseに保存して参加メンバーと共有します。広告・利用状況の計測はありません。</Text>
          <Pressable onPress={() => setShowPrivacy(true)} style={s.settingRow} accessibilityRole="button"><View><Text style={s.settingTitle}>プライバシーポリシー</Text><Text style={s.settingSubtitle}>このアプリで扱う情報を確認</Text></View><Text style={s.settingChevron}>›</Text></Pressable>
          <Pressable onPress={contactSupport} style={s.settingRow} accessibilityRole="button"><View><Text style={s.settingTitle}>お問い合わせ</Text><Text style={s.settingSubtitle}>{SUPPORT_EMAIL}</Text></View><Text style={s.settingChevron}>↗</Text></Pressable>
          <Text style={s.settingFootnote}>履歴は「履歴」画面から削除できます。</Text>
        </View> : showHistory ? <View style={s.card}>
          <Text style={s.sectionTitle}>保存した精算</Text>
          {history.length === 0 ? <Text style={s.muted}>保存した履歴はありません</Text> : history.map((item) => <Pressable key={item.id} style={s.historyRow} onPress={() => load(item)}><View><Text style={s.personName}>{item.title}</Text><Text style={s.mutedSmall}>{new Date(item.createdAt).toLocaleDateString('ja-JP')}</Text></View><Text style={s.historyAmount}>{fmt(item.total)}  ›</Text></Pressable>)}
          {history.length > 0 && <Pressable onPress={deleteHistory} style={s.deleteButton}><Text style={s.deleteText}>履歴をすべて削除</Text></Pressable>}
        </View> : <>
          <View style={s.hero}><Text style={s.heroTitle}>気まずい精算を、さっと解決。</Text><Text style={s.heroSub}>負担額と送金先を自動で計算します。</Text></View>
          <Pressable onPress={() => router.push('/groups')} style={[s.primary, { marginTop: 0, marginBottom: 14 }]}><Text style={s.primaryText}>旅行・家計のグループ台帳　›</Text></Pressable>
          <View style={s.card}>
            <Text style={s.label}>会の名前</Text><TextInput value={title} onChangeText={setTitle} placeholder="例：飲み会" style={s.textInput} maxLength={32} accessibilityLabel="会の名前" />
            <Text style={[s.label, s.spaced]}>会計の合計</Text><View style={s.moneyInput}><TextInput value={totalText} onChangeText={(v) => { setTotalText(v.replace(/[^0-9]/g, '')); setResult(null); setSavedId(null); }} keyboardType="number-pad" placeholder="0" style={s.moneyField} accessibilityLabel="会計の合計金額"/><Text style={s.yen}>円</Text></View>
            <View style={s.peopleHeading}><Text style={s.sectionTitle}>参加者</Text><Text style={s.mutedSmall}>比率 1 = 基準額</Text></View>
            {people.map((p, i) => <View style={s.personCard} key={p.id}>
              <View style={s.personTop}><View style={s.nameField}><Text style={s.labelSmall}>名前</Text><TextInput value={p.name} onChangeText={(v) => updatePerson(p.id, 'name', v)} placeholder={`参加者${i + 1}`} style={s.textInput} maxLength={24} accessibilityLabel={`${i + 1}人目の名前`}/></View><View style={s.weightField}><Text style={s.labelSmall}>負担比率</Text><TextInput value={p.weight} onChangeText={(v) => updatePerson(p.id, 'weight', v)} keyboardType="number-pad" style={[s.textInput, s.center]} accessibilityLabel={`${i + 1}人目の負担比率`}/></View><Pressable onPress={() => { if (people.length > 2) setPeople((xs) => xs.filter((x) => x.id !== p.id)); setResult(null); }} disabled={people.length <= 2} accessibilityLabel={`${i + 1}人目を削除`} style={s.remove}><Text style={[s.removeText, people.length <= 2 && s.disabled]}>×</Text></Pressable></View>
              <Text style={s.labelSmall}>この人が立て替えた金額</Text><View style={s.paidInput}><TextInput value={p.paid} onChangeText={(v) => updatePerson(p.id, 'paid', v)} placeholder="0" keyboardType="number-pad" style={s.paidField} accessibilityLabel={`${i + 1}人目の立替額`} /><Text style={s.yen}>円</Text></View>
            </View>)}
            <Pressable onPress={() => { setPeople((xs) => [...xs, newPerson(xs.length + 1)]); setResult(null); }} style={s.addButton}><Text style={s.addText}>＋ 参加者を追加</Text></Pressable>
            <Text style={[s.mutedSmall, s.hint]}>立替額の合計が会計の合計と一致するよう入力してください。</Text>
            <Pressable onPress={runCalculation} style={[s.primary, !canCalculate && s.primaryDisabled]}><Text style={s.primaryText}>精算を計算する</Text></Pressable>
            {!!validation && <Text style={s.validation}>{validation}</Text>}
          </View>

          {result && <View style={s.resultCard}>
            <View style={s.resultHead}><Text style={s.resultEyebrow}>精算結果</Text><Text style={s.resultTotal}>{fmt(total)}</Text></View>
            <Text style={s.resultSection}>それぞれの負担額</Text>
            {getPersonLabels(people).map((label, i) => <View style={s.resultRow} key={people[i].id}><Text style={s.personName}>{label}</Text><Text style={s.amount}>{fmt(result.owed[i])}</Text></View>)}
            <Text style={[s.resultSection, s.transferTitle]}>送金のお願い</Text>
            {result.transfers.length === 0 ? <Text style={s.muted}>送金はありません。立替額と負担額が一致しています。</Text> : result.transfers.map((t, i) => <View style={s.transferRow} key={`${i}-${t.from}-${t.to}`}><Text style={s.transferNames}>{t.from} <Text style={s.arrow}>→</Text> {t.to}</Text><Text style={s.transferAmount}>{fmt(t.amount)}</Text></View>)}
            <View style={s.actions}><Pressable onPress={share} style={s.secondary}><Text style={s.secondaryText}>結果を共有</Text></Pressable><Pressable onPress={save} style={s.primarySmall}><Text style={s.primaryText}>{savedId ? '保存済み' : '履歴に保存'}</Text></Pressable></View>
            <Text style={s.disclaimer}>端数は1円単位で調整しています。</Text>
          </View>}
          <Text style={s.privacy}>入力内容はこの端末内に保存され、サーバーには送信されません。</Text>
        </>}
        <Text style={s.footer}>割り勘ノート　•　シンプル精算ツール</Text>
      </ScrollView>
      <Modal visible={showPrivacy} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPrivacy(false)}>
        <SafeAreaView style={s.policySafe}>
          <View style={s.policyHeader}><Text style={s.sectionTitle}>プライバシーポリシー</Text><Pressable onPress={() => setShowPrivacy(false)} accessibilityRole="button"><Text style={s.policyClose}>閉じる</Text></Pressable></View>
          <ScrollView contentContainerStyle={s.policyContent}>
            <Text style={s.policyUpdated}>最終更新日: 2026年10月6日</Text>
            <Text style={s.policyTitle}>端末内の情報</Text><Text style={s.policyText}>個人精算の会の名前、参加者名、金額、負担比率、立替額および計算結果は、履歴を保存した場合に端末内に保存されます。履歴はアプリ内から削除できます。</Text>
            <Text style={s.policyTitle}>グループ台帳の情報</Text><Text style={s.policyText}>グループ名、表示名、支出の内容・金額・通貨・換算レート・支払者・負担対象、チェックリストおよび添付領収書はSupabaseへ送信され、同じグループのメンバーと共有されます。アプリを削除してもクラウド上の情報は削除されません。削除を希望する場合は開発者へご連絡ください。</Text>
            <Text style={s.policyTitle}>匿名ID・サービス</Text><Text style={s.policyText}>グループ同期には匿名の利用者IDを使い、メールアドレス登録は求めません。データベース、認証、同期および画像保存はSupabaseを利用します。広告SDK、Analytics SDK、広告目的の追跡は使用していません。</Text>
            <Text style={s.policyTitle}>共有機能</Text><Text style={s.policyText}>結果や招待リンクを共有すると、内容をOSの共有シートに渡します。共有先での取扱いは、利用者が選んだサービスのポリシーに従います。招待リンクは知っている人がグループに参加できるため、共有先にご注意ください。</Text>
            <Text style={s.policyTitle}>お問い合わせ</Text><Text style={s.policyText}>{SUPPORT_EMAIL}</Text>
            <Text style={s.policyText}>機能や取扱いに変更がある場合は、このポリシーとストア上のプライバシー表示を更新します。</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F4' }, container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxWidth: 620, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, topActions: { flexDirection: 'row', gap: 7 }, eyebrow: { color: '#637064', fontSize: 12, fontWeight: '700', letterSpacing: 1 }, brand: { color: '#1C3829', fontSize: 24, fontWeight: '800', marginTop: 2 },
  historyButton: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#E8EEE7' }, historyButtonText: { color: '#31573D', fontWeight: '700' },
  hero: { paddingVertical: 20, paddingHorizontal: 18, borderRadius: 20, backgroundColor: '#E5EFE5', marginBottom: 14 }, heroTitle: { color: '#1F3E2A', fontWeight: '800', fontSize: 20 }, heroSub: { color: '#536B59', marginTop: 6, fontSize: 14 },
  card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 20, marginBottom: 14, shadowColor: '#263629', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }, label: { color: '#57645A', fontWeight: '700', fontSize: 13, marginBottom: 7 }, spaced: { marginTop: 18 }, textInput: { borderWidth: 1, borderColor: '#E4E9E3', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: '#FCFDFC', color: '#1E2D22', fontSize: 16 },
  moneyInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DDE5DC', borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#FCFDFC' }, moneyField: { flex: 1, fontSize: 28, fontWeight: '800', paddingVertical: 12, color: '#1E3828' }, yen: { color: '#68756B', fontSize: 16, fontWeight: '600' },
  peopleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 }, sectionTitle: { color: '#20372A', fontWeight: '800', fontSize: 17 }, mutedSmall: { color: '#89938A', fontSize: 12 }, personCard: { padding: 12, backgroundColor: '#F8FAF7', borderRadius: 14, marginBottom: 9, borderWidth: 1, borderColor: '#EDF0EB' }, personTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 }, nameField: { flex: 1 }, weightField: { width: 76 }, labelSmall: { fontSize: 11, color: '#7A867C', marginBottom: 5, fontWeight: '600' }, center: { textAlign: 'center' }, remove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }, removeText: { color: '#9A6258', fontSize: 25 }, disabled: { color: '#D6DAD5' }, paidInput: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#DDE5DC', paddingHorizontal: 4 }, paidField: { flex: 1, paddingVertical: 8, color: '#293A2C', fontSize: 16 }, addButton: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#A9B9A9', borderRadius: 12, alignItems: 'center', paddingVertical: 12, marginTop: 2 }, addText: { color: '#3B6747', fontWeight: '700' }, hint: { marginTop: 10, lineHeight: 18 },
  primary: { backgroundColor: '#285B39', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 16, marginTop: 18 }, primaryDisabled: { backgroundColor: '#9BA99D' }, primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 }, validation: { color: '#A05A4C', fontSize: 12, lineHeight: 18, marginTop: 8 },
  resultCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#E4EDE3' }, resultHead: { backgroundColor: '#285B39', borderRadius: 15, padding: 16, marginBottom: 20 }, resultEyebrow: { color: '#CDE1CE', fontSize: 12, fontWeight: '700' }, resultTotal: { color: '#FFFFFF', fontWeight: '800', fontSize: 27, marginTop: 4 }, resultSection: { color: '#536255', fontSize: 13, fontWeight: '800', marginBottom: 8 }, resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' }, personName: { color: '#27382B', fontWeight: '700', fontSize: 15 }, amount: { color: '#283C2D', fontWeight: '800', fontSize: 16 }, transferTitle: { marginTop: 22 }, transferRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F5F8F4', padding: 12, borderRadius: 11, marginTop: 6 }, transferNames: { color: '#405345', fontWeight: '600', flexShrink: 1 }, arrow: { color: '#5E8A67', fontWeight: '800' }, transferAmount: { color: '#285B39', fontWeight: '800', marginLeft: 8 }, actions: { flexDirection: 'row', gap: 9, marginTop: 20 }, secondary: { flex: 1, borderWidth: 1, borderColor: '#BDD0BF', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }, secondaryText: { color: '#345C3B', fontWeight: '700' }, primarySmall: { flex: 1, backgroundColor: '#285B39', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }, disclaimer: { color: '#9AA39B', fontSize: 11, marginTop: 12, textAlign: 'center' }, muted: { color: '#879188', fontSize: 14, lineHeight: 21, paddingVertical: 8 },
  privacy: { textAlign: 'center', color: '#89938A', fontSize: 11, lineHeight: 17, marginTop: 8, paddingHorizontal: 12 }, footer: { color: '#A2AAA2', fontSize: 11, textAlign: 'center', marginTop: 22 }, historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: '#EEF1ED' }, historyAmount: { color: '#31573D', fontWeight: '700' }, deleteButton: { alignSelf: 'center', marginTop: 18, padding: 10 }, deleteText: { color: '#A05A4C', fontSize: 13, fontWeight: '600' },
  settingIntro: { color: '#738075', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 10 }, settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderColor: '#EEF1ED' }, settingTitle: { color: '#293B2E', fontWeight: '700', fontSize: 15 }, settingSubtitle: { color: '#879188', fontSize: 12, marginTop: 4 }, settingChevron: { color: '#56725A', fontSize: 22, paddingHorizontal: 6 }, settingFootnote: { color: '#879188', fontSize: 12, marginTop: 16 },
  policySafe: { flex: 1, backgroundColor: '#FFFFFF' }, policyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E8ECE7' }, policyClose: { color: '#315B3C', fontSize: 15, fontWeight: '700' }, policyContent: { paddingHorizontal: 22, paddingVertical: 20, paddingBottom: 40 }, policyUpdated: { color: '#8A948B', fontSize: 12, marginBottom: 18 }, policyTitle: { color: '#294632', fontSize: 16, fontWeight: '800', marginTop: 16, marginBottom: 6 }, policyText: { color: '#536157', fontSize: 14, lineHeight: 22 },
});

