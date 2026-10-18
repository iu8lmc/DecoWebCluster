// Area personale degli OM: registrazione, accesso con link via email, profilo, log ADIF sul server, impostazioni, amministrazione.
// Il server (servizio iq8do-accounts, /api/) tiene solo i dati del proprietario; qui c'e' l'interfaccia.

const L = {
  it: {
    btn: 'Area personale', title: 'Area personale OM', close: 'Chiudi',
    tReg: 'Registrati', tLogin: 'Ho già un account',
    call: 'Nominativo', email: 'Email', name: 'Nome (facoltativo)', consent: 'Ho letto l\'informativa e acconsento al trattamento dei dati.',
    privacyT: 'Informativa sulla privacy',
    privacy: 'Titolare del trattamento: A.R.I. Caserta (IQ8DO). Dati trattati: nominativo, email, nome, QTH e dati della stazione (facoltativi), log ADIF (facoltativo) e preferenze del cluster. Finalità: offrirti l\'area personale del DX Cluster (profilo, log sincronizzato tra i tuoi dispositivi, impostazioni). Base giuridica: il tuo consenso. Conservazione: fino a quando cancelli l\'account; puoi scaricare tutti i tuoi dati o cancellarli in ogni momento dalla scheda Account. Il tuo log è visibile solo a te (e non agli altri OM); i dati non sono ceduti a terzi. L\'email con il link di accesso parte dal sito aricaserta.it. Per richieste sui tuoi dati scrivi alla Sezione tramite il sito www.aricaserta.it.',
    sendReg: 'Invia il link di accesso', sendLogin: 'Inviami il link via email',
    idLabel: 'Nominativo o email', pass: 'Password', goPw: 'Accedi', pwBad: 'Nominativo o password non corretti.',
    linkHint: "Senza password? Scrivi il nominativo (o l'email) e fatti inviare un link di accesso.", regHint: 'Dopo il primo accesso con il link potrai scegliere una password, per entrare anche senza link.',
    pwTitle: 'Password', pwHint: 'Scegli una password per accedere senza link (facoltativo): almeno 8 caratteri.', pwHaveHint: 'Hai una password: puoi cambiarla o toglierla. Il link via email resta sempre disponibile.',
    pwCur: 'Password attuale', pwNew: 'Nuova password', pwNew2: 'Ripeti la password', pwSet: 'Imposta la password', pwChange: 'Cambia la password', pwRemove: 'Togli la password',
    pwSaved: 'Password salvata. Le altre sessioni aperte sono state chiuse.', pwRemoved: 'Password rimossa: accederai con il link.', pwMismatch: 'Le due password non coincidono.', pwShort: 'La password deve avere almeno 8 caratteri.', pwCurBad: 'La password attuale non è corretta.',
    pwBanner: 'Scegli una password per accedere anche senza link.', pwGo: 'Scegli la password',
    sent: 'Se i dati sono corretti ti abbiamo inviato una email con il link di accesso, valido 20 minuti e utilizzabile una sola volta. Controlla anche la posta indesiderata.',
    badEmail: 'Controlla nominativo ed email.', tooMany: 'Troppe richieste: riprova più tardi.', needConsent: 'Serve il consenso al trattamento dei dati.',
    hello: 'Benvenuto', linkBad: 'Link di accesso scaduto o già usato: richiedine uno nuovo.',
    verified: '✔ nominativo verificato dalla Sezione', pending: 'in attesa di verifica del nominativo da parte della Sezione',
    tProfile: 'Profilo', tLog: 'Log', tSettings: 'Impostazioni', tAccount: 'Account', tAdmin: 'Amministrazione',
    qth: 'QTH (località)', locator: 'Locator', rig: 'Radio', antenna: 'Antenna', power: 'Potenza', notes: 'Note sulla stazione', save: 'Salva', saved: 'Salvato',
    badLoc: 'Locator non valido (es. JN71DB).',
    logOnServer: 'Log sul server', logNone: 'Nessun log sul server.', qso: 'QSO', updated: 'aggiornato',
    upload: 'Carica e unisci un log ADIF', replace: 'Sostituisci il log con un file', mergeHint: 'I QSO già presenti (stesso nominativo, data, ora, banda e modo) non vengono duplicati: si uniscono, completando conferme e quadranti.', merged: 'Unione completata', mNew: 'nuovi', mDup: 'già presenti (uniti)', mFile: 'doppioni nel file scartati', mTot: 'totale', download: 'Scarica il log', del: 'Elimina il log dal server',
    localSum: 'Su questo dispositivo', uploaded: 'Log caricato', deleted: 'Eliminato', synced: 'Log del profilo caricato su questo dispositivo',
    stats: 'DXCC lavorati / confermati', zones: 'zone CQ', grids: 'quadranti', noLocal: 'Nessun log su questo dispositivo.',
    setSave: 'Salva le impostazioni del cluster sul profilo', setApply: 'Applica le impostazioni del profilo a questo dispositivo',
    setHint: 'Watchlist, avvisi, lingua, callbook e preferenze si sincronizzano tra i tuoi dispositivi.', setNone: 'Nessuna impostazione salvata sul profilo.', setApplied: 'Impostazioni applicate',
    export: 'Scarica tutti i miei dati (JSON)', logout: 'Esci', delAcc: 'Elimina il mio account e tutti i miei dati', delConfirm: 'Per confermare scrivi il tuo nominativo', delBtn: 'Elimina definitivamente', accDeleted: 'Account eliminato',
    admUsers: 'Iscritti', admApprove: 'Verifica', admUnapprove: 'Togli verifica', admRemove: 'Elimina', admEmailOk: 'email ok', created: 'registrato',
    err: 'Operazione non riuscita', badAdif: 'Il file non sembra un log ADIF.', tooBig: 'Il file è troppo grande (massimo 40 MB).',
  },
  en: {
    btn: 'My account', title: 'Ham account', close: 'Close',
    tReg: 'Sign up', tLogin: 'I already have an account',
    call: 'Callsign', email: 'Email', name: 'Name (optional)', consent: 'I have read the privacy notice and consent to the processing of my data.',
    privacyT: 'Privacy notice',
    privacy: 'Data controller: A.R.I. Caserta (IQ8DO). Data processed: callsign, email, name, QTH and station details (optional), ADIF log (optional) and cluster preferences. Purpose: to give you a personal area in the DX Cluster (profile, log synced across your devices, settings). Legal basis: your consent. Retention: until you delete the account; you can download or delete all your data at any time from the Account tab. Your log is visible only to you (not to other hams); data is not shared with third parties. The login email is sent from the aricaserta.it website. For requests about your data contact the Section through www.aricaserta.it.',
    sendReg: 'Send the login link', sendLogin: 'Email me a login link',
    idLabel: 'Callsign or email', pass: 'Password', goPw: 'Log in', pwBad: 'Wrong callsign or password.',
    linkHint: 'No password? Enter your callsign (or email) and get a login link.', regHint: 'After your first login with the link you can choose a password, to log in without a link too.',
    pwTitle: 'Password', pwHint: 'Choose a password to log in without a link (optional): at least 8 characters.', pwHaveHint: 'You have a password: you can change or remove it. The email link is always available.',
    pwCur: 'Current password', pwNew: 'New password', pwNew2: 'Repeat the password', pwSet: 'Set the password', pwChange: 'Change the password', pwRemove: 'Remove the password',
    pwSaved: 'Password saved. Other open sessions were closed.', pwRemoved: 'Password removed: you will log in with the link.', pwMismatch: 'The two passwords do not match.', pwShort: 'The password needs at least 8 characters.', pwCurBad: 'The current password is not correct.',
    pwBanner: 'Choose a password to log in without a link too.', pwGo: 'Choose a password',
    sent: 'If the details are correct we have emailed you a login link, valid for 20 minutes and usable once. Check your spam folder too.',
    badEmail: 'Check callsign and email.', tooMany: 'Too many requests: try again later.', needConsent: 'Consent to data processing is required.',
    hello: 'Welcome', linkBad: 'Login link expired or already used: request a new one.',
    verified: '✔ callsign verified by the Section', pending: 'callsign awaiting verification by the Section',
    tProfile: 'Profile', tLog: 'Log', tSettings: 'Settings', tAccount: 'Account', tAdmin: 'Admin',
    qth: 'QTH (location)', locator: 'Locator', rig: 'Rig', antenna: 'Antenna', power: 'Power', notes: 'Station notes', save: 'Save', saved: 'Saved',
    badLoc: 'Invalid locator (e.g. JN71DB).',
    logOnServer: 'Log on the server', logNone: 'No log on the server.', qso: 'QSOs', updated: 'updated',
    upload: 'Upload and merge an ADIF log', replace: 'Replace the log with a file', mergeHint: 'QSOs already present (same callsign, date, time, band and mode) are not duplicated: they are merged, completing confirmations and grids.', merged: 'Merge complete', mNew: 'new', mDup: 'already present (merged)', mFile: 'duplicates in the file discarded', mTot: 'total', download: 'Download the log', del: 'Delete the log from the server',
    localSum: 'On this device', uploaded: 'Log uploaded', deleted: 'Deleted', synced: 'Profile log loaded on this device',
    stats: 'DXCC worked / confirmed', zones: 'CQ zones', grids: 'grids', noLocal: 'No log on this device.',
    setSave: 'Save cluster settings to my profile', setApply: 'Apply profile settings to this device',
    setHint: 'Watchlist, alerts, language, callbook and preferences sync across your devices.', setNone: 'No settings saved on the profile.', setApplied: 'Settings applied',
    export: 'Download all my data (JSON)', logout: 'Sign out', delAcc: 'Delete my account and all my data', delConfirm: 'To confirm type your callsign', delBtn: 'Delete permanently', accDeleted: 'Account deleted',
    admUsers: 'Members', admApprove: 'Verify', admUnapprove: 'Unverify', admRemove: 'Delete', admEmailOk: 'email ok', created: 'signed up',
    err: 'Operation failed', badAdif: 'The file does not look like an ADIF log.', tooBig: 'The file is too large (40 MB maximum).',
  },
};

export function initAccount(d) {
  const { $, $$, esc, cfg, store, toastText, MyLog, applySettings, currentSettings, importAdif, lang } = d;
  const tr = (k) => (L[lang()] || L.it)[k] ?? L.it[k] ?? k;
  let me = null, tab = 'profile', form = 'reg', msg = '', admin = null;

  async function api(path, o = {}) {
    const h = { 'X-IQ8DO': '1' };
    let body;
    if (o.headers) Object.assign(h, o.headers);
    if (o.raw !== undefined) body = o.raw; else if (o.body !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
    return fetch('api/' + path, { method: o.method || 'GET', headers: h, body, credentials: 'same-origin' });
  }
  const dlg = () => $('#dlgAccount');
  const dateOf = (s) => new Date(s * 1000).toLocaleDateString(lang() === 'en' ? 'en-GB' : 'it-IT');

  function paintButton() {
    const b = $('#btnAccount'); if (!b) return;
    b.classList.toggle('in', !!me);
    $('#btnAccountTxt').textContent = me ? me.call : tr('btn');
    b.title = me ? `${tr('btn')}: ${me.call}` : tr('btn');
  }

  async function loadMe() {
    try { const r = await api('me'); me = r.ok ? await r.json() : null; } catch { me = null; }
    paintButton();
    return me;
  }

  /** Dopo l'accesso: nominativo, impostazioni e log del profilo arrivano su questo dispositivo. */
  async function afterLogin() {
    if (!me) return;
    cfg.myCall = me.call; store.set('myCall', me.call);
    if (me.settings && Object.keys(me.settings).length) applySettings(me.settings);
    if (me.log) {
      const local = MyLog.info();
      if (!local || me.log.updated * 1000 > (local.at || 0)) {
        try {
          const r = await api('log');
          if (r.ok) { await importAdif(await r.text(), 'profilo-' + me.call + '.adi', true); toastText('✓ ' + tr('synced')); }
        } catch { /* si riprova al prossimo accesso */ }
      }
    }
    document.dispatchEvent(new Event('iq8do:state'));
  }

  async function handleLoginHash() {
    const m = /(?:^#|&)login=([A-Za-z0-9_-]{30,64})/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search); // il token non resta nella cronologia
    try {
      const r = await api('verify', { method: 'POST', body: { token: m[1] } });
      if (!r.ok) { toastText(tr('linkBad'), 7000); return; }
      me = await r.json(); paintButton(); toastText(`${tr('hello')} ${me.call}`, 5000);
      tab = me.password ? 'profile' : 'account'; await afterLogin(); open();
    } catch { toastText(tr('err'), 5000); }
  }

  // ---- disegno -----------------------------------------------------------------------------------------------
  const field = (id, label, v = '', extra = '') => `<label class="field"><span>${label}</span><input id="${id}" value="${esc(v)}" autocomplete="off" ${extra}></label>`;

  function viewLoggedOut() {
    const reg = form === 'reg';
    const tabs = `<div class="acc-tabs"><button type="button" data-act="form-reg" class="${reg ? 'on' : ''}">${tr('tReg')}</button><button type="button" data-act="form-login" class="${reg ? '' : 'on'}">${tr('tLogin')}</button></div>`;
    const priv = `<details class="acc-priv"><summary>${tr('privacyT')}</summary><p>${esc(tr('privacy'))}</p></details>`;
    if (reg) {
      return `${tabs}${field('aCall', tr('call'), '', 'maxlength="14" style="text-transform:uppercase"')}${field('aEmail', tr('email'), '', 'type="email" maxlength="120"')}${field('aName', tr('name'), '', 'maxlength="60"')}
      <label class="chk"><input type="checkbox" id="aConsent"> <span>${tr('consent')}</span></label>${priv}
      <p class="hint">${tr('regHint')}</p><p class="acc-msg" id="aMsg">${esc(msg)}</p>
      <button type="button" class="primary acc-go" data-act="register">${tr('sendReg')}</button>`;
    }
    return `${tabs}${field('aId', tr('idLabel'), '', 'maxlength="120" autocomplete="username" autocapitalize="off" spellcheck="false"')}
      <label class="field"><span>${tr('pass')}</span><input id="aPass" type="password" maxlength="128" autocomplete="current-password"></label>
      <p class="acc-msg" id="aMsg">${esc(msg)}</p>
      <button type="button" class="primary acc-go" data-act="login-pw">${tr('goPw')}</button>
      <p class="hint">${tr('linkHint')}</p>
      <button type="button" class="acc-go" data-act="login">${tr('sendLogin')}</button>${priv}`;
  }

  function pwSection() {
    const has = me.password;
    return `<h4>${tr('pwTitle')}</h4><p class="hint">${has ? tr('pwHaveHint') : tr('pwHint')}</p>
      ${has ? `<label class="field"><span>${tr('pwCur')}</span><input id="pCur" type="password" autocomplete="current-password" maxlength="128"></label>` : ''}
      <label class="field"><span>${tr('pwNew')}</span><input id="pNew" type="password" autocomplete="new-password" maxlength="128"></label>
      <label class="field"><span>${tr('pwNew2')}</span><input id="pNew2" type="password" autocomplete="new-password" maxlength="128"></label>
      <div class="acc-btns"><button type="button" class="primary" data-act="pw-save">${has ? tr('pwChange') : tr('pwSet')}</button>${has ? `<button type="button" class="danger" data-act="pw-remove">${tr('pwRemove')}</button>` : ''}</div>`;
  }

  function tabBar() {
    const tabs = [['profile', 'tProfile'], ['log', 'tLog'], ['settings', 'tSettings'], ['account', 'tAccount']];
    if (me.admin) tabs.push(['admin', 'tAdmin']);
    return `<div class="acc-head"><b>${esc(me.call)}</b> ${me.name ? `<span>${esc(me.name)}</span>` : ''}
      <small class="${me.approved ? 'ok' : ''}">${me.approved ? tr('verified') : tr('pending')}</small><button type="button" class="acc-out" data-act="logout">⎋ ${tr('logout')}</button></div>
      <div class="acc-tabs">${tabs.map(([k, l]) => `<button type="button" data-act="tab-${k}" class="${tab === k ? 'on' : ''}">${tr(l)}</button>`).join('')}</div>`;
  }

  function viewProfile() {
    const s = me.station || {};
    return `${field('pName', tr('name'), me.name, 'maxlength="60"')}${field('pQth', tr('qth'), me.qth, 'maxlength="80"')}${field('pLoc', tr('locator'), me.locator, 'maxlength="8" placeholder="JN71DB" style="text-transform:uppercase"')}
      ${field('pRig', tr('rig'), s.rig, 'maxlength="120"')}${field('pAnt', tr('antenna'), s.antenna, 'maxlength="120"')}${field('pPow', tr('power'), s.power, 'maxlength="120"')}${field('pNotes', tr('notes'), s.notes, 'maxlength="120"')}
      <p class="acc-msg" id="aMsg">${esc(msg)}</p><button type="button" class="primary" data-act="save-profile">${tr('save')}</button>`;
  }

  function viewLog() {
    const lg = me.log, loc = MyLog.info(), st = MyLog.stats();
    const srv = lg ? `${lg.qso.toLocaleString()} ${tr('qso')} · ${(lg.bytes / 1024).toFixed(0)} KB · ${tr('updated')} ${dateOf(lg.updated)}` : tr('logNone');
    const here = loc && st ? `${esc(loc.file)} · ${loc.used.toLocaleString()} ${tr('qso')} · ${tr('stats')}: <b>${st.worked}</b> / <b>${st.confirmed}</b>${st.zones !== undefined ? ` · ${st.zones} ${tr('zones')} · ${st.grids} ${tr('grids')}` : ''}` : tr('noLocal');
    return `<h4>${tr('logOnServer')}</h4><p>${srv}</p>
      <h4>${tr('localSum')}</h4><p>${here}</p>
      <input type="file" id="aLogFile" accept=".adi,.adif,.txt" hidden>
      <div class="acc-btns"><button type="button" class="primary" data-act="log-upload">${tr('upload')}</button><button type="button" data-act="log-replace">${tr('replace')}</button>
        ${lg ? `<button type="button" data-act="log-download">${tr('download')}</button><button type="button" class="danger" data-act="log-delete">${tr('del')}</button>` : ''}</div>
      <p class="hint">${tr('mergeHint')}</p>
      <p class="acc-msg" id="aMsg">${esc(msg)}</p>`;
  }

  function viewSettings() {
    const has = me.settings && Object.keys(me.settings).length;
    return `<p>${tr('setHint')}</p><p class="hint">${has ? '' : tr('setNone')}</p>
      <div class="acc-btns"><button type="button" class="primary" data-act="set-save">${tr('setSave')}</button>${has ? `<button type="button" data-act="set-apply">${tr('setApply')}</button>` : ''}</div>
      <p class="acc-msg" id="aMsg">${esc(msg)}</p>`;
  }

  function viewAccount() {
    return `${pwSection()}<hr><p>${esc(me.email)} · ${tr('created')} ${dateOf(me.created)}</p>
      <div class="acc-btns"><button type="button" data-act="export">${tr('export')}</button><button type="button" data-act="logout">${tr('logout')}</button></div>
      <details class="acc-priv"><summary>${tr('privacyT')}</summary><p>${esc(tr('privacy'))}</p></details>
      <details class="acc-danger"><summary>${tr('delAcc')}</summary>${field('dConfirm', tr('delConfirm'), '', 'maxlength="14" style="text-transform:uppercase"')}
        <button type="button" class="danger" data-act="delete-account">${tr('delBtn')}</button></details>
      <p class="acc-msg" id="aMsg">${esc(msg)}</p>`;
  }

  function viewAdmin() {
    if (!admin) return '<p>…</p>';
    return `<h4>${tr('admUsers')}: ${admin.length}</h4><div class="acc-tbl">${admin.map((u) => `<div><b>${esc(u.call)}</b> ${esc(u.name)} <small>${esc(u.email)} · ${u.email_ok ? tr('admEmailOk') : '–'} · ${dateOf(u.created)}</small>
      <span><button type="button" data-act="adm-approve" data-call="${esc(u.call)}" data-v="${u.approved ? 0 : 1}">${u.approved ? tr('admUnapprove') : tr('admApprove')}</button>
      <button type="button" class="danger" data-act="adm-remove" data-call="${esc(u.call)}">${tr('admRemove')}</button></span></div>`).join('')}</div>`;
  }

  function render() {
    const b = $('#accBody'); if (!b) return;
    $('#accTitle').textContent = tr('title'); $('#accClose').textContent = tr('close');
    const banner = me && !me.password && tab !== 'account' ? `<p class="acc-banner">${tr('pwBanner')} <button type="button" data-act="tab-account">${tr('pwGo')}</button></p>` : '';
    b.innerHTML = !me ? viewLoggedOut() : tabBar() + banner + `<div class="acc-pane">${{ profile: viewProfile, log: viewLog, settings: viewSettings, account: viewAccount, admin: viewAdmin }[tab]()}</div>`;
  }
  function open() { msg = ''; render(); if (!dlg().open) dlg().showModal(); }
  const say = (m) => { msg = m; const el = $('#aMsg'); if (el) el.textContent = m; };
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

  // ---- azioni ------------------------------------------------------------------------------------------------
  const V = (id) => ($('#' + id)?.value || '').trim();
  async function act(a, el) {
    if (a === 'form-reg' || a === 'form-login') { form = a === 'form-reg' ? 'reg' : 'login'; msg = ''; return render(); }
    if (a.startsWith('tab-')) { tab = a.slice(4); msg = ''; render(); if (tab === 'admin' && !admin) { const r = await api('admin/users'); if (r.ok) { admin = await r.json(); render(); } } return; }
    if (a === 'login-pw') {
      const id = V('aId'), password = $('#aPass')?.value || '';
      if (!id || !password) return say(tr('pwBad'));
      const r = await api('login/password', { method: 'POST', body: { id, password } });
      if (r.status === 429) return say(tr('tooMany'));
      if (!r.ok) return say(tr('pwBad'));
      me = await r.json(); admin = null; paintButton(); toastText(`${tr('hello')} ${me.call}`, 4000);
      tab = 'profile'; await afterLogin(); render(); return;
    }
    if (a === 'register' || a === 'login') {
      const id = V('aId');
      const body = a === 'register' ? { call: V('aCall'), email: V('aEmail'), name: V('aName'), consent: $('#aConsent').checked }
        : (id.includes('@') ? { email: id } : { call: id.toUpperCase() });
      if (a === 'register' && !body.consent) return say(tr('needConsent'));
      const r = await api(a, { method: 'POST', body });
      if (r.status === 429) return say(tr('tooMany'));
      if (!r.ok) return say(tr('badEmail'));
      return say(tr('sent'));
    }
    if (!me) return;
    if (a === 'pw-save') {
      const cur = $('#pCur')?.value || '', n1 = $('#pNew').value, n2 = $('#pNew2').value;
      if (n1.length < 8) return say(tr('pwShort'));
      if (n1 !== n2) return say(tr('pwMismatch'));
      const r = await api('password', { method: 'POST', body: { current: cur, password: n1 } });
      if (r.status === 403) return say(tr('pwCurBad'));
      if (r.status === 429) return say(tr('tooMany'));
      if (!r.ok) { const j = await r.json().catch(() => ({})); return say(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) + '.' : tr('err')); }
      me = await r.json(); render(); say(tr('pwSaved')); return;
    }
    if (a === 'pw-remove') {
      const r = await api('password', { method: 'DELETE' });
      if (r.ok) { me = await r.json(); render(); say(tr('pwRemoved')); } else say(tr('err'));
      return;
    }
    if (a === 'save-profile') {
      const loc = V('pLoc');
      if (loc && !/^[A-Ra-r]{2}\d{2}([A-Xa-x]{2})?$/.test(loc)) return say(tr('badLoc'));
      const r = await api('me', { method: 'PUT', body: { name: V('pName'), qth: V('pQth'), locator: loc, station: { rig: V('pRig'), antenna: V('pAnt'), power: V('pPow'), notes: V('pNotes') } } });
      if (r.ok) { me = await r.json(); render(); say(tr('saved')); } else say(r.status === 400 ? tr('badLoc') : tr('err'));
    } else if (a === 'log-upload' || a === 'log-replace') { $('#aLogFile').dataset.mode = a === 'log-replace' ? 'replace' : 'merge'; $('#aLogFile').click(); }
    else if (a === 'log-download') {
      const r = await api('log'); if (r.ok) download(await r.blob(), `log-${me.call.replace('/', '_')}.adi`);
    } else if (a === 'log-delete') {
      const r = await api('log', { method: 'DELETE' }); if (r.ok) { await loadMe(); render(); say(tr('deleted')); }
    } else if (a === 'set-save') {
      const r = await api('me', { method: 'PUT', body: { settings: currentSettings() } });
      if (r.ok) { me = await r.json(); render(); say(tr('saved')); } else say(tr('err'));
    } else if (a === 'set-apply') { applySettings(me.settings); say(tr('setApplied')); }
    else if (a === 'export') { const r = await api('export'); if (r.ok) download(await r.blob(), `iq8do-${me.call.replace('/', '_')}.json`); }
    else if (a === 'logout') { await api('logout', { method: 'POST', body: {} }); me = null; admin = null; paintButton(); render(); }
    else if (a === 'delete-account') {
      const r = await api('me', { method: 'DELETE', body: { confirm: V('dConfirm') } });
      if (r.ok) { me = null; admin = null; paintButton(); toastText(tr('accDeleted'), 5000); render(); } else say(tr('err'));
    } else if (a === 'adm-approve' || a === 'adm-remove') {
      const call = el.dataset.call;
      const r = a === 'adm-approve' ? await api('admin/approve', { method: 'POST', body: { call, approved: el.dataset.v === '1' } }) : await api('admin/remove', { method: 'POST', body: { call } });
      if (r.ok) { const l = await api('admin/users'); if (l.ok) admin = await l.json(); await loadMe(); render(); }
    }
  }
  async function pushLog(text, mode = 'merge') {
    // ADIF si comprime molto: il file viaggia compresso (gzip) quando il browser lo permette
    const url = 'log?mode=' + mode;
    let r;
    if (typeof CompressionStream === 'function') {
      try { const z = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); r = await api(url, { method: 'PUT', raw: z, headers: { 'X-IQ8DO-Enc': 'gzip' } }); } catch { r = null; }
    }
    if (!r) r = await api(url, { method: 'PUT', raw: text });
    if (!r.ok) return say(r.status === 413 ? tr('tooBig') : r.status === 400 ? tr('badAdif') : tr('err'));
    const st = await r.json();
    await loadMe();
    try { // il log unito (senza doppioni) diventa quello attivo anche su questo dispositivo
      const g = await api('log');
      if (g.ok) await importAdif(await g.text(), 'profilo-' + me.call + '.adi', true);
    } catch { /* resta il log locale */ }
    render();
    say(mode === 'replace'
      ? `${tr('uploaded')}: ${st.qso.toLocaleString()} ${tr('qso')}${st.dup_file ? ` · ${st.dup_file} ${tr('mFile')}` : ''}`
      : `${tr('merged')}: ${st.added.toLocaleString()} ${tr('mNew')} · ${st.dup_existing.toLocaleString()} ${tr('mDup')} · ${st.dup_file.toLocaleString()} ${tr('mFile')} · ${tr('mTot')} ${st.qso.toLocaleString()} ${tr('qso')}`);
  }

  $('#accBody').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b).catch(() => say(tr('err'))); });
  $('#accBody').addEventListener('change', async (e) => {
    if (e.target.id !== 'aLogFile' || !e.target.files[0]) return;
    const f = e.target.files[0], text = await f.text();
    try { await pushLog(text, e.target.dataset.mode === 'replace' ? 'replace' : 'merge'); } catch { say(tr('err')); }
    e.target.value = '';
  });
  $('#accBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'aPass') { e.preventDefault(); act('login-pw').catch(() => say(tr('err'))); } });
  $('#accClose').addEventListener('click', () => dlg().close());
  $('#btnAccount').addEventListener('click', open);

  /** Per app.js: il log caricato da questo dispositivo va anche sul profilo, se si e' connessi. */
  async function syncLocalLog(text) { if (me && text) { try { await pushLog(text); } catch { /* */ } } }

  loadMe().then(() => { if (me) afterLogin(); });
  handleLoginHash();
  return { get me() { return me; }, rerender() { paintButton(); if (dlg().open) render(); }, syncLocalLog };
}
