import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCIES, type CurrencyCode, type GroupKind } from './domain';
import { createGroup, ensureAnonymousUser, listMyGroups, type GroupSummary } from '../lib/groups';
import { isSupabaseConfigured } from '../lib/supabase';

const KINDS: { key: GroupKind; label: string }[] = [
  { key: 'trip', label: '旅行' }, { key: 'event', label: 'イベント' },
  { key: 'household', label: '家計' }, { key: 'shared-home', label: 'ルームシェア' },
];

export default function GroupsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<GroupKind>('trip');
  const [currency, setCurrency] = useState<CurrencyCode>('JPY');
  const [showCurrencies, setShowCurrencies] = useState(false);
  const [error, setError] = useState('');

  async function refresh(id = userId) {
    if (!id) return;
    const rows = await listMyGroups(id);
    setGroups(rows);
  }

  useEffect(() => {
    let active = true;
    async function boot() {
      if (!isSupabaseConfigured) { setLoading(false); return; }
      try {
        const user = await ensureAnonymousUser();
        if (!active) return;
        setUserId(user.id);
        await refresh(user.id);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : '接続できませんでした。');
      } finally {
        if (active) setLoading(false);
      }
    }
    void boot();
    return () => { active = false; };
  }, []);

  async function onCreate() {
    if (!title.trim() || !displayName.trim()) {
      Alert.alert('入力してください', 'グループ名とあなたの表示名が必要です。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = await createGroup({ title, kind, baseCurrency: currency, displayName });
      await refresh();
      setTitle('');
      router.push({ pathname: '/groups/[id]', params: { id } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'グループを作成できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Pressable onPress={() => router.back()}><Text style={s.back}>‹ 戻る</Text></Pressable>
          <Text style={s.brand}>グループ台帳</Text>
        </View>

        {!isSupabaseConfigured ? <View style={s.card}>
          <Text style={s.title}>Supabaseの接続設定が必要です</Text>
          <Text style={s.body}>この機能ではグループの支出とチェックリストをメンバー間で同期します。プロジェクトのURLとPublishable keyを設定すると使えるようになります。</Text>
          <Text style={s.note}>設定方法は docs/SUPABASE_SETUP.md を参照してください。</Text>
        </View> : loading ? <ActivityIndicator size="large" color="#285B39" /> : <>
          <View style={s.card}>
            <Text style={s.title}>新しいグループ</Text>
            <Text style={s.label}>グループ名</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="例：沖縄旅行" maxLength={60} style={s.input} />
            <Text style={s.label}>あなたの表示名</Text>
            <TextInput value={displayName} onChangeText={setDisplayName} placeholder="例：かず" maxLength={32} style={s.input} />
            <Text style={s.label}>使い方</Text>
            <View style={s.kindRow}>{KINDS.map((option) => <Pressable key={option.key} onPress={() => setKind(option.key)} style={[s.kind, kind === option.key && s.kindSelected]}><Text style={[s.kindText, kind === option.key && s.kindTextSelected]}>{option.label}</Text></Pressable>)}</View>
            <Text style={s.label}>基準通貨</Text>
            <Pressable style={s.input} onPress={() => setShowCurrencies(true)}><Text style={s.inputText}>{CURRENCIES.find((item) => item.code === currency)?.name}（{currency}）　›</Text></Pressable>
            <Pressable onPress={onCreate} disabled={busy} style={[s.primary, busy && s.disabled]}><Text style={s.primaryText}>{busy ? '作成中…' : 'グループを作成'}</Text></Pressable>
          </View>

          <View style={s.card}>
            <View style={s.listHeader}><Text style={s.title}>参加中のグループ</Text><Pressable onPress={() => void refresh()}><Text style={s.refresh}>更新</Text></Pressable></View>
            {groups.length === 0 ? <Text style={s.body}>まだグループはありません。作成するか、招待リンクから参加してください。</Text> : groups.map((group) => <Pressable key={group.id} onPress={() => router.push({ pathname: '/groups/[id]', params: { id: group.id } })} style={s.groupRow}>
              <View style={s.groupIcon}><Text style={s.groupIconText}>{group.kind === 'trip' ? '✈' : group.kind === 'household' ? '⌂' : '◉'}</Text></View>
              <View style={s.grow}><Text style={s.groupTitle}>{group.title}</Text><Text style={s.groupMeta}>{KINDS.find((item) => item.key === group.kind)?.label} · {group.baseCurrency}</Text></View>
              <Text style={s.chevron}>›</Text>
            </Pressable>)}
          </View>
          {!!error && <Text style={s.error}>{error}</Text>}
          <Text style={s.privacy}>グループ台帳はSupabaseに保存され、参加メンバー間で共有されます。</Text>
        </>}
      </ScrollView>

      <Modal visible={showCurrencies} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCurrencies(false)}>
        <SafeAreaView style={s.modalSafe}>
          <View style={s.modalHeader}><Text style={s.title}>基準通貨を選択</Text><Pressable onPress={() => setShowCurrencies(false)}><Text style={s.refresh}>閉じる</Text></Pressable></View>
          <ScrollView>{CURRENCIES.map((item) => <Pressable key={item.code} onPress={() => { setCurrency(item.code); setShowCurrencies(false); }} style={s.currencyRow}><Text style={s.groupTitle}>{item.name}</Text><Text style={s.groupMeta}>{item.code} · {item.symbol}</Text></Pressable>)}</ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F4' }, page: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 36, maxWidth: 620, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 }, back: { color: '#31573D', fontSize: 16, fontWeight: '700' }, brand: { color: '#1C3829', fontSize: 22, fontWeight: '800' },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14 }, title: { color: '#20372A', fontSize: 17, fontWeight: '800' }, body: { color: '#647166', fontSize: 14, lineHeight: 21, marginTop: 10 }, note: { color: '#31573D', fontSize: 13, lineHeight: 19, marginTop: 14 },
  label: { color: '#57645A', fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 }, input: { borderWidth: 1, borderColor: '#E4E9E3', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#20372A', backgroundColor: '#FCFDFC', fontSize: 15 }, inputText: { color: '#20372A', fontSize: 15 }, kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, kind: { borderWidth: 1, borderColor: '#D9E2D7', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20 }, kindSelected: { backgroundColor: '#285B39', borderColor: '#285B39' }, kindText: { color: '#526356', fontWeight: '700' }, kindTextSelected: { color: '#FFF' },
  primary: { backgroundColor: '#285B39', borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 18 }, primaryText: { color: '#FFF', fontWeight: '800', fontSize: 15 }, disabled: { opacity: 0.55 }, listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, refresh: { color: '#3F704C', fontWeight: '700', padding: 4 }, groupRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EEF1ED', gap: 12 }, groupIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EAF1E8', alignItems: 'center', justifyContent: 'center' }, groupIconText: { color: '#3F704C', fontSize: 21, fontWeight: '700' }, grow: { flex: 1 }, groupTitle: { color: '#27382B', fontSize: 15, fontWeight: '700' }, groupMeta: { color: '#879188', fontSize: 12, marginTop: 4 }, chevron: { color: '#819081', fontSize: 23 }, error: { color: '#A04436', backgroundColor: '#FCEDEA', padding: 12, borderRadius: 10, lineHeight: 20, marginBottom: 12 }, privacy: { color: '#8B958B', fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 10 },
  modalSafe: { flex: 1, backgroundColor: '#FFF' }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#E8ECE7' }, currencyRow: { paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F0F2EF' },
});

