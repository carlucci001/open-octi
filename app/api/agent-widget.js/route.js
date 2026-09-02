import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLIC_WIDGET_BASE_URL = 'https://openocti.local'

function inlineAvatarDataUri(avatarUrl) {
  const value = String(avatarUrl || '')
  if (!value.includes('/agents/wnc-jessica-avatar.svg')) return ''
  try {
    const svg = readFileSync(join(process.cwd(), 'public', 'agents', 'wnc-jessica-avatar.svg'), 'utf8')
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    return ''
  }
}

function clientProfile(profile, inlineAvatar) {
  return {
    id: profile.id,
    name: profile.name,
    title: profile.title,
    greeting: profile.greeting,
    avatarUrl: inlineAvatar || profile.avatarUrl,
    quickQuestions: profile.quickQuestions || [],
    actions: profile.actions || [],
    voiceEnabled: profile.voiceEnabled === true,
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const agent = url.searchParams.get('agent') || ''
  const profile = await resolvePublicWidgetAgent(agent, { baseUrl: PUBLIC_WIDGET_BASE_URL })
  const data = clientProfile(profile, inlineAvatarDataUri(profile.avatarUrl))
  const script = `
(function(){
  var base = ${JSON.stringify(PUBLIC_WIDGET_BASE_URL)};
  var profile = ${JSON.stringify(data)};
  var s = document.currentScript || {};
  var agent = (s.dataset && s.dataset.agent) || profile.id || 'super-demo';
  var theme = (s.dataset && s.dataset.theme) || 'light';
  if (document.getElementById('fcc-agent-widget')) return;

  var messages = [{ role: 'assistant', content: profile.greeting || ('Hi, this is ' + profile.name + '. How can I help you today?') }];
  var panel = null;
  var voiceSession = null;

  var css = document.createElement('style');
  css.textContent = [
    '#fcc-agent-widget,#fcc-agent-widget-panel,#fcc-agent-widget-label{box-sizing:border-box!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif!important}',
    '#fcc-agent-widget{position:fixed!important;right:22px!important;bottom:22px!important;z-index:2147483647!important;width:72px!important;height:72px!important;min-width:72px!important;min-height:72px!important;border-radius:999px!important;border:2px solid #f59e0b!important;background:#17130f!important;box-shadow:0 14px 40px rgba(0,0,0,.42)!important;cursor:pointer!important;padding:3px!important;display:block!important;visibility:visible!important;opacity:1!important}',
    '#fcc-agent-widget img{width:100%!important;height:100%!important;border-radius:999px!important;object-fit:cover!important;display:block!important}',
    '#fcc-agent-widget-label{position:fixed!important;right:104px!important;bottom:36px!important;z-index:2147483646!important;background:#17130f!important;color:#fffaf2!important;border:1px solid rgba(245,158,11,.36)!important;border-radius:12px!important;padding:9px 12px!important;box-shadow:0 12px 34px rgba(0,0,0,.28)!important;font:700 13px system-ui,-apple-system,Segoe UI,sans-serif!important;max-width:220px!important}',
    '#fcc-agent-widget-label span{display:block!important;color:#d8cbbb!important;font-weight:600!important;font-size:11px!important;margin-top:2px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
    '#fcc-agent-widget-panel{position:fixed!important;right:22px!important;bottom:108px!important;width:min(430px,calc(100vw - 32px))!important;height:min(680px,calc(100vh - 132px))!important;z-index:2147483647!important;border:1px solid rgba(15,23,42,.14)!important;border-radius:18px!important;box-shadow:0 20px 70px rgba(0,0,0,.38)!important;background:#f8fafc!important;overflow:hidden!important;display:grid!important;grid-template-rows:auto 1fr auto!important;color:#111827!important}',
    '#fcc-agent-widget-panel *{box-sizing:border-box!important}',
    '.fccw-head{display:flex!important;gap:12px!important;align-items:center!important;padding:15px!important;background:#fff!important;border-bottom:1px solid rgba(17,24,39,.14)!important}',
    '.fccw-head img{width:48px!important;height:48px!important;border-radius:999px!important;object-fit:cover!important;border:2px solid #b42318!important}',
    '.fccw-name{font-size:18px!important;font-weight:850!important;line-height:1.1!important;color:#111827!important}',
    '.fccw-title{font-size:12px!important;color:#5b6472!important;margin-top:3px!important}',
    '.fccw-close{margin-left:auto!important;width:34px!important;height:34px!important;border-radius:8px!important;border:1px solid rgba(17,24,39,.14)!important;background:#fff!important;color:#111827!important;font:800 18px system-ui!important;cursor:pointer!important}',
    '.fccw-body{overflow:auto!important;padding:15px!important;display:flex!important;flex-direction:column!important;gap:10px!important;background:#f8fafc!important}',
    '.fccw-msg{max-width:86%!important;padding:11px 13px!important;border-radius:14px!important;font-size:14px!important;line-height:1.45!important;white-space:pre-wrap!important}',
    '.fccw-assistant{align-self:flex-start!important;background:#fff!important;color:#111827!important;border:1px solid rgba(17,24,39,.14)!important;border-bottom-left-radius:4px!important}',
    '.fccw-user{align-self:flex-end!important;background:#b42318!important;color:#fff!important;border-bottom-right-radius:4px!important}',
    '.fccw-quick{border:1px solid rgba(17,24,39,.14)!important;background:rgba(180,35,24,.08)!important;color:#111827!important;border-radius:8px!important;padding:10px 11px!important;text-align:left!important;font-weight:750!important;cursor:pointer!important;font-size:13px!important}',
    '.fccw-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;margin-bottom:9px!important}',
    '.fccw-action{min-height:38px!important;border:1px solid rgba(17,24,39,.14)!important;border-radius:8px!important;background:rgba(180,35,24,.08)!important;color:#111827!important;font-weight:800!important;cursor:pointer!important;font-size:12px!important;padding:0 8px!important}',
    '.fccw-foot{padding:12px!important;background:#fff!important;border-top:1px solid rgba(17,24,39,.14)!important}',
    '.fccw-sendrow{display:grid!important;grid-template-columns:1fr auto!important;gap:8px!important}',
    '.fccw-input,.fccw-field,.fccw-textarea{width:100%!important;border:1px solid rgba(17,24,39,.18)!important;border-radius:8px!important;background:#fff!important;color:#111827!important;font-size:14px!important;padding:0 12px!important}',
    '.fccw-input,.fccw-field{height:42px!important}',
    '.fccw-textarea{min-height:104px!important;padding:10px 12px!important;resize:vertical!important}',
    '.fccw-primary{min-height:42px!important;border:0!important;border-radius:8px!important;background:#b42318!important;color:#fff!important;font-weight:850!important;cursor:pointer!important;padding:0 15px!important}',
    '.fccw-form{display:grid!important;gap:10px!important}',
    '.fccw-label{display:grid!important;gap:5px!important;color:#5b6472!important;font-size:11px!important;font-weight:850!important;text-transform:uppercase!important;letter-spacing:.04em!important}',
    '.fccw-note{font-size:13px!important;line-height:1.45!important;color:#5b6472!important}',
    '@media(max-width:560px){#fcc-agent-widget{right:16px!important;bottom:16px!important;width:64px!important;height:64px!important;min-width:64px!important;min-height:64px!important}#fcc-agent-widget-label{display:none!important}#fcc-agent-widget-panel{right:10px!important;left:10px!important;bottom:88px!important;width:auto!important;height:min(650px,calc(100vh - 104px))!important}.fccw-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}}'
  ].join('');
  document.head.appendChild(css);

  var label = document.createElement('div');
  label.id = 'fcc-agent-widget-label';
  label.innerHTML = 'Chat with ' + esc(profile.name) + '<span>' + esc(profile.title) + '</span>';

  var btn = document.createElement('button');
  btn.id = 'fcc-agent-widget';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Chat with ' + profile.name);
  var img = document.createElement('img');
  img.src = profile.avatarUrl;
  img.alt = profile.name;
  img.onerror = function(){ btn.textContent = (profile.name || 'AI').charAt(0); btn.style.color = '#f59e0b'; btn.style.font = '800 28px system-ui,-apple-system,Segoe UI,sans-serif'; };
  btn.appendChild(img);
  btn.onclick = togglePanel;

  document.body.appendChild(label);
  document.body.appendChild(btn);

  function togglePanel(){
    if (panel) {
      panel.remove();
      panel = null;
      label.style.display = '';
      return;
    }
    panel = document.createElement('section');
    panel.id = 'fcc-agent-widget-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', profile.name + ' receptionist');
    panel.innerHTML = [
      '<header class="fccw-head"><img src="' + escAttr(profile.avatarUrl) + '" alt="' + escAttr(profile.name) + '"><div><div class="fccw-name">' + esc(profile.name) + '</div><div class="fccw-title">' + esc(profile.title) + '</div></div><button class="fccw-close" type="button" aria-label="Close">x</button></header>',
      '<div class="fccw-body" data-body></div>',
      '<footer class="fccw-foot"><div class="fccw-actions" data-actions></div><form class="fccw-sendrow" data-chat-form><input class="fccw-input" data-chat-input placeholder="Message ' + escAttr(profile.name) + '"><button class="fccw-primary" type="submit">Send</button></form></footer>'
    ].join('');
    document.body.appendChild(panel);
    label.style.display = 'none';
    panel.querySelector('.fccw-close').onclick = togglePanel;
    panel.querySelector('[data-chat-form]').onsubmit = function(e){ e.preventDefault(); send(panel.querySelector('[data-chat-input]').value); };
    renderActions();
    renderChat(true);
  }

  function renderActions(){
    var box = panel.querySelector('[data-actions]');
    box.innerHTML = '';
    (profile.actions || []).forEach(function(action){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fccw-action';
      b.textContent = action.label || action.id;
      b.onclick = function(){
        if (action.id === 'voice') return startVoice();
        renderForm(action.id);
      };
      box.appendChild(b);
    });
  }

  function renderChat(showQuick){
    var body = panel.querySelector('[data-body]');
    body.innerHTML = '';
    messages.forEach(function(m){ body.appendChild(messageNode(m)); });
    if (showQuick && messages.length <= 1) {
      (profile.quickQuestions || []).forEach(function(q){
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'fccw-quick';
        b.textContent = q;
        b.onclick = function(){ send(q); };
        body.appendChild(b);
      });
    }
    body.scrollTop = body.scrollHeight;
  }

  function messageNode(m){
    var node = document.createElement('div');
    node.className = 'fccw-msg ' + (m.role === 'user' ? 'fccw-user' : 'fccw-assistant');
    node.textContent = m.content;
    return node;
  }

  async function send(text){
    var input = panel.querySelector('[data-chat-input]');
    var value = String(text || input.value || '').trim();
    if (!value) return;
    messages.push({ role: 'user', content: value });
    input.value = '';
    renderChat(false);
    messages.push({ role: 'assistant', content: profile.name + ' is checking that...' });
    renderChat(false);
    try {
      var res = await fetch(base + '/api/agent-widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agent, messages: messages.slice(0, -1) })
      });
      var data = await res.json();
      messages.pop();
      messages.push({ role: 'assistant', content: data.text || 'I have that. Tell me a little more.' });
    } catch (e) {
      messages.pop();
      messages.push({ role: 'assistant', content: 'I lost the connection for a moment. You can still leave a callback, email, or news tip here.' });
    }
    renderChat(false);
  }

  function renderForm(action){
    var body = panel.querySelector('[data-body]');
    var title = action === 'callback' ? 'Request a callback' : action === 'news-tip' ? 'Send a news tip' : 'Send a note';
    var help = action === 'news-tip' ? 'Give the short version first. Add what, where, when, and how we can reach you.' : action === 'callback' ? 'Leave a good phone number and a time window.' : 'Send the front desk a note and contact detail.';
    body.innerHTML = '<form class="fccw-form" data-handoff-form><div><div class="fccw-name">' + esc(title) + '</div><div class="fccw-note">' + esc(help) + '</div></div><label class="fccw-label">Your name<input class="fccw-field" name="name" required></label><label class="fccw-label">Email<input class="fccw-field" name="email" type="email"></label><label class="fccw-label">Phone<input class="fccw-field" name="phone" type="tel"></label><label class="fccw-label">Best time to call<input class="fccw-field" name="when"></label><label class="fccw-label">Message<textarea class="fccw-textarea" name="message" required></textarea></label><button class="fccw-primary" type="submit">Send</button><button class="fccw-action" type="button" data-back>Back</button></form>';
    body.querySelector('[data-back]').onclick = function(){ renderChat(false); };
    body.querySelector('[data-handoff-form]').onsubmit = async function(e){
      e.preventDefault();
      var form = new FormData(e.currentTarget);
      try {
        var res = await fetch(base + '/api/agent-widget/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: agent,
            action: action,
            transcript: messages,
            name: form.get('name'),
            email: form.get('email'),
            phone: form.get('phone'),
            when: form.get('when'),
            message: form.get('message')
          })
        });
        var data = await res.json();
        body.innerHTML = '<div class="fccw-name">Got it.</div><div class="fccw-note">' + esc(data.message || 'The handoff is logged.') + '</div><button class="fccw-primary" type="button" data-back>Back to chat</button>';
        body.querySelector('[data-back]').onclick = function(){ renderChat(false); };
      } catch (err) {
        body.insertAdjacentHTML('beforeend', '<div class="fccw-note" style="color:#b42318!important">Could not send that. Please try again.</div>');
      }
    };
  }

  async function startVoice(){
    var body = panel.querySelector('[data-body]');
    body.innerHTML = '<div class="fccw-name">Connecting live voice</div><div class="fccw-note">Your browser may ask for microphone permission.</div>';
    try {
      var tokenRes = await fetch(base + '/api/agent-widget/voice-token?agent=' + encodeURIComponent(agent), { cache: 'no-store' });
      var token = await tokenRes.json();
      if (!token.signedUrl) throw new Error(token.error || 'Voice is not available.');
      var lib = await loadVoiceClient();
      voiceSession = await lib.Conversation.startSession({
        signedUrl: token.signedUrl,
        onConnect: function(){ body.innerHTML = '<div class="fccw-name">' + esc(profile.name) + ' is listening</div><div class="fccw-note">Speak naturally. Use the button below when you are done.</div><button class="fccw-primary" type="button" data-end>End Call</button>'; body.querySelector('[data-end]').onclick = stopVoice; },
        onDisconnect: function(){ voiceSession = null; renderChat(false); },
        onError: function(e){ body.innerHTML = '<div class="fccw-name">Voice issue</div><div class="fccw-note">' + esc((e && e.message) || 'Voice could not start.') + '</div><button class="fccw-primary" type="button" data-back>Back</button>'; body.querySelector('[data-back]').onclick = function(){ renderChat(false); }; }
      });
    } catch (e) {
      body.innerHTML = '<div class="fccw-name">Voice issue</div><div class="fccw-note">' + esc(e.message || 'Voice could not start.') + '</div><button class="fccw-primary" type="button" data-back>Back</button>';
      body.querySelector('[data-back]').onclick = function(){ renderChat(false); };
    }
  }

  async function stopVoice(){
    try { if (voiceSession && voiceSession.endSession) await voiceSession.endSession(); } catch(e) {}
    voiceSession = null;
    renderChat(false);
  }

  function loadVoiceClient(){
    if (window.ElevenLabsClient) return Promise.resolve(window.ElevenLabsClient);
    return new Promise(function(resolve, reject){
      var existing = document.querySelector('script[data-elevenlabs-client="true"]');
      if (existing) {
        existing.addEventListener('load', function(){ resolve(window.ElevenLabsClient); });
        existing.addEventListener('error', function(){ reject(new Error('Could not load voice library.')); });
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://unpkg.com/@elevenlabs/client@1.3.1/dist/lib.iife.js';
      script.async = true;
      script.dataset.elevenlabsClient = 'true';
      script.onload = function(){ window.ElevenLabsClient ? resolve(window.ElevenLabsClient) : reject(new Error('Voice library loaded without client.')); };
      script.onerror = function(){ reject(new Error('Could not load voice library.')); };
      document.head.appendChild(script);
    });
  }

  function esc(v){ return String(v || '').replace(/[&<>"']/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function escAttr(v){ return esc(v).replace(/"/g, '&quot;'); }
})();`
  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
