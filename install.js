const installAssistant = (() => {
  const mdRoot = 'install';
  const screenEl = () => document.getElementById('install-screen');

  const state = {
    ok: false,
    running: false,
    details: null,
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function setStatus(title, subtitle, badgeText = 'Checking…') {
    getEl('install-title').textContent = title;
    getEl('install-subtitle').textContent = subtitle;
    getEl('install-status-badge').textContent = badgeText;
  }

  async function renderMarkdown(path, fallbackHtml) {
    const container = getEl('install-markdown');
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error('markdown fetch failed');
      const md = await res.text();
      container.innerHTML = marked.parse(md);
    } catch {
      container.innerHTML = fallbackHtml;
    }
  }

  async function checkSupabaseConnectivity() {
    const isPlaceholder = (value) => {
      if (!value || typeof value !== 'string') return true;
      const trimmed = value.trim();
      if (!trimmed) return true;
      return trimmed.includes('XXXXXXXX') || trimmed.includes('YOUR_') || trimmed.includes('example');
    };

    if (isPlaceholder(SUPABASE_URL) || isPlaceholder(SUPABASE_KEY)) {
      return { ok: false, reason: 'connection_config' };
    }

    try {
      const { error } = await sb.from('profiles').select('id').limit(1);
      if (!error) return { ok: true };
      if (error.code === '42P01') return { ok: false, reason: 'missing_schema', error };
      if ((error.message || '').toLowerCase().includes('relation') && (error.message || '').toLowerCase().includes('does not exist')) {
        return { ok: false, reason: 'missing_schema', error };
      }
      return { ok: false, reason: 'connection', error };
    } catch (error) {
      return { ok: false, reason: 'connection', error };
    }
  }

  async function tryAutoInstallSchema() {
    try {
      const sqlRes = await fetch('sql/00_fresh_install.sql', { cache: 'no-store' });
      if (!sqlRes.ok) return { ok: false, reason: 'sql_fetch_failed' };
      const sql = await sqlRes.text();

      // Tentatives d'auto-install (si un RPC admin existe déjà côté projet).
      const candidates = [
        { fn: 'run_sql', args: { sql_query: sql } },
        { fn: 'run_sql', args: { p_sql: sql } },
        { fn: 'execute_sql', args: { sql_query: sql } },
        { fn: 'execute_sql', args: { p_sql: sql } },
      ];

      for (const candidate of candidates) {
        const { error } = await sb.rpc(candidate.fn, candidate.args);
        if (!error) return { ok: true, mode: `rpc:${candidate.fn}` };
      }

      return { ok: false, reason: 'no_rpc_runner' };
    } catch {
      return { ok: false, reason: 'auto_install_failed' };
    }
  }

  async function checkDiscordProvider() {
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          skipBrowserRedirect: true,
          redirectTo: window.location.origin + window.location.pathname,
        }
      });
      if (!error) return { ok: true };
      return { ok: false, error };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function showInstallScreen() {
    screenEl()?.classList.add('active');
    getEl('auth-screen')?.classList.remove('active');
    getEl('loading-overlay')?.classList.remove('active');
    getEl('app').style.display = 'none';
  }

  function hideInstallScreen() {
    screenEl()?.classList.remove('active');
  }

  async function runChecks() {
    if (state.running) return state.ok;
    state.running = true;

    showInstallScreen();
    getEl('install-retry-btn').disabled = true;
    getEl('install-open-sql-btn').style.display = 'none';
    setStatus('Installation Assistant', 'Checking the Supabase and Discord configuration…', 'Checking');
    await renderMarkdown(`${mdRoot}/install-schema.md`, '<p>Verification in progress…</p>');

    const results = {
      supabaseCheck: await checkSupabaseConnectivity(),
      autoInstall: null,
      afterInstall: null,
      discordCheck: null,
    };

    if (!results.supabaseCheck.ok && results.supabaseCheck.reason === 'missing_schema') {
      results.autoInstall = await tryAutoInstallSchema();
      results.afterInstall = results.autoInstall.ok ? await checkSupabaseConnectivity() : results.supabaseCheck;
    }

    if (!results.supabaseCheck.ok && ['connection', 'connection_config'].includes(results.supabaseCheck.reason)) {
      state.ok = false;
      state.details = { stage: 'supabase_connection', ...results };
      setStatus('Supabase login required', 'Camply cannot connect to Supabase.', 'Action required');
      await renderMarkdown(`${mdRoot}/install-supabase-connection.md`, '<p>Check the Supabase configuration in <code>supabase-client.js</code>.</p>');
      getEl('install-retry-btn').disabled = false;
      state.running = false;
      return false;
    }

    // L'auth Discord est vérifiée uniquement si la connexion Supabase est fonctionnelle.
    results.discordCheck = await checkDiscordProvider();

    if (!results.supabaseCheck.ok && results.supabaseCheck.reason === 'missing_schema' && !results.afterInstall?.ok) {
      state.ok = false;
      state.details = { stage: 'schema', ...results };
      setStatus('Database to initialize', 'The SQL structure could not be installed automatically.', 'Action required');
      await renderMarkdown(`${mdRoot}/install-schema.md`, '<p>Run the command <code>sql/00_fresh_install.sql</code> in Supabase SQL Editor and then try again.</p>');
      getEl('install-open-sql-btn').style.display = 'inline-flex';
      getEl('install-retry-btn').disabled = false;
      state.running = false;
      return false;
    }

    if (!results.discordCheck.ok) {
      state.ok = false;
      state.details = { stage: 'discord', ...results };
      setStatus('Discord configuration required.', 'The Discord provider appears to be unconfigured on Supabase\'s side.', 'Action required');
      await renderMarkdown(`${mdRoot}/install-discord.md`, '<p>Activate the Discord provider in Supabase Auth and then try again.</p>');
      getEl('install-retry-btn').disabled = false;
      state.running = false;
      return false;
    }

    state.ok = true;
    state.details = { stage: 'ok' };
    hideInstallScreen();
    state.running = false;
    return true;
  }

  function canEnterApp() {
    return state.ok;
  }

  async function retry() {
    const ok = await runChecks();
    if (ok && typeof window.bootCamplyApp === 'function') {
      await window.bootCamplyApp();
    }
    return ok;
  }

  function openFreshInstallSql() {
    window.open('sql/00_fresh_install.sql', '_blank', 'noopener,noreferrer');
  }

  return {
    runChecks,
    canEnterApp,
    retry,
    openFreshInstallSql,
  };
})();

window.installAssistant = installAssistant;
window.retryInstallationChecks = () => installAssistant.retry();
window.openFreshInstallSql = () => installAssistant.openFreshInstallSql();
