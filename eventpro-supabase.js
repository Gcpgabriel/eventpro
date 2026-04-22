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

  async function updateUserPassword(newPassword){
    const client = getClient();
    if(!client)return { data:null, error:new Error('Supabase indisponivel no navegador.') };
    try{
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
    signOut,
    requestPasswordRecovery,
    updateUserPassword,
    listByEmpresa,
    createByEmpresa,
    updateById,
    removeById,
  };
})();