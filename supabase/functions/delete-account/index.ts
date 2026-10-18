import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }

  const authorization = request.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !url || !publishableKey || !serviceRoleKey) {
    return Response.json({ error: 'Account deletion is not configured.' }, { status: 500, headers: corsHeaders });
  }

  const token = authorization.slice('Bearer '.length);
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: 'Sign in again before deleting this account.' }, { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: paths, error: cleanupError } = await userClient.rpc('prepare_my_account_deletion');
  if (cleanupError) {
    return Response.json({ error: 'Could not prepare account data for deletion.' }, { status: 500, headers: corsHeaders });
  }

  const objectPaths = Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [];
  if (objectPaths.length > 0) {
    const { error: storageError } = await admin.storage.from('group-receipts').remove(objectPaths);
    if (storageError) {
      return Response.json({ error: 'Could not delete attached receipt images. Please retry.' }, { status: 500, headers: corsHeaders });
    }
  }

  const { error: queueError } = await admin
    .from('account_deletion_storage_queue')
    .delete()
    .eq('user_id', userData.user.id);
  if (queueError) {
    return Response.json({ error: 'Could not finish deleting attached receipt images. Please retry.' }, { status: 500, headers: corsHeaders });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return Response.json({ error: 'Could not delete the account. Please retry.' }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ success: true }, { status: 200, headers: corsHeaders });
});
