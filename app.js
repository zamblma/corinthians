const BRD = {
  'campeonato brasileiro serie a': ['Globo', 'Premiere', 'Sportv'],
  'campeonato brasileiro serie b': ['Sportv', 'Premiere'],
  'copa do brasil': ['Globo', 'Sportv'],
  'campeonato paulista': ['Record TV', 'MAX', 'YouTube'],
  'copa libertadores': ['ESPN', 'Disney+'],
  'copa sudamericana': ['ESPN', 'Disney+'],
  'copa do mundo': ['Globo', 'Sportv'],
  'recopa': ['ESPN', 'Disney+'],
  'amistoso': ['YouTube'],
};

const $ = s => document.querySelector(s);
let st = { notif: false, remind: true, matches: [], notified: new Set() };

function load() {
  try {
    const d = JSON.parse(localStorage.getItem('ct') || '{}');
    st.notif = !!d.notif; st.remind = d.remind !== false;
    if (d.notified) st.notified = new Set(d.notified);
  } catch(e) {}
}
function save() {
  localStorage.setItem('ct', JSON.stringify({ notif: st.notif, remind: st.remind, notified: [...st.notified] }));
}
function toast(text) { const t = $('#toast'); t.textContent = text; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 4500); }
function sdot(cls, text) { $('#sdot').className = 'sdot ' + cls; $('#stxt').textContent = text; }

function getBRD(nome) {
  if (!nome) return ['A definir'];
  const n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [k, v] of Object.entries(BRD)) { if (n.includes(k)) return v; }
  return ['A definir'];
}

function fmtD(d) {
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'], meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtT(d) { return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' }); }
function cdwn(d) {
  const diff = d - new Date();
  if (diff <= 0) return 'Jogo ja comecou!';
  const days = Math.floor(diff/86400000), h = Math.floor((diff%86400000)/3600000), m = Math.floor((diff%3600000)/60000);
  if (days > 0) return `Faltam <strong>${days}d ${h}h ${m}min</strong>`;
  if (h > 0) return `Falta <strong>${h}h ${m}min</strong>`;
  return `Falta <strong>${m}min</strong>`;
}

const BRASILEIRAO = 'Brasileirão Série A';

async function buscarJogos() {
  sdot('yellow', 'Carregando...');
  $('#matches').innerHTML = '<div class="loading"><div class="spin"></div></div>';

  try {
    const r = await fetch('matches.json?' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();

    $('#lastUpd').textContent = data.lastUpdated ? new Date(data.lastUpdated + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '--';

    if (!data.corinthiansMatches || data.corinthiansMatches.length === 0) {
      $('#matches').innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg><p>Nenhum jogo do Corinthians encontrado.</p></div>';
      sdot('gray', 'Nenhum jogo');
      return;
    }

    st.matches = data.corinthiansMatches
      .map(m => ({
        id: `${m.round}-${m.homeTeam}-${m.awayTeam}`,
        date: new Date(m.datetime + (m.datetime.endsWith('Z') ? '' : '-03:00')),
        homeName: m.homeTeam,
        awayName: m.awayTeam,
        venue: m.stadium || 'Local a definir',
        league: m.championship || BRASILEIRAO,
        ch: getBRD(m.championship || BRASILEIRAO),
        isHome: m.isHome,
        opponent: m.opponent,
        opponentAcronym: m.opponentAcronym,
        round: m.round,
        status: m.status,
      }))
      .filter(m => m.date >= new Date())
      .sort((a, b) => a.date - b.date);

    render();
    sdot(st.matches.length > 0 ? 'green' : 'gray',
      st.matches.length > 0 ? `${st.matches.length} ${st.matches.length === 1 ? 'jogo' : 'jogos'} encontrado${st.matches.length === 1 ? '' : 's'}` : 'Nenhum jogo agendado');
  } catch (err) {
    $('#matches').innerHTML = `<div class="empty"><p style="color:#ef5350">Erro ao carregar dados: ${err.message}</p><p style="margin-top:8px;font-size:0.85rem;color:var(--gray-500)">Verifique se o arquivo <strong>matches.json</strong> existe ou se o GitHub Action ja rodou.</p></div>`;
    sdot('red', 'Erro');
  }
}

function render() {
  const c = $('#matches');
  if (!st.matches.length) {
    c.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg><p>Nenhum jogo do Corinthians agendado.</p></div>';
    return;
  }
  c.innerHTML = st.matches.map(m => `<div class="card">
    <div class="cd">${fmtD(m.date)} &bull; ${fmtT(m.date)} &bull; Rodada ${m.round}</div>
    <div class="ct">
      <div class="tc"><span class="nm h">${m.homeName}</span></div>
      <div class="vs">VS</div>
      <div class="tc"><span class="nm a">${m.awayName}</span></div>
    </div>
    <div class="dts">
      <div class="dt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${fmtD(m.date)} as ${fmtT(m.date)}</div>
      <div class="dt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${m.venue}</div>
      <div class="dt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>${m.league}</div>
      <div class="dt brd"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span class="lb">Transmissao:</span><div class="chips">${m.ch.map(c => `<span class="chip">${c}</span>`).join('')}</div></div>
    </div>
    <div class="cdwn">${cdwn(m.date)}</div>
  </div>`).join('');
  checkNotifs();
}

function checkNotifs() {
  if (!st.notif || Notification.permission !== 'granted' || !st.matches) return;
  const now = Date.now();
  st.matches.forEach(m => {
    if (st.notified.has(m.id)) return;
    const diff = m.date.getTime() - now;
    if (diff <= 0) { st.notified.add(m.id); save(); return; }
    if (st.remind && diff <= 3600000 && diff > 0) {
      new Notification('Corinthians - 1 hora!', {
        body: `${m.isHome ? m.awayName : m.homeName} - ${m.venue} as ${fmtT(m.date)}`,
      });
      st.notified.add(m.id); save();
    }
    if (diff <= 86400000 && diff > 3600000) {
      new Notification('Corinthians - Jogo amanha!', {
        body: `${m.isHome ? m.awayName : m.homeName} - ${fmtD(m.date)} as ${fmtT(m.date)}`,
      });
      st.notified.add(m.id); save();
    }
  });
}

function init() {
  load();
  $('#notifT').checked = st.notif;
  $('#remindT').checked = st.remind;

  $('#notifT').addEventListener('change', () => {
    st.notif = $('#notifT').checked; save();
    if (st.notif && 'Notification' in window) {
      if (Notification.permission === 'default') Notification.requestPermission();
      else if (Notification.permission === 'denied') { toast('Notificacoes bloqueadas.'); st.notif = false; $('#notifT').checked = false; save(); }
    }
  });
  $('#remindT').addEventListener('change', () => { st.remind = $('#remindT').checked; save(); });
  $('#refreshBtn').addEventListener('click', buscarJogos);

  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  buscarJogos();
  setInterval(buscarJogos, 1800000);
  setInterval(() => { if (st.matches.length) render(); }, 60000);
}

document.addEventListener('DOMContentLoaded', init);
