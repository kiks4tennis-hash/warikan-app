import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ensureAnonymousUser, joinGroupByInvite } from '../../lib/groups';
import { isSupabaseConfigured } from '../../lib/supabase';

export default function JoinInviteScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string | string[] }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onJoin() {
    if (!isSupabaseConfigured || !token || !displayName.trim()) return;
    setBusy(true);
    setError('');
    try {
      await ensureAnonymousUser();
      const groupId = await joinGroupByInvite(token, displayName);
      router.replace({ pathname: '/groups/[id]', params: { id: groupId } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '参加できませんでした。招待リンクが期限切れか確認してください。');
    } finally { setBusy(false); }
  }

  return <SafeAreaView style={s.safe}>
    <View style={s.content}>
      <Text style={s.eyebrow}>割り勘ノート</Text>
      <Text style={s.title}>グループに参加</Text>
      <Text style={s.body}>招待されたグループの支払い記録とチェックリストを共有します。参加時に表示名を設定してください。</Text>
      {!isSupabaseConfigured ? <Text style={s.error}>Supabaseの接続設定が必要です。</Text> : <>
        <Text style={s.label}>表示名</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} maxLength={32} placeholder="例：かず" style={s.input} />
        <Pressable onPress={() => void onJoin()} disabled={busy || !displayName.trim()} style={[s.primary, (busy || !displayName.trim()) && s.disabled]}>
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>参加する</Text>}
        </Pressable>
        {!!error && <Text style={s.error}>{error}</Text>}
      </>}
      <Pressable onPress={() => router.replace('/groups')} style={s.cancel}><Text style={s.cancelText}>グループ一覧へ</Text></Pressable>
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F4', justifyContent: 'center' },
  content: { padding: 24, backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 22 },
  eyebrow: { color: '#6C7A6D', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  title: { color: '#1C3829', fontSize: 25, fontWeight: '800', marginTop: 6 },
  body: { color: '#69756B', fontSize: 14, lineHeight: 21, marginTop: 10 },
  label: { color: '#57645A', fontSize: 13, fontWeight: '700', marginTop: 21, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: '#E4E9E3', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, backgroundColor: '#FCFDFC', fontSize: 16, color: '#20372A' },
  primary: { backgroundColor: '#285B39', borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 16 },
  primaryText: { color: '#FFF', fontWeight: '800', fontSize: 15 }, disabled: { opacity: 0.55 },
  error: { color: '#A04436', fontSize: 13, lineHeight: 19, marginTop: 14 },
  cancel: { alignSelf: 'center', padding: 14, marginTop: 4 }, cancelText: { color: '#537059', fontWeight: '700' },
});

