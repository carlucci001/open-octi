import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLIC_WIDGET_BASE_URL = 'https://crm.company.example.com'

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
  var voiceStarting = false;
  var voiceAttempt = 0;

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
    '.fccw-voice-state{min-height:100%!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:10px!important;text-align:center!important}',
    '.fccw-voice-activity{height:28px!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;opacity:1}',
    '.fccw-voice-activity.fccw-delay{opacity:0;animation-name:fccw-activity-reveal!important;animation-duration:0s!important;animation-delay:.25s!important;animation-fill-mode:forwards!important}',
    '.fccw-voice-activity span{display:block!important;width:5px!important;height:10px!important;border-radius:999px!important;background:#b42318!important;animation:fccw-activity-bar .8s ease-in-out infinite!important}',
    '.fccw-voice-activity span:nth-child(2){animation-delay:.12s!important}.fccw-voice-activity span:nth-child(3){animation-delay:.24s!important}.fccw-voice-activity span:nth-child(4){animation-delay:.36s!important}',
    '@keyframes fccw-activity-reveal{to{opacity:1}}@keyframes fccw-activity-bar{0%,100%{height:8px}50%{height:24px}}',
    '@media(prefers-reduced-motion:reduce){.fccw-voice-activity span{animation:none!important;height:14px!important}}',
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
      stopVoice(false);
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

  function floatToPcm16Base64(float32, sourceRate, targetRate){
    targetRate = targetRate || 16000;
    var ratio = sourceRate / targetRate;
    var length = Math.max(1, Math.floor(float32.length / ratio));
    var bytes = new Uint8Array(length * 2);
    var view = new DataView(bytes.buffer);
    for (var i = 0; i < length; i += 1) {
      var start = Math.floor(i * ratio);
      var end = Math.max(start + 1, Math.floor((i + 1) * ratio));
      var sum = 0;
      for (var j = start; j < end && j < float32.length; j += 1) sum += float32[j];
      var sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    var binary = '';
    for (var k = 0; k < bytes.length; k += 1) binary += String.fromCharCode(bytes[k]);
    return window.btoa(binary);
  }

  function pcm16Base64ToFloat(base64){
    var binary = window.atob(base64);
    var length = Math.floor(binary.length / 2);
    var floats = new Float32Array(length);
    for (var i = 0; i < length; i += 1) {
      var value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
      if (value >= 32768) value -= 65536;
      floats[i] = value / 32768;
    }
    return floats;
  }

  function renderVoiceStatus(body, label, note, delayed){
    if (!body || !body.isConnected) return;
    body.innerHTML = '<div class="fccw-voice-state" role="status" aria-live="polite" aria-atomic="true"><div class="fccw-voice-activity' + (delayed ? ' fccw-delay' : '') + '" aria-hidden="true"><span></span><span></span><span></span><span></span></div><div class="fccw-name">' + esc(label) + '</div><div class="fccw-note">' + esc(note) + '</div><button class="fccw-primary" type="button" data-end>End Call</button></div>';
    body.querySelector('[data-end]').onclick = function(){ stopVoice(); };
  }

  var GPT_LIVE_IDLE_MS = 90000;
  var GPT_LIVE_MAX_MS = 600000;
  var GPT_LIVE_START_MS = 20000;
  var GPT_LIVE_ICE_MS = 10000;
  var GPT_LIVE_END_GRACE_MS = 3000;
  var GPT_LIVE_CLOSE_WAIT_MS = 5000;

  function stopStream(stream){
    if (!stream || typeof stream.getTracks !== 'function') return;
    stream.getTracks().forEach(function(track){ try { track.stop(); } catch(e) {} });
  }

  function showVoiceIssue(body, message, onBack){
    if (!panel || !body || !body.isConnected) return;
    body.innerHTML = '<div class="fccw-name">Voice issue</div><div class="fccw-note">' + esc(message) + '</div><button class="fccw-primary" type="button" data-back>Back</button>';
    body.querySelector('[data-back]').onclick = onBack;
  }

  function waitForIceGathering(pc, ms){
    return new Promise(function(resolve, reject){
      if (pc.iceGatheringState === 'complete') { resolve(); return; }
      var timer = null;
      var check = function(){ if (pc.iceGatheringState === 'complete') done(null); };
      var done = function(error){
        clearTimeout(timer);
        try { pc.removeEventListener('icegatheringstatechange', check); } catch(e) {}
        if (error) reject(error); else resolve();
      };
      timer = setTimeout(function(){ done(new Error('Connection setup timed out.')); }, ms);
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  // GPT-Live over WebRTC. Resolves { started, mic, fatal }: started = the session is live;
  // otherwise mic is the still-open microphone to reuse for the Gemini fallback, and fatal is
  // set only when the microphone itself is unavailable (the fallback would fail the same way).
  async function startGptLiveVoice(attempt, body){
    var out = { started: false, mic: null, fatal: '' };
    var Peer = window.RTCPeerConnection;
    if (typeof Peer !== 'function' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return out;
    var session = { gptLive: true, closed: false, started: false, phase: 'connecting' };
    var pc = null;
    var dc = null;
    var audioEl = null;
    var micStream = null;
    var timers = {};
    var greeting = '';
    var sessionId = '';
    var idleMs = GPT_LIVE_IDLE_MS;
    var maxMs = GPT_LIVE_MAX_MS;
    var pendingCalls = {};
    var answeredCalls = {};
    var readyResolve = function(){};
    var ready = new Promise(function(resolve){ readyResolve = resolve; });
    var cancelReject = function(){};
    var cancelled = new Promise(function(resolve, reject){ cancelReject = reject; });
    cancelled.catch(function(){});
    var abort = typeof AbortController === 'function' ? new AbortController() : null;
    var stage = 'mic';
    var guard = function(promise){ return Promise.race([promise, cancelled]); };
    var isCancelled = function(){ return session.closed || attempt !== voiceAttempt; };
    var clearTimers = function(){
      for (var name in timers) { if (Object.prototype.hasOwnProperty.call(timers, name)) clearTimeout(timers[name]); }
    };
    var send = function(event){
      if (!dc || dc.readyState !== 'open') return false;
      try { dc.send(JSON.stringify(event)); return true; } catch(e) { return false; }
    };
    var release = function(keepMic){
      clearTimers();
      cancelReject(new Error('cancelled'));
      try { if (abort) abort.abort(); } catch(e) {}
      if (dc) { dc.onopen = null; dc.onmessage = null; dc.onerror = null; dc.onclose = null; }
      if (pc) { pc.ontrack = null; pc.onconnectionstatechange = null; }
      try {
        if (audioEl) {
          audioEl.pause();
          audioEl.srcObject = null;
          if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
        }
      } catch(e) {}
      try { if (dc) dc.close(); } catch(e) {}
      try { if (pc) pc.close(); } catch(e) {}
      if (!keepMic && micStream) { stopStream(micStream); micStream = null; }
      readyResolve(false);
    };
    // Stop button, panel close, idle, max time and end_call all end here: stop the mic and the
    // audio now, ask GPT-Live to close so usage is finalized, and clean up for good after 5 s.
    var beginClose = function(){
      if (session.closed) return;
      session.closed = true;
      clearTimers();
      if (session.started && send({ type: 'session.close' })) {
        stopStream(micStream);
        micStream = null;
        if (audioEl) { try { audioEl.muted = true; audioEl.pause(); } catch(e) {} }
        timers.close = setTimeout(function(){ release(false); }, GPT_LIVE_CLOSE_WAIT_MS);
      } else {
        release(false);
      }
    };
    session.endSession = async function(){ beginClose(); };
    var endOnOwn = function(note){
      if (session.closed) return;
      if (voiceSession === session) voiceSession = null;
      voiceStarting = false;
      beginClose();
      if (!panel) return;
      if (note) messages.push({ role: 'assistant', content: note });
      renderChat(false);
    };
    var setPhase = function(phase){
      if (isCancelled() || session.phase === phase) return;
      session.phase = phase;
      if (!panel || !body.isConnected) return;
      if (phase === 'joining') renderVoiceStatus(body, profile.name + ' is joining', 'Live voice is ready. The greeting will begin automatically.', true);
      else if (phase === 'speaking') renderVoiceStatus(body, profile.name + ' is speaking', 'You can interrupt naturally at any time.', false);
      else if (phase === 'listening') renderVoiceStatus(body, profile.name + ' is listening', 'Speak naturally. You can interrupt at any time.', false);
    };
    var touchIdle = function(){
      clearTimeout(timers.idle);
      timers.idle = setTimeout(function(){
        endOnOwn('The voice session ended after a quiet stretch. Tap Live Voice to talk again, or type here.');
      }, idleMs);
    };
    var handleResponseEvent = function(msg){
      var event = msg.event || {};
      var key = String(msg.delegation_id || '');
      if (event.type === 'response.output_item.done' && event.item && event.item.type === 'function_call' && event.item.call_id) {
        if (!pendingCalls[key]) pendingCalls[key] = [];
        pendingCalls[key].push({ callId: event.item.call_id, name: event.item.name });
        return;
      }
      if (event.type === 'response.failed' || event.type === 'response.incomplete') { delete pendingCalls[key]; return; }
      if (event.type !== 'response.completed') return;
      var calls = pendingCalls[key] || [];
      delete pendingCalls[key];
      var ending = false;
      calls.forEach(function(call){
        if (answeredCalls[call.callId]) return;
        answeredCalls[call.callId] = true;
        var isEnd = call.name === 'end_call';
        send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: call.callId, output: isEnd ? '{"ok":true}' : '{"error":"Tool unavailable. No action was performed."}' } });
        if (isEnd) ending = true;
      });
      if (calls.length) send({ type: 'response.create' });
      if (ending) {
        if (micStream) micStream.getTracks().forEach(function(track){ track.enabled = false; });
        clearTimeout(timers.idle);
        clearTimeout(timers.grace);
        timers.grace = setTimeout(function(){ endOnOwn(''); }, GPT_LIVE_END_GRACE_MS);
      }
    };
    var onMessage = function(event){
      var msg;
      try { msg = JSON.parse(event.data); } catch(e) { return; }
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'session.closed') {
        if (session.closed) { release(false); return; }
        if (!session.started) { readyResolve(false); return; }
        session.closed = true;
        if (voiceSession === session) voiceSession = null;
        voiceStarting = false;
        release(false);
        if (panel) renderChat(false);
        return;
      }
      if (session.closed) return;
      if (msg.type === 'error') {
        if (!session.started) readyResolve(false);
        else endOnOwn('The live voice connection ended unexpectedly. Tap Live Voice to try again, or type here.');
        return;
      }
      if (msg.type === 'session.started') {
        if (session.started) return;
        session.started = true;
        clearTimeout(timers.start);
        voiceStarting = false;
        touchIdle();
        timers.max = setTimeout(function(){
          endOnOwn('This voice session reached its 10 minute limit. Tap Live Voice to start another, or type here.');
        }, maxMs);
        setPhase('joining');
        if (greeting) send({ type: 'session.commentary.append', event_id: 'greeting_' + sessionId, delegation_id: null, content: greeting });
        readyResolve(true);
        return;
      }
      if (!session.started) return;
      if ((msg.type === 'session.input_transcript.delta' || msg.type === 'session.output_transcript.delta') && typeof msg.delta === 'string') {
        touchIdle();
        if (msg.type === 'session.output_transcript.delta') {
          setPhase('speaking');
          clearTimeout(timers.speak);
          timers.speak = setTimeout(function(){ setPhase('listening'); }, 2500);
        } else {
          clearTimeout(timers.speak);
          setPhase('listening');
        }
        return;
      }
      if (msg.type === 'response.event') handleResponseEvent(msg);
    };

    voiceSession = session;
    try {
      // Not raced against cancellation: a stream granted after a cancel must still be stopped below.
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (isCancelled()) { release(false); return out; }
      stage = 'offer';
      pc = new Peer();
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.setAttribute('data-fcc-widget-voice', '1');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      pc.ontrack = function(event){
        var stream = event.streams && event.streams[0];
        if (!stream && typeof MediaStream === 'function') stream = new MediaStream([event.track]);
        audioEl.srcObject = stream;
        try { var played = audioEl.play(); if (played && played.catch) played.catch(function(){}); } catch(e) {}
      };
      pc.onconnectionstatechange = function(){
        if (pc.connectionState !== 'failed' && pc.connectionState !== 'disconnected') return;
        if (session.closed) return;
        if (!session.started) readyResolve(false);
        else endOnOwn('The live voice connection was interrupted. Tap Live Voice to try again, or type here.');
      };
      dc = pc.createDataChannel('oai-events');
      dc.onmessage = onMessage;
      dc.onerror = function(){
        if (session.closed) return;
        if (!session.started) readyResolve(false);
        else endOnOwn('The live voice connection was interrupted. Tap Live Voice to try again, or type here.');
      };
      dc.onclose = function(){
        if (session.closed) { release(false); return; }
        if (!session.started) { readyResolve(false); return; }
        endOnOwn('The live voice connection ended. Tap Live Voice to talk again, or type here.');
      };
      micStream.getTracks().forEach(function(track){ pc.addTrack(track, micStream); });
      await guard(pc.setLocalDescription(await guard(pc.createOffer())));
      await guard(waitForIceGathering(pc, GPT_LIVE_ICE_MS));
      if (isCancelled()) { release(false); return out; }
      stage = 'request';
      var res = await guard(fetch(base + '/api/agent-widget/gpt-live-session', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        signal: abort ? abort.signal : undefined,
        body: JSON.stringify({ agent: agent, sdp: pc.localDescription.sdp })
      }));
      var data = await guard(res.json());
      if (isCancelled()) { release(false); return out; }
      if (!res.ok || !data || data.ok !== true || data.provider !== 'openai' || typeof data.sdp !== 'string' || !data.sessionId) throw new Error('Live voice is not available.');
      sessionId = String(data.sessionId);
      greeting = typeof data.greeting === 'string' ? data.greeting : '';
      if (typeof data.idleSeconds === 'number' && data.idleSeconds > 0) idleMs = Math.min(idleMs, data.idleSeconds * 1000);
      if (typeof data.maxSeconds === 'number' && data.maxSeconds > 0) maxMs = Math.min(maxMs, data.maxSeconds * 1000);
      stage = 'connect';
      timers.start = setTimeout(function(){ readyResolve(false); }, GPT_LIVE_START_MS);
      await guard(pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }));
      var live = await guard(ready);
      if (isCancelled()) { release(false); return out; }
      if (!live) throw new Error('Live voice did not start.');
      out.started = true;
      return out;
    } catch (e) {
      if (isCancelled()) { release(false); return out; }
      if (voiceSession === session) voiceSession = null;
      session.closed = true;
      if (stage === 'mic') {
        release(false);
        out.fatal = 'Microphone access was blocked or is unavailable. Allow the microphone and try again.';
        return out;
      }
      // Any failure before session.started falls back to Gemini Live with the same microphone.
      release(true);
      out.mic = micStream;
      return out;
    }
  }

  async function startVoice(){
    if (voiceStarting || voiceSession) return;
    var body = panel && panel.querySelector('[data-body]');
    if (!body) return;
    var attempt = ++voiceAttempt;
    voiceStarting = true;
    renderVoiceStatus(body, 'Connecting live voice', 'Your browser may ask for microphone permission.', true);
    var live = { started: false, mic: null, fatal: '' };
    try { live = await startGptLiveVoice(attempt, body); } catch(e) { live = { started: false, mic: null, fatal: '' }; }
    if (attempt !== voiceAttempt) { stopStream(live.mic); return; }
    if (live.started) return;
    if (live.fatal) {
      voiceStarting = false;
      showVoiceIssue(body, live.fatal, function(){ renderChat(false); });
      return;
    }
    await startGeminiVoice(attempt, body, live.mic);
  }

  async function startGeminiVoice(attempt, body, existingMic){
    try {
      var tokenRes = await fetch(base + '/api/agent-widget/voice-token?agent=' + encodeURIComponent(agent), { cache: 'no-store' });
      var token = await tokenRes.json();
      if (token.provider !== 'gemini' || !token.token || !token.setup) throw new Error(token.error || 'Voice is not available.');
      if (attempt !== voiceAttempt) { stopStream(existingMic); return; }
      var micStream = existingMic || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (attempt !== voiceAttempt) {
        micStream.getTracks().forEach(function(track){ track.stop(); });
        return;
      }
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      var audioContext = new AudioContextCtor();
      await audioContext.resume();
      var sourceNode = audioContext.createMediaStreamSource(micStream);
      var processor = audioContext.createScriptProcessor(4096, 1, 1);
      var silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      var outputSources = new Set();
      var session = { ws: null, closed: false, setupDone: false, openingSent: false, turnComplete: false, phase: 'connecting', nextPlaybackTime: 0 };
      session.endSession = async function(){
        if (session.closed) return;
        session.closed = true;
        try { processor.disconnect(); } catch(e) {}
        try { sourceNode.disconnect(); } catch(e) {}
        try { silentGain.disconnect(); } catch(e) {}
        outputSources.forEach(function(source){ try { source.stop(); } catch(e) {} });
        outputSources.clear();
        try { if (session.ws) session.ws.close(1000, 'client_ended'); } catch(e) {}
        micStream.getTracks().forEach(function(track){ track.stop(); });
        try { await audioContext.close(); } catch(e) {}
      };
      voiceSession = session;
      var clearOutput = function(){
        outputSources.forEach(function(source){ try { source.stop(); } catch(e) {} });
        outputSources.clear();
        session.nextPlaybackTime = audioContext.currentTime;
      };
      var playAudio = function(base64){
        var floats = pcm16Base64ToFloat(base64);
        if (!floats.length || session.closed) return;
        session.turnComplete = false;
        if (session.phase !== 'speaking') {
          session.phase = 'speaking';
          renderVoiceStatus(body, profile.name + ' is speaking', 'You can interrupt naturally at any time.', false);
        }
        var buffer = audioContext.createBuffer(1, floats.length, 24000);
        buffer.copyToChannel(floats, 0);
        var output = audioContext.createBufferSource();
        output.buffer = buffer;
        output.connect(audioContext.destination);
        var startAt = Math.max(audioContext.currentTime + 0.02, session.nextPlaybackTime || 0);
        output.start(startAt);
        session.nextPlaybackTime = startAt + buffer.duration;
        outputSources.add(output);
        output.onended = function(){
          outputSources.delete(output);
          if (session.turnComplete && !outputSources.size && !session.closed) {
            session.phase = 'listening';
            renderVoiceStatus(body, profile.name + ' is listening', 'Speak naturally. You can interrupt at any time.', false);
          }
        };
      };
      var ws = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(token.token));
      session.ws = ws;
      processor.onaudioprocess = function(event){
        event.outputBuffer.getChannelData(0).fill(0);
        if (ws.readyState !== WebSocket.OPEN || !session.setupDone || session.closed) return;
        var data = floatToPcm16Base64(event.inputBuffer.getChannelData(0), audioContext.sampleRate, 16000);
        ws.send(JSON.stringify({ realtimeInput: { audio: { data: data, mimeType: 'audio/pcm;rate=16000' } } }));
      };
      ws.onopen = function(){ ws.send(JSON.stringify({ setup: token.setup })); };
      ws.onmessage = async function(event){
        var message;
        try { message = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text()); } catch(e) { return; }
        if (message.setupComplete) {
          if (session.setupDone || session.closed || attempt !== voiceAttempt) return;
          if (!session.openingSent && ws.readyState === WebSocket.OPEN) {
            session.openingSent = true;
            ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: token.openingPrompt || ('Begin this live voice session now as ' + profile.name + '. Give one brief welcome and ask how you can help. Do not wait for the visitor to speak first.') }] }], turnComplete: true } }));
          }
          session.setupDone = true;
          voiceStarting = false;
          session.phase = 'joining';
          renderVoiceStatus(body, profile.name + ' is joining', 'Live voice is ready. The greeting will begin automatically.', true);
          return;
        }
        var content = message.serverContent;
        if (content && content.interrupted) {
          clearOutput();
          session.turnComplete = true;
          session.phase = 'listening';
          renderVoiceStatus(body, profile.name + ' is listening', 'Speak naturally. You can interrupt at any time.', false);
        }
        var parts = content && content.modelTurn && content.modelTurn.parts || [];
        parts.forEach(function(part){ if (part.inlineData && part.inlineData.data) playAudio(part.inlineData.data); });
        if (content && content.turnComplete) {
          session.turnComplete = true;
          if (!outputSources.size && !session.closed) {
            session.phase = 'listening';
            renderVoiceStatus(body, profile.name + ' is listening', 'Speak naturally. You can interrupt at any time.', false);
          }
        }
      };
      ws.onerror = function(){
        if (attempt !== voiceAttempt || session.closed) return;
        voiceStarting = false;
        if (panel && body.isConnected) {
          body.innerHTML = '<div class="fccw-name">Voice issue</div><div class="fccw-note">The live voice connection was interrupted.</div><button class="fccw-primary" type="button" data-back>Back</button>';
          body.querySelector('[data-back]').onclick = function(){ stopVoice(); };
        }
      };
      ws.onclose = function(){
        if (voiceSession !== session) return;
        voiceStarting = false;
        voiceSession = null;
        session.endSession();
        if (panel) renderChat(false);
      };
    } catch (e) {
      stopStream(existingMic);
      if (attempt !== voiceAttempt) return;
      voiceStarting = false;
      if (!panel || !body.isConnected) return;
      body.innerHTML = '<div class="fccw-name">Voice issue</div><div class="fccw-note">' + esc(e.message || 'Voice could not start.') + '</div><button class="fccw-primary" type="button" data-back>Back</button>';
      body.querySelector('[data-back]').onclick = function(){ renderChat(false); };
    }
  }

  async function stopVoice(renderAfter){
    voiceAttempt += 1;
    voiceStarting = false;
    var session = voiceSession;
    voiceSession = null;
    try { if (session && session.endSession) await session.endSession(); } catch(e) {}
    if (renderAfter !== false && panel) renderChat(false);
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
