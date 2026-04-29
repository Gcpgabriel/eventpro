(function(){
  const SUPABASE_URL = 'https://nrizqgtwfwqldxlgnhwh.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jT2V9UPggyfkXrlRos4cLA_OR7W6fNT';

  const TABLES = {
    empresas:'empresas',
    usuarios:'usuarios',
    eventos:'eventos',
    clientes:'clientes',
    financeiro:'financeiro',
    contas:'financeiro',
  };

  let supabaseClient = null;

  function wrapError(error,fallbackMessage){
    if(!error)return null;
    const message = String(error.message||error.error_description||fallbackMessage||'Erro desconhecido');
    return {
      message,
      code:error.code||null,
      status:error.status||null,
      raw:error,
    };
  }

  function getClient(){
    if(supabaseClient)return supabaseClient;
    if(!window.supabase||typeof window.supabase.createClient!=='function')return null;
    supabaseClient = window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true,
      },
    });
    return supabaseClient;
  }

  function getDetachedClient(storageKey){
    if(!window.supabase||typeof window.supabase.createClient!=='function')return null;
    return window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      auth:{
        persistSession:false,
        autoRefreshToken:false,
        detectSessionInUrl:false,
        storageKey:storageKey||`eventpro-detached-${Date.now()}`,
      },
    });
  }

  async function refreshSession(){
    const client = getClient();
    if(!client)return null;
    try{
      const { data, error } = await client.auth.getSession();
      if(error)throw error;
      return data.session||null;
    }catch(error){
      console.warn('Supabase session refresh falhou:',error);
      return null;
    }
  }

  async function signInWithPassword(email,password){
    const client = getClient();
    if(!client)return { data:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };
    try{
      const result = await client.auth.signInWithPassword({ email, password });
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function signUp(email,password,metadata){
    const client = getClient();
    if(!client)return { data:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };
    try{
      const result = await client.auth.signUp({
        email,
        password,
        options:{ data:metadata||{} },
      });
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function createManagedUser(email,password,metadata){
    const client = getDetachedClient(`eventpro-managed-${Date.now()}`);
    if(!client)return { data:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };
    try{
      const result = await client.auth.signUp({
        email,
        password,
        options:{ data:metadata||{} },
      });
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function signOut(){
    const client = getClient();
    if(!client)return { error:null };
    try{
      const result = await client.auth.signOut();
      return result?.error ? { error:wrapError(result.error) } : result;
    }catch(error){
      return { error:wrapError(error) };
    }
  }

  async function requestPasswordRecovery(email,redirectTo){
    const client = getClient();
    if(!client)return { data:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };
    try{
      const result = await client.auth.resetPasswordForEmail(email,{ redirectTo });
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  function readAuthParamsFromUrl(){
    try{
      const query = new URLSearchParams(window.location.search||'');
      const hash = new URLSearchParams((window.location.hash||'').replace(/^#/,''));
      return {
        code:query.get('code')||null,
        accessToken:hash.get('access_token')||null,
        refreshToken:hash.get('refresh_token')||null,
        tokenHash:query.get('token_hash')||hash.get('token_hash')||null,
        type:query.get('type')||hash.get('type')||null,
      };
    }catch(_error){
      return { code:null, accessToken:null, refreshToken:null, tokenHash:null, type:null };
    }
  }

  function clearRecoveryParamsFromUrl(){
    try{
      const url = new URL(window.location.href);
      ['code','type','token_hash','access_token','refresh_token','expires_at','expires_in'].forEach(function(key){
        url.searchParams.delete(key);
      });

      const hash = new URLSearchParams((url.hash||'').replace(/^#/,''));
      ['access_token','refresh_token','expires_at','expires_in','token_type','type','token_hash'].forEach(function(key){
        hash.delete(key);
      });

      const hashStr = hash.toString();
      const sanitized = `${url.pathname}${url.search}${hashStr?`#${hashStr}`:''}`;
      window.history.replaceState({},'',sanitized);
    }catch(_error){
      // noop
    }
  }

  async function prepareRecoverySessionFromUrl(options){
    const opts = options||{};
    const client = getClient();
    if(!client)return { sessionEstablished:false, source:'no-client', session:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };

    try{
      const current = await client.auth.getSession();
      if(current?.data?.session){
        return { sessionEstablished:true, source:'existing-session', session:current.data.session, error:null };
      }
    }catch(_error){
      // Continue tentando via URL.
    }

    const p = readAuthParamsFromUrl();
    try{
      if(p.code){
        const exchanged = await client.auth.exchangeCodeForSession(p.code);
        if(exchanged?.error)return { sessionEstablished:false, source:'code', session:null, error:wrapError(exchanged.error) };
        clearRecoveryParamsFromUrl();
        return { sessionEstablished:!!exchanged?.data?.session, source:'code', session:exchanged?.data?.session||null, error:null };
      }

      if(p.accessToken&&p.refreshToken){
        const setRes = await client.auth.setSession({ access_token:p.accessToken, refresh_token:p.refreshToken });
        if(setRes?.error)return { sessionEstablished:false, source:'token', session:null, error:wrapError(setRes.error) };
        clearRecoveryParamsFromUrl();
        return { sessionEstablished:!!setRes?.data?.session, source:'token', session:setRes?.data?.session||null, error:null };
      }

      if(p.tokenHash&&(p.type||'').toLowerCase()==='recovery'){
        const verified = await client.auth.verifyOtp({ type:'recovery', token_hash:p.tokenHash });
        if(verified?.error)return { sessionEstablished:false, source:'otp', session:null, error:wrapError(verified.error) };
        clearRecoveryParamsFromUrl();
        return { sessionEstablished:!!verified?.data?.session, source:'otp', session:verified?.data?.session||null, error:null };
      }

      if(opts.requireSession){
        return { sessionEstablished:false, source:'missing-params', session:null, error:wrapError(new Error('Link de recuperação inválido ou expirado.')) };
      }
      return { sessionEstablished:false, source:'none', session:null, error:null };
    }catch(error){
      return { sessionEstablished:false, source:'exception', session:null, error:wrapError(error) };
    }
  }

  async function updateUserMetadata(metadataFields){
    const client = getClient();
    if(!client)return { data:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };
    try{
      const result = await client.auth.updateUser({ data: metadataFields });
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function updateUserPassword(newPassword){
    const client = getClient();
    if(!client)return { data:null, error:wrapError(new Error('Supabase indisponível no navegador.')) };
    try{
      const prepared = await prepareRecoverySessionFromUrl({ requireSession:false });
      if(prepared?.error){
        console.warn('Falha ao preparar sessão de recuperação:',prepared.error);
      }

      const currentSession = await client.auth.getSession();
      if(!currentSession?.data?.session){
        return { data:null, error:wrapError(new Error('Sessão de recuperação inválida ou expirada. Solicite um novo link.')) };
      }

      const response = await client.auth.updateUser({ password:newPassword });
      if(response?.error)return { data:null, error:wrapError(response.error) };
      return response;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function listByEmpresa(table,empresaId,options){
    const client = getClient();
    if(!client||!table||!empresaId)return { data:null, error:wrapError(new Error('Parâmetros inválidos para consulta.')) };
    try{
      let query = client.from(table).select(options?.select||'*').eq('empresa_id',empresaId);
      if(options?.orderBy){
        query = query.order(options.orderBy.column,{ ascending:options.orderBy.ascending!==false });
      }
      if(Number.isFinite(Number(options?.limit))){
        query = query.limit(Number(options.limit));
      }
      const result = await query;
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function createByEmpresa(table,empresaId,payload){
    const client = getClient();
    if(!client||!table||!empresaId||!payload)return { data:null, error:wrapError(new Error('Parâmetros inválidos para criação.')) };
    try{
      const result = await client.from(table).insert({ ...payload, empresa_id:empresaId }).select().single();
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function updateById(table,id,payload){
    const client = getClient();
    if(!client||!table||!id||!payload)return { data:null, error:wrapError(new Error('Parâmetros inválidos para atualização.')) };
    try{
      const result = await client.from(table).update(payload).eq('id',id).select().single();
      return result?.error ? { data:null, error:wrapError(result.error) } : result;
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function removeById(table,id){
    const client = getClient();
    if(!client||!table||!id)return { error:wrapError(new Error('Parâmetros inválidos para remoção.')) };
    try{
      const result = await client.from(table).delete().eq('id',id);
      return result?.error ? { error:wrapError(result.error) } : result;
    }catch(error){
      return { error:wrapError(error) };
    }
  }

  async function pushSnapshot(empresaId,dbAll,clistsAll){
    const client = getClient();
    if(!client||!empresaId)return { error:wrapError(new Error('Parâmetros inválidos para pushSnapshot.')) };
    try{
      const payload = JSON.stringify({ db:dbAll, clists:clistsAll, ts:Date.now() });
      const result = await client
        .from('company_snapshots')
        .upsert(
          { empresa_id:Number(empresaId), data:payload, updated_at:new Date().toISOString() },
          { onConflict:'empresa_id' }
        );
      return result?.error ? { error:wrapError(result.error) } : result;
    }catch(error){
      return { error:wrapError(error) };
    }
  }

  async function pullSnapshot(empresaId){
    const client = getClient();
    if(!client||!empresaId)return { data:null, error:wrapError(new Error('Parâmetros inválidos para pullSnapshot.')) };
    try{
      const { data, error } = await client
        .from('company_snapshots')
        .select('data,updated_at')
        .eq('empresa_id',Number(empresaId))
        .maybeSingle();

      if(error)return { data:null, error:wrapError(error) };
      if(!data||!data.data)return { data:null, error:null };

      return {
        data:JSON.parse(data.data),
        updatedAt:data.updated_at,
        error:null,
      };
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function pullSnapshotByUserEmail(userEmail){
    const client = getClient();
    const email = String(userEmail||'').trim().toLowerCase();
    if(!client||!email)return { data:null, error:wrapError(new Error('Parâmetros inválidos para pullSnapshotByUserEmail.')) };
    try{
      const { data, error } = await client
        .from('company_snapshots')
        .select('empresa_id,data,updated_at')
        .order('updated_at',{ ascending:false })
        .limit(50);

      if(error)return { data:null, error:wrapError(error) };
      if(!Array.isArray(data)||!data.length)return { data:null, error:null };

      for(const row of data){
        if(!row?.data)continue;
        let parsed = null;
        try{
          parsed = JSON.parse(row.data);
        }catch(_ignore){
          continue;
        }

        const users = Array.isArray(parsed?.db?.users) ? parsed.db.users : [];
        const found = users.some(function(user){
          return String(user?.email||'').trim().toLowerCase()===email;
        });

        if(found){
          return {
            data:parsed,
            empresaId:Number(row.empresa_id),
            updatedAt:row.updated_at,
            error:null,
          };
        }
      }

      return { data:null, error:null };
    }catch(error){
      return { data:null, error:wrapError(error) };
    }
  }

  async function healthCheck(){
    const client = getClient();
    if(!client)return { ok:false, reason:'no-client', error:wrapError(new Error('SDK Supabase indisponível.')) };
    try{
      const session = await refreshSession();
      const snapshotCheck = await client
        .from('company_snapshots')
        .select('empresa_id')
        .limit(1);
      return {
        ok:!snapshotCheck?.error,
        sessionActive:!!session,
        snapshotAccessible:!snapshotCheck?.error,
        error:snapshotCheck?.error?wrapError(snapshotCheck.error):null,
      };
    }catch(error){
      return { ok:false, reason:'exception', error:wrapError(error) };
    }
  }

  const client = getClient();
  if(client){
    client.auth.onAuthStateChange(function(event,session){
      window.dispatchEvent(new CustomEvent('eventpro:supabase-auth',{ detail:{ event, session:session||null } }));
    });
  }

  window.EventProSupabase = {
    config:{
      url:SUPABASE_URL,
      publishableKey:SUPABASE_PUBLISHABLE_KEY,
      tables:TABLES,
    },
    getClient,
    refreshSession,
    signInWithPassword,
    signUp,
    createManagedUser,
    signOut,
    requestPasswordRecovery,
    prepareRecoverySessionFromUrl,
    updateUserPassword,
    listByEmpresa,
    createByEmpresa,
    updateById,
    removeById,
    pushSnapshot,
    pullSnapshot,
    pullSnapshotByUserEmail,
    healthCheck,
    subscribeToSnapshot,
    unsubscribeFromSnapshot,
    updateUserMetadata,
  };
})();

let _realtimeChannel = null;

function subscribeToSnapshot(empresaId, onUpdate) {
  const client = window.EventProSupabase?.getClient?.();
  if (!client || !empresaId) return;
  // Cancela canal anterior se existir
  if (_realtimeChannel) {
    client.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  _realtimeChannel = client
    .channel('snapshot-' + empresaId)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'company_snapshots', filter: 'empresa_id=eq.' + Number(empresaId) },
      function(payload) {
        if (typeof onUpdate === 'function') onUpdate(payload);
      }
    )
    .subscribe(function(status) {
      console.log('[Realtime] status:', status);
    });
}

function unsubscribeFromSnapshot() {
  const client = window.EventProSupabase?.getClient?.();
  if (client && _realtimeChannel) {
    client.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}
