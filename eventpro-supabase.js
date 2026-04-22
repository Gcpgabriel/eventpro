(function(){
  const SUPABASE_URL = 'https://nrizqgtwfwqldxlgnhwh.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_jT2V9UPggyfkXrlRos4cLA_OR7W6fNT';
  let supabaseClient = null;
  const TABLES = {
    empresas:'empresas',
    usuarios:'usuarios',
    eventos:'eventos',
    clientes:'clientes',
    financeiro:'financeiro',
    contas:'financeiro',
  };

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
    if(!client)return { data:null, error:new Error('Supabase indisponivel no navegador.') };
    try{
      return await client.auth.signInWithPassword({ email, password });
    }catch(error){
      return { data:null, error };
    }
  }

  async function signUp(email,password,metadata){
    const client = getClient();
    if(!client)return { data:null, error:new Error('Supabase indisponivel no navegador.') };
    try{
      return await client.auth.signUp({
        email,
        password,
        options:{ data:metadata||{} },
      });
    }catch(error){
      return { data:null, error };
    }
  }

  async function createManagedUser(email,password,metadata){
    const client = getDetachedClient(`eventpro-managed-${Date.now()}`);
    if(!client)return { data:null, error:new Error('Supabase indisponivel no navegador.') };
    try{
      return await client.auth.signUp({
        email,
        password,
        options:{ data:metadata||{} },
      });
    }catch(error){
      return { data:null, error };
    }
  }

  async function signOut(){
    const client = getClient();
    if(!client)return { error:null };
    try{
      return await client.auth.signOut();
    }catch(error){
      return { error };
    }
  }

  async function requestPasswordRecovery(email,redirectTo){
    const client = getClient();
    if(!client)return { data:null, error:new Error('Supabase indisponivel no navegador.') };
    try{
      return await client.auth.resetPasswordForEmail(email,{
        redirectTo,
      });
    }catch(error){
      return { data:null, error };
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
      return {
        code:null,
        accessToken:null,
        refreshToken:null,
        tokenHash:null,
        type:null,
      };
    }
  }

  function clearRecoveryParamsFromUrl(){
    try{
      const url = new URL(window.location.href);
      [
        'code',
        'type',
        'token_hash',
        'access_token',
        'refresh_token',
        'expires_at',
        'expires_in',
      ].forEach(function(key){
        url.searchParams.delete(key);
      });
      const hash = new URLSearchParams((url.hash||'').replace(/^#/,''));
      [
        'access_token',
        'refresh_token',
        'expires_at',
        'expires_in',
        'token_type',
        'type',
        'token_hash',
      ].forEach(function(key){
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
    if(!client)return { sessionEstablished:false, error:new Error('Supabase indisponivel no navegador.') };

    try{
      const current = await client.auth.getSession();
      if(current?.data?.session){
        return { sessionEstablished:true, source:'existing-session', session:current.data.session, error:null };
      }
    }catch(_error){
      // Continue tentando com tokens da URL.
    }

    const p = readAuthParamsFromUrl();
    try{
      if(p.code){
        const exchanged = await client.auth.exchangeCodeForSession(p.code);
        if(exchanged?.error)return { sessionEstablished:false, source:'code', session:null, error:exchanged.error };
        clearRecoveryParamsFromUrl();
        return { sessionEstablished:!!exchanged?.data?.session, source:'code', session:exchanged?.data?.session||null, error:null };
      }

      if(p.accessToken&&p.refreshToken){
        const setRes = await client.auth.setSession({
          access_token:p.accessToken,
          refresh_token:p.refreshToken,
        });
        if(setRes?.error)return { sessionEstablished:false, source:'token', session:null, error:setRes.error };
        clearRecoveryParamsFromUrl();
        return { sessionEstablished:!!setRes?.data?.session, source:'token', session:setRes?.data?.session||null, error:null };
      }

      if(p.tokenHash&&(p.type||'').toLowerCase()==='recovery'){
        const verified = await client.auth.verifyOtp({
          type:'recovery',
          token_hash:p.tokenHash,
        });
        if(verified?.error)return { sessionEstablished:false, source:'otp', session:null, error:verified.error };
        clearRecoveryParamsFromUrl();
        return { sessionEstablished:!!verified?.data?.session, source:'otp', session:verified?.data?.session||null, error:null };
      }

      if(opts.requireSession){
        return { sessionEstablished:false, source:'missing-params', session:null, error:new Error('Link de recuperação inválido ou expirado.') };
      }
      return { sessionEstablished:false, source:'none', session:null, error:null };
    }catch(error){
      return { sessionEstablished:false, source:'exception', session:null, error };
    }
  }

  async function updateUserPassword(newPassword){
    const client = getClient();
    if(!client)return { data:null, error:new Error('Supabase indisponivel no navegador.') };
    try{
      const prepared = await prepareRecoverySessionFromUrl({ requireSession:false });
      if(prepared?.error){
        console.warn('Falha ao preparar sessão de recuperação:',prepared.error);
      }
      const currentSession = await client.auth.getSession();
      if(!currentSession?.data?.session){
        return { data:null, error:new Error('Sessão de recuperação inválida ou expirada. Solicite um novo link.') };
      }
      const response = await client.auth.updateUser({
        password:newPassword,
      });
      if(response?.error)return { data:null, error:response.error };
      await new Promise(r=>setTimeout(r,500));
      const { data, error } = await client.auth.getSession();
      if(error)console.warn('Erro ao verificar sessão após atualização:',error);
      console.log('Senha atualizada com sucesso. Sessão atual:',data?.session?'Ativa':'Inativa');
      return response;
    }catch(error){
      console.error('Erro crítico ao atualizar senha:',error);
      return { data:null, error };
    }
  }

  async function listByEmpresa(table,empresaId,options){
    const client = getClient();
    if(!client||!table||!empresaId)return { data:null, error:new Error('Parâmetros inválidos para consulta.') };
    try{
      let query = client.from(table).select(options?.select||'*').eq('empresa_id',empresaId);
      if(options?.orderBy){
        query = query.order(options.orderBy.column,{ ascending:options.orderBy.ascending!==false });
      }
      if(Number.isFinite(Number(options?.limit))){
        query = query.limit(Number(options.limit));
      }
      return await query;
    }catch(error){
      return { data:null, error };
    }
  }

  async function createByEmpresa(table,empresaId,payload){
    const client = getClient();
    if(!client||!table||!empresaId||!payload)return { data:null, error:new Error('Parâmetros inválidos para criação.') };
    try{
      return await client.from(table).insert({ ...payload, empresa_id:empresaId }).select().single();
    }catch(error){
      return { data:null, error };
    }
  }

  async function updateById(table,id,payload){
    const client = getClient();
    if(!client||!table||!id||!payload)return { data:null, error:new Error('Parâmetros inválidos para atualização.') };
    try{
      return await client.from(table).update(payload).eq('id',id).select().single();
    }catch(error){
      return { data:null, error };
    }
  }

  async function removeById(table,id){
    const client = getClient();
    if(!client||!table||!id)return { error:new Error('Parâmetros inválidos para remoção.') };
    try{
      return await client.from(table).delete().eq('id',id);
    }catch(error){
      return { error };
    }
  }

  async function pushSnapshot(empresaId,dbAll,clistsAll){
    const c = getClient();
    if(!c||!empresaId)return { error:new Error('Parâmetros inválidos para pushSnapshot.') };
    try{
      const payload=JSON.stringify({ db:dbAll, clists:clistsAll, ts:Date.now() });
      return await c
        .from('company_snapshots')
        .upsert(
          { empresa_id:Number(empresaId), data:payload, updated_at:new Date().toISOString() },
          { onConflict:'empresa_id' }
        );
    }catch(error){
      return { error };
    }
  }

  async function pullSnapshot(empresaId){
    const c = getClient();
    if(!c||!empresaId)return { data:null, error:new Error('Parâmetros inválidos para pullSnapshot.') };
    try{
      const { data, error } = await c
        .from('company_snapshots')
        .select('data,updated_at')
        .eq('empresa_id',Number(empresaId))
        .maybeSingle();
      if(error)return { data:null, error };
      if(!data||!data.data)return { data:null, error:null };
      return { data:JSON.parse(data.data), updatedAt:data.updated_at, error:null };
    }catch(error){
      return { data:null, error };
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
    pushSnapshot,
    pullSnapshot,
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
  };
})();