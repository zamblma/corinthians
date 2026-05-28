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

const COMP_KEYS = [
  { key: 'todas', label: 'Todas' },
  { key: 'brasileirao', label: 'Brasileirão' },
  { key: 'libertadores', label: 'Libertadores' },
  { key: 'copabrasil', label: 'Copa do Brasil' },
  { key: 'sudamericana', label: 'Sul-Americana' },
  { key: 'paulista', label: 'Paulista' },
];

const $ = s => document.querySelector(s);
let st = { notif: false, remind: true, matches: [], filtered: [], all: [], notified: new Set(), filter: 'todas', local: '', standings: [], hamTab: 'classif' };

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
function fmtData(d) { return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`; }
function cdwn(d) {
  const diff = d - new Date();
  if (diff <= 0) {
    if (diff >= -7200000) return 'AO VIVO';
    return 'Jogo encerrado';
  }
  const days = Math.floor(diff/86400000), h = Math.floor((diff%86400000)/3600000), m = Math.floor((diff%3600000)/60000);
  if (days > 0) return `Faltam <strong>${days}d ${h}h ${m}min</strong>`;
  if (h > 0) return `Falta <strong>${h}h ${m}min</strong>`;
  return `Falta <strong>${m}min</strong>`;
}

function renderFiltros() {
  const c = $('#filtros');
  c.innerHTML = COMP_KEYS.map(f =>
    `<button class="fbtn${st.filter === f.key ? ' ativo' : ''}" data-key="${f.key}">${f.label}</button>`
  ).join('');
  c.innerHTML += `<span class="fsep"></span>
    <button class="fbtn fsmall${st.local === 'casa' ? ' ativo' : ''}" data-local="casa">Casa</button>
    <button class="fbtn fsmall${st.local === 'fora' ? ' ativo' : ''}" data-local="fora">Fora</button>`;
  c.querySelectorAll('.fbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.key) {
        st.filter = btn.dataset.key;
      } else if (btn.dataset.local) {
        st.local = st.local === btn.dataset.local ? '' : btn.dataset.local;
      }
      renderFiltros();
      aplicarFiltro();
    });
  });
}

function aplicarFiltro() {
  const agora = new Date();
  let lista = st.filter === 'todas' ? st.all : st.all.filter(m => m.championshipKey === st.filter);
  if (st.local === 'casa') lista = lista.filter(m => m.isHome);
  else if (st.local === 'fora') lista = lista.filter(m => !m.isHome);
  st.filtered = lista.filter(m => m.date >= agora || m.isLive).sort((a, b) => a.date - b.date);
  render();
}

function calcResumo(jogos) {
  const r = { vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0, jogos: 0 };
  jogos.forEach(m => {
    if (m.status === 'scheduled' || m.status === 'live') return;
    r.jogos++;
    if (m.homeGoals !== null && m.awayGoals !== null) {
      if (m.isHome) { r.golsPro += m.homeGoals; r.golsContra += m.awayGoals; }
      else { r.golsPro += m.awayGoals; r.golsContra += m.homeGoals; }
    }
    if (m.resultado === 'V') r.vitorias++;
    else if (m.resultado === 'E') r.empates++;
    else if (m.resultado === 'D') r.derrotas++;
  });
  return r;
}

async function buscarJogos() {
  sdot('yellow', 'Carregando...');
  $('#matches').innerHTML = `
    <div class="skel-card">
      <div class="skel skel-l" style="width:40%"></div>
      <div class="skel-r">
        <div style="text-align:center"><div class="skel skel-c"></div><div class="skel skel-l" style="width:50%;margin:8px auto 0"></div></div>
        <div class="skel skel-l" style="width:30px;height:30px;border-radius:50%"></div>
        <div style="text-align:center"><div class="skel skel-c"></div><div class="skel skel-l" style="width:50%;margin:8px auto 0"></div></div>
      </div>
      <div class="skel skel-l" style="width:60%;margin:0 auto"></div>
    </div>
    <div class="skel-card">
      <div class="skel skel-l" style="width:30%"></div>
      <div style="display:flex;gap:8px;justify-content:center">
        ${'<div class="skel" style="width:52px;height:56px;border-radius:12px"></div>'.repeat(6)}
      </div>
    </div>
    <div class="skel-card">
      <div class="skel skel-l" style="width:50%"></div>
      <div style="display:flex;gap:8px">
        ${'<div class="skel" style="width:100px;height:76px;border-radius:12px"></div>'.repeat(5)}
      </div>
    </div>`;

  try {
    const r = await fetch('matches.json?' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();

    $('#lastUpd').textContent = data.lastUpdated ? new Date(data.lastUpdated + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '--';

    if (!data.corinthiansMatches || data.corinthiansMatches.length === 0) {
      $('#matches').innerHTML = '<div class="empty"><p>Nenhum jogo do Corinthians encontrado.</p></div>';
      sdot('gray', 'Nenhum jogo');
      return;
    }

    const agora = new Date();
    st.all = data.corinthiansMatches.map(m => {
      const d = new Date(m.datetime + (m.datetime.endsWith('Z') ? '' : '-03:00'));
      let resultado = '';
      let isLive = false;
      const agora = new Date();
      const diff = d - agora;
      if (m.status === 'live') {
        isLive = true;
      } else if (m.status === 'scheduled') {
        isLive = diff <= 0 && diff >= -7200000;
      } else if (m.homeGoals !== null && m.awayGoals !== null) {
        // If the raw date matches today, goals means match is live/in-progress
        const rawDate = m.date;
        const todayStr = new Date().toISOString().substring(0, 10);
        if (rawDate === todayStr) {
          isLive = true;
        } else {
          // Otherwise check time window (2.5h)
          isLive = diff <= 0 && diff >= -9000000;
        }
      }
      if ((m.status === 'finished' || m.status === 'draw') && m.homeGoals !== null && m.awayGoals !== null) {
        if (m.isHome) resultado = m.homeGoals > m.awayGoals ? 'V' : m.homeGoals < m.awayGoals ? 'D' : 'E';
        else resultado = m.awayGoals > m.homeGoals ? 'V' : m.awayGoals < m.homeGoals ? 'D' : 'E';
      }
      return {
        id: `${m.championshipKey}-${m.round}-${m.homeTeam}-${m.awayTeam}`,
        date: d,
        homeName: m.homeTeam, homeLogo: m.homeLogo || '',
        awayName: m.awayTeam, awayLogo: m.awayLogo || '',
        venue: m.stadium || 'Local a definir',
        league: m.championship, championshipKey: m.championshipKey,
        ch: getBRD(m.championship), isHome: m.isHome,
        opponent: m.opponent, round: m.round, matchId: m.matchId,
        liveMinute: m.liveMinute || (isLive ? Math.min(Math.floor(-diff / 60000), 120) : null),
        status: m.status, resultado, isLive,
        homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      };
    }).sort((a, b) => a.date - b.date);

    st.matches = st.all.filter(m => m.date >= agora || m.isLive).sort((a, b) => a.date - b.date);
    st.standings = data.standings || [];
    st.lineups = data.lineups || {};
    aplicarFiltro();
    const liveCount = st.all.filter(m => m.isLive).length;
    if (liveCount > 0) {
      sdot('red', `${liveCount} ao vivo`);
    } else {
      sdot(st.matches.length > 0 ? 'green' : 'gray',
        `${st.matches.length} ${st.matches.length === 1 ? 'jogo' : 'jogos'} restante${st.matches.length === 1 ? '' : 's'}`);
    }
  } catch (err) {
    $('#matches').innerHTML = `<div class="empty"><p style="color:#ef4444">Erro: ${err.message}</p></div>`;
    sdot('red', 'Erro');
  }
}

function render() {
  const c = $('#matches');
  const filtrados = st.filtered;

  // Próximo jogo em destaque
  let html = '';

  // AO VIVO banner (agora com escudos, nomes e estadio)
  const liveMatch = filtrados.find(m => m.isLive);
  if (liveMatch) {
    html += `<div class="live-banner card card-destaque card-live" style="cursor:pointer" id="liveBanner">
      <div class="ct">
        <div class="tc">${liveMatch.homeLogo ? `<img class="bd" src="${liveMatch.homeLogo}" alt="">` : ''}<span class="nm h">${liveMatch.homeName}</span><span class="ls-num">${liveMatch.homeGoals !== null ? liveMatch.homeGoals : '?'}</span></div>
        <span class="ls-dot"></span>
        <div class="tc"><span class="ls-num">${liveMatch.awayGoals !== null ? liveMatch.awayGoals : '?'}</span><span class="nm a">${liveMatch.awayName}</span>${liveMatch.awayLogo ? `<img class="bd" src="${liveMatch.awayLogo}" alt="">` : ''}</div>
      </div>
      <div class="destaque-info">
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${liveMatch.venue} <span class="habadge ${liveMatch.isHome ? 'h' : 'a'}">${liveMatch.isHome ? 'casa' : 'fora'}</span></div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>${liveMatch.league} &bull; Rodada ${liveMatch.round}</div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>${liveMatch.ch.map(c => `${c}`).join(' / ')}</div>
      </div>
      <div class="cdwn cdwn-grande"><span class="live-dot"></span> AO VIVO${liveMatch.liveMinute ? ` <span class="live-minuto">${liveMatch.liveMinute}'</span>` : ''}</div>
    </div>`;
  } else if (filtrados.length > 0) {
    const p = filtrados[0];
    html += `<div class="card card-destaque">
      <div class="cd">PROXIMO JOGO &bull; ${fmtD(p.date)} &bull; ${fmtT(p.date)}</div>
      <div class="ct">
        <div class="tc">${p.homeLogo ? `<img class="bd" src="${p.homeLogo}" alt="">` : ''}<span class="nm h">${p.homeName}</span></div>
        <div class="vs">VS</div>
        <div class="tc">${p.awayLogo ? `<img class="bd" src="${p.awayLogo}" alt="">` : ''}<span class="nm a">${p.awayName}</span></div>
      </div>
      <div class="destaque-info">
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${p.venue} <span class="habadge ${p.isHome ? 'h' : 'a'}">${p.isHome ? 'casa' : 'fora'}</span></div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>${p.league} &bull; Rodada ${p.round}</div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>${p.ch.map(c => `${c}`).join(' / ')}</div>
      </div>
      <div class="cdwn cdwn-grande">${cdwn(p.date)}</div>
    </div>`;
  }

  // Resumo
  const finalizados = st.all.filter(m => m.status !== 'scheduled' && m.status !== 'live');
  if (finalizados.length > 0) {
    const resumo = calcResumo(finalizados.filter(m => st.filter === 'todas' || m.championshipKey === st.filter));
    html += `<div class="resumo">
      <div class="r-item"><span class="r-num">${resumo.jogos}</span><span class="r-lab">Jogos</span></div>
      <div class="r-item r-v"><span class="r-num">${resumo.vitorias}</span><span class="r-lab">V</span></div>
      <div class="r-item r-e"><span class="r-num">${resumo.empates}</span><span class="r-lab">E</span></div>
      <div class="r-item r-d"><span class="r-num">${resumo.derrotas}</span><span class="r-lab">D</span></div>
      <div class="r-item"><span class="r-num">${resumo.golsPro}</span><span class="r-lab">GP</span></div>
      <div class="r-item"><span class="r-num">${resumo.golsContra}</span><span class="r-lab">GC</span></div>
    </div>`;
  }

  // Ultimos resultados
  const ultimos = finalizados.filter(m => st.filter === 'todas' || m.championshipKey === st.filter).slice(-5).reverse();
  if (ultimos.length > 0) {
    html += `<div class="section-title">Ultimos Resultados</div><div class="ultimos">`;
    ultimos.forEach(m => {
      const cls = m.resultado === 'V' ? 'r-v' : m.resultado === 'E' ? 'r-e' : m.resultado === 'D' ? 'r-d' : '';
      html += `<div class="ult-card ${cls}">
        <span class="u-data">${fmtData(m.date)}</span>
        <span class="u-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
        <span class="u-adv">${m.opponent}</span>
        <span class="u-comp">${m.league}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Proximos jogos
  const futuros = filtrados.filter(m => !m.isLive);
  if (futuros.length > 0) {
    html += `<div class="section-title">Proximos Jogos (${futuros.length})</div>`;
    html += futuros.map(m => `<div class="card">
      <div class="cd">${fmtD(m.date)} &bull; ${fmtT(m.date)}</div>
      <div class="ccomp">${m.league} &bull; Rodada ${m.round}</div>
      <div class="ct">
        <div class="tc">${m.homeLogo ? `<img class="bd" src="${m.homeLogo}" alt="">` : ''}<span class="nm h">${m.homeName}</span></div>
        <div class="vs">VS</div>
        <div class="tc">${m.awayLogo ? `<img class="bd" src="${m.awayLogo}" alt="">` : ''}<span class="nm a">${m.awayName}</span></div>
      </div>
      <div class="destaque-info">
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${m.venue} <span class="habadge ${m.isHome ? 'h' : 'a'}">${m.isHome ? 'casa' : 'fora'}</span></div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>${m.ch.map(c => `${c}`).join(' / ')}</div>
      </div>
      <div class="cdwn">${cdwn(m.date)}</div>
    </div>`).join('');
  }

  if (!html) {
    html = '<div class="empty"><p>Nenhum jogo encontrado.</p></div>';
  }

  c.innerHTML = html;

  // Live match card click → detail modal
  const liveCard = document.getElementById('liveBanner');
  if (liveCard) {
    liveCard.addEventListener('click', () => {
      const liveMatch = st.filtered.find(m => m.isLive);
      if (liveMatch) renderMatchModal(liveMatch);
    });
  }

  checkNotifs();
  renderHamTab();
}

function renderHamTab() {
  const tab = st.hamTab || 'classif';
  if (tab === 'classif') renderClassif();
  else if (tab === 'escalacao') renderEscalacao();
  else if (tab === 'historico') renderHistorico();
  else if (tab === 'aproveitamento') renderAproveitamento();
  else if (tab === 'sequencia') renderSequencia();
  else if (tab === 'calendario') renderCalendario();
  else if (tab === 'exportar') renderExportar();
}

function renderClassif() {
  const c = $('#hamContent');
  const tabelas = st.standings.filter(t => st.filter === 'todas' || t.championshipKey === st.filter);
  if (tabelas.length === 0) { c.innerHTML = '<div class="empty"><p>Classificacao indisponivel.</p></div>'; return; }

  const tab = tabelas[0];
  let html = `<div class="st-legenda">
    <span class="st-leg z1">Libertadores</span>
    <span class="st-leg z2">Pre-Libertadores</span>
    <span class="st-leg z3">Sul-Americana</span>
    <span class="st-leg z4">Rebaixamento</span>
  </div>`;
  html += `<div class="standings"><table class="st-table">
    <thead><tr>
      <th class="st-pos">#</th>
      <th class="st-team">Time</th>
      <th class="st-num">P</th>
      <th class="st-num">J</th>
      <th class="st-num">V</th>
      <th class="st-num">E</th>
      <th class="st-num">D</th>
      <th class="st-num">GP</th>
      <th class="st-num">GC</th>
      <th class="st-num">SG</th>
      <th class="st-num">%</th>
    </tr></thead><tbody>`;
  tab.teams.forEach(t => {
    const zClass = t.zone === 1 ? 'st-z1' : t.zone === 2 ? 'st-z2' : t.zone === 3 ? 'st-z3' : t.zone === 4 ? 'st-z4' : '';
    const isCor = t.name === 'Corinthians' ? ' st-cor' : '';
    let movHtml = '';
    if (t.movement) {
      const isUp = t.movement.startsWith('S');
      movHtml = `<span class="st-mov ${isUp ? 'st-up' : 'st-down'}">${isUp ? '▲' : '▼'}</span>`;
    }
    html += `<tr class="${zClass}${isCor}">
      <td class="st-pos">${movHtml}<span class="st-pos-num">${t.pos}</span></td>
      <td class="st-team"><img class="st-shield" src="${t.shield}" alt="">${t.name}</td>
      <td class="st-num st-pontos">${t.points}</td>
      <td class="st-num">${t.games}</td>
      <td class="st-num">${t.wins}</td>
      <td class="st-num">${t.draws}</td>
      <td class="st-num">${t.losses}</td>
      <td class="st-num">${t.goalsFor}</td>
      <td class="st-num">${t.goalsAgainst}</td>
      <td class="st-num">${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}</td>
      <td class="st-num">${t.pct}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  c.innerHTML = html;
}

function renderEscalacao() {
  const c = $('#hamContent');
  const comEscalacao = st.all.filter(m => m.status !== 'scheduled' && m.status !== 'live' && m.matchId && st.lineups[m.matchId]).sort((a, b) => b.date - a.date);
  const proximos = st.all.filter(m => (m.status === 'scheduled' || m.status === 'live') && m.matchId).sort((a, b) => a.date - b.date);
  const total = comEscalacao.length + proximos.length;

  let html = '';
  if (total === 0) {
    html = '<div class="empty"><p>Nenhuma escalacao disponivel.</p></div>';
    c.innerHTML = html;
    return;
  }

  if (comEscalacao.length > 0) {
    html += `<p style="font-size:0.85rem;color:var(--gray-400);margin-bottom:12px">Clique em um jogo para ver a escalacao:</p>`;
    comEscalacao.forEach((m, idx) => {
      const isFirst = idx === 0;
      html += `<div class="escala-item" data-idx="${idx}">
        <span class="escala-data">${fmtData(m.date)}</span>
        <span class="escala-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
        <span class="escala-adv">${m.isHome ? m.awayName : m.homeName}</span>
        <span class="escala-comp">${m.league}</span>
        <span class="escala-toggle ${isFirst ? 'aberto' : ''}">${isFirst ? '▲' : '▼'}</span>
      </div>`;
      if (isFirst) {
        const lineup = st.lineups[m.matchId];
        html += `<div class="escala-detalhe" id="escala-det-${idx}">`;
        lineup.forEach(team => {
          html += `<div class="escala-time">
            <div class="escala-time-nome">${team.team} (${team.acronym})</div>
            <div class="escala-jogadores">`;
          team.players.forEach(p => {
            html += `<div class="escala-jogador">
              <span class="ej-num">${p.num}</span>
              <span class="ej-nome">${p.name}</span>
              <span class="ej-pos">${p.pos}</span>
            </div>`;
          });
          html += `</div></div>`;
        });
        html += `</div>`;
      }
    });
  }

  if (proximos.length > 0) {
    html += `<p style="font-size:0.85rem;color:var(--gray-400);margin:16px 0 8px">Proximos jogos (escalacao aparece ~1h antes):</p>`;
    proximos.forEach(m => {
      html += `<div class="escala-item" style="cursor:default;opacity:0.6">
        <span class="escala-data">${fmtData(m.date)}</span>
        <span class="escala-placar" style="color:var(--gray-500)">--</span>
        <span class="escala-adv">${m.isHome ? m.awayName : m.homeName}</span>
        <span class="escala-comp">${m.league}</span>
        <span class="escala-toggle" style="color:var(--gray-500);font-size:0.65rem">⏳</span>
      </div>`;
    });
  }

  html += `<p style="color:var(--gray-500);font-size:0.7rem;margin-top:12px">Dados coletados do Terra Esportes.</p>`;
  c.innerHTML = html;

  setTimeout(() => {
    c.querySelectorAll('.escala-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = item.dataset.idx;
        if (idx === undefined) return;
        const det = document.getElementById(`escala-det-${idx}`);
        if (!det) return;
        const isOpen = det.style.display !== 'none';
        det.style.display = isOpen ? 'none' : 'block';
        item.querySelector('.escala-toggle').textContent = isOpen ? '▼' : '▲';
        item.querySelector('.escala-toggle').classList.toggle('aberto', !isOpen);
      });
    });
  }, 0);
}

function renderHistorico() {
  const c = $('#hamContent');
  const jogos = st.all.filter(m => m.status !== 'scheduled' && m.status !== 'live').sort((a, b) => b.date - a.date);
  if (jogos.length === 0) { c.innerHTML = '<div class="empty"><p>Nenhum jogo realizado.</p></div>'; return; }
  let html = `<p class="st-legenda" style="font-size:0.85rem;color:var(--gray-400)">Todos os jogos do Corinthians na temporada:</p>`;
  jogos.forEach(m => {
    const cls = m.resultado === 'V' ? 'r-v' : m.resultado === 'E' ? 'r-e' : m.resultado === 'D' ? 'r-d' : '';
    html += `<div class="historico-item ${cls}">
      <span class="h-data">${fmtData(m.date)}</span>
      <span class="h-comp">${m.league}</span>
      <span class="h-adv">${m.isHome ? m.awayName : m.homeName}</span>
      <span class="h-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
    </div>`;
  });
  c.innerHTML = html;
}

function renderAproveitamento() {
  const c = $('#hamContent');
  const comps = {};
  st.all.filter(m => m.status !== 'scheduled' && m.status !== 'live').forEach(m => {
    if (!comps[m.league]) comps[m.league] = { j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
    const r = comps[m.league]; r.j++;
    if (m.isHome) { r.gp += m.homeGoals; r.gc += m.awayGoals; }
    else { r.gp += m.awayGoals; r.gc += m.homeGoals; }
    if (m.resultado === 'V') r.v++;
    else if (m.resultado === 'E') r.e++;
    else if (m.resultado === 'D') r.d++;
  });
  if (Object.keys(comps).length === 0) { c.innerHTML = '<div class="empty"><p>Sem dados.</p></div>'; return; }
  let html = `<div class="standings"><table class="st-table">
    <thead><tr><th>Competicao</th><th class="st-num">J</th><th class="st-num">V</th><th class="st-num">E</th><th class="st-num">D</th><th class="st-num">GP</th><th class="st-num">GC</th><th class="st-num">SG</th><th class="st-num">%</th></tr></thead><tbody>`;
  Object.entries(comps).forEach(([nome, r]) => {
    const pct = r.j > 0 ? Math.round((r.v * 3 + r.e) / (r.j * 3) * 100) : 0;
    html += `<tr><td class="st-team">${nome}</td>
      <td class="st-num">${r.j}</td>
      <td class="st-num" style="color:#22c55e">${r.v}</td>
      <td class="st-num" style="color:#eab308">${r.e}</td>
      <td class="st-num" style="color:#ef4444">${r.d}</td>
      <td class="st-num">${r.gp}</td>
      <td class="st-num">${r.gc}</td>
      <td class="st-num">${r.gp - r.gc}</td>
      <td class="st-num st-pontos">${pct}%</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  c.innerHTML = html;
}

function renderSequencia() {
  const c = $('#hamContent');
  const ultimos = st.all.filter(m => m.status !== 'scheduled' && m.status !== 'live').sort((a, b) => b.date - a.date).slice(0, 15);
  if (ultimos.length === 0) { c.innerHTML = '<div class="empty"><p>Sem resultados.</p></div>'; return; }

  // Sparkline bars
  let sparkHtml = '<div class="fspark">';
  const maxGols = Math.max(...ultimos.map(m => Math.max(m.homeGoals || 0, m.awayGoals || 0)), 3);
  [...ultimos].reverse().forEach(m => {
    const isV = m.resultado === 'V', isE = m.resultado === 'E';
    const cls = isV ? 'up' : isE ? 'ok' : 'down';
    const gols = Math.max(m.homeGoals || 0, m.awayGoals || 0);
    const pct = Math.max((gols / maxGols) * 100, 15);
    const label = (m.isHome ? m.homeGoals : m.awayGoals) + '-' + (m.isHome ? m.awayGoals : m.homeGoals);
    sparkHtml += `<div class="fbar ${cls}" style="height:${pct}%" data-label="${label}" title="${m.opponent} (${fmtData(m.date)})"></div>`;
  });
  sparkHtml += '</div>';

  let html = `<p style="font-size:0.85rem;color:var(--gray-400);margin-bottom:4px">Ultimos 15 jogos do Timao:</p>${sparkHtml}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">`;
  ultimos.forEach(m => {
    const isV = m.resultado === 'V', isE = m.resultado === 'E', isD = m.resultado === 'D';
    const cor = isV ? '#22c55e' : isE ? '#eab308' : '#ef4444';
    const placar = (m.isHome ? m.homeGoals : m.awayGoals) + '-' + (m.isHome ? m.awayGoals : m.homeGoals);
    html += `<div style="width:36px;text-align:center;background:${cor}22;border:1px solid ${cor};border-radius:6px;padding:4px 2px;font-size:0.7rem;font-weight:700;color:${cor}">${placar}</div>`;
  });
  html += `</div><p style="color:var(--gray-500);font-size:0.8rem">🟢 Vitoria &nbsp; 🟡 Empate &nbsp; 🔴 Derrota</p>`;
  c.innerHTML = html;
}

function renderCalendario() {
  const c = $('#hamContent');
  const meses = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const grupos = {};
  st.all.forEach(m => {
    const chave = `${m.date.getFullYear()}-${String(m.date.getMonth()+1).padStart(2,'0')}`;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(m);
  });
  const keys = Object.keys(grupos).sort();
  if (keys.length === 0) { c.innerHTML = '<div class="empty"><p>Sem jogos.</p></div>'; return; }
  let html = '';
  keys.forEach(k => {
    const [ano, mes] = k.split('-');
    html += `<div class="section-title" style="margin-top:12px">${meses[parseInt(mes)-1]} ${ano}</div>`;
    grupos[k].sort((a, b) => a.date - b.date).forEach(m => {
      const isDone = m.status !== 'scheduled' && m.status !== 'live';
      const status = isDone ? (m.resultado === 'V' ? '🟢' : m.resultado === 'E' ? '🟡' : '🔴') : '';
      const placar = isDone ? `${m.isHome ? m.homeGoals : m.awayGoals}x${m.isHome ? m.awayGoals : m.homeGoals}` : (m.status === 'live' ? 'AO VIVO' : '--');
      html += `<div class="cal-item">
        <span class="cal-data">${fmtData(m.date)}</span>
        <span class="cal-placar">${placar}</span>
        <span class="cal-adv">${m.isHome ? m.awayName : m.homeName}</span>
        <span class="cal-comp">${m.league}</span>
      </div>`;
    });
  });
  c.innerHTML = html;
}

function renderExportar() {
  const c = $('#hamContent');
  const prox = st.matches.filter(m => st.filter === 'todas' || m.championshipKey === st.filter).sort((a, b) => a.date - b.date);
  if (prox.length === 0) { c.innerHTML = '<div class="empty"><p>Nenhum jogo futuro.</p></div>'; return; }
  let texto = 'Proximos jogos do Corinthians:\n';
  prox.forEach(m => {
    texto += `${fmtD(m.date)} as ${fmtT(m.date)} - ${m.league} - ${m.homeName} x ${m.awayName} (${m.venue})\n`;
  });
  const encoded = encodeURIComponent(texto);
  c.innerHTML = `<p style="color:var(--gray-400);font-size:0.85rem;margin-bottom:12px">Copie o texto abaixo ou clique para copiar:</p>
    <pre class="export-box" id="exportText">${texto}</pre>
    <button class="btn" id="copyBtn" style="width:100%;margin-top:8px">Copiar</button>`;
  setTimeout(() => {
    const copyBtn = document.getElementById('copyBtn');
    const exportText = document.getElementById('exportText');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(texto).then(() => {
        toast('Texto copiado!');
      }).catch(() => {
        const range = document.createRange();
        range.selectNode(exportText);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        toast('Texto copiado!');
      });
    });
  }, 0);
}

function checkNotifs() {
  if (!st.notif || Notification.permission !== 'granted' || !st.matches) return;
  const now = Date.now();
  st.matches.forEach(m => {
    if (st.notified.has(m.id)) return;
    const diff = m.date.getTime() - now;
    if (diff <= 0) {
      if (diff >= -7200000) { // within 2h after start
        notificar('Corinthians - Jogo começou!', `${m.league}: ${m.isHome ? m.awayName : m.homeName} esta jogando agora!`, m.id);
      }
      st.notified.add(m.id); save(); return;
    }
    if (st.remind && diff <= 3600000 && diff > 0) {
      notificar('Corinthians - 1 hora!', `${m.league}: ${m.isHome ? m.awayName : m.homeName} - ${m.venue} as ${fmtT(m.date)}`, m.id);
      st.notified.add(m.id); save();
    }
    if (diff <= 86400000 && diff > 3600000) {
      notificar('Corinthians - Jogo amanha!', `${m.league}: ${m.isHome ? m.awayName : m.homeName} - ${fmtD(m.date)} as ${fmtT(m.date)}`, m.id);
      st.notified.add(m.id); save();
    }
  });
}

function init() {
  load();
  renderFiltros();
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
  $('#notifBtn').addEventListener('click', () => { $('#notifPanel').classList.toggle('show'); $('#notifOverlay').classList.toggle('show'); });
  $('#panelClose').addEventListener('click', () => { $('#notifPanel').classList.remove('show'); $('#notifOverlay').classList.remove('show'); });
  $('#notifOverlay').addEventListener('click', () => { $('#notifPanel').classList.remove('show'); $('#notifOverlay').classList.remove('show'); });
  $('#hamBtn').addEventListener('click', () => {
    $('#hamPanel').classList.toggle('show');
    $('#hamOverlay').classList.toggle('show');
    renderHamTab();
    // highlight active tab
    $('#hamTabs').querySelectorAll('.htab').forEach(b => b.classList.toggle('ativo', b.dataset.tab === st.hamTab));
  });
  $('#hamClose').addEventListener('click', () => { $('#hamPanel').classList.remove('show'); $('#hamOverlay').classList.remove('show'); });
  $('#hamOverlay').addEventListener('click', () => { $('#hamPanel').classList.remove('show'); $('#hamOverlay').classList.remove('show'); });
  // Tab switching
  document.addEventListener('click', e => {
    const tabBtn = e.target.closest('.htab');
    if (!tabBtn || !tabBtn.closest('#hamTabs')) return;
    st.hamTab = tabBtn.dataset.tab;
    $('#hamTabs').querySelectorAll('.htab').forEach(b => b.classList.toggle('ativo', b.dataset.tab === st.hamTab));
    renderHamTab();
  });

  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  buscarJogos();
  setInterval(buscarJogos, 60000);
  setInterval(aplicarFiltro, 60000);

  // Touch swipe gestures
  let tx = 0, touchPanel = false;
  document.addEventListener('touchstart', e => {
    tx = e.changedTouches[0].clientX;
    touchPanel = e.target.closest('.panel') !== null;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const startX = tx;
    if (dx > 80 && startX < 60) {
      // Swipe right from left edge → open hamburger
      if (!$('#hamPanel').classList.contains('show')) {
        $('#hamBtn').click();
      }
    } else if (dx < -80) {
      // Swipe left → close panels
      if ($('#hamPanel').classList.contains('show')) {
        $('#hamOverlay').click();
      }
      if ($('#notifPanel').classList.contains('show')) {
        $('#notifOverlay').click();
      }
    } else if (Math.abs(dx) < 20 && !touchPanel) {
      // Tap on right edge (panel peek area) → open hamburger
      const screenW = window.innerWidth;
      if (startX > screenW - 60 && !$('#hamPanel').classList.contains('show')) {
        $('#hamBtn').click();
      }
    }
  }, { passive: true });
}

async function registrarSW() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      return reg;
    } catch(e) { return null; }
  }
  return null;
}

let swReg = null;
registrarSW().then(r => swReg = r);

function renderMatchModal(m) {
  if (!m || !m.isLive) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const lineup = m.matchId && st.lineups[m.matchId];
  const scoreDisplay = (m.homeGoals !== null ? m.homeGoals : '?') + ' x ' + (m.awayGoals !== null ? m.awayGoals : '?');
  let html = `<div class="modal-box">
    <button class="modal-close" id="modalClose">&times;</button>
    <div class="modal-title">${m.league} &bull; Rodada ${m.round}</div>
    <div class="modal-teams">
      <div class="modal-team">${m.homeLogo ? `<img src="${m.homeLogo}" alt="">` : ''}<span class="nm">${m.homeName}</span></div>
      <div class="modal-score live">${scoreDisplay}</div>
      <div class="modal-team">${m.awayLogo ? `<img src="${m.awayLogo}" alt="">` : ''}<span class="nm">${m.awayName}</span></div>
    </div>
    <div class="modal-info">
      <div>${m.venue}</div>
      <div>${m.ch.join(' / ')}</div>
      <div class="live-dot" style="display:inline-block;vertical-align:middle;margin-top:6px"></div> AO VIVO
    </div>`;

  if (lineup) {
    html += `<div class="modal-lineup-title">Escalacao</div>`;
    lineup.forEach(team => {
      html += `<div class="modal-lineup-team"><strong>${team.team} (${team.acronym})</strong><div class="modal-lineup-grid">`;
      team.players.forEach(p => {
        html += `<span class="ej-num">${p.num}</span><span class="ej-nome">${p.name}</span><span class="ej-pos">${p.pos}</span>`;
      });
      html += `</div></div>`;
    });
  }

  html += `</div>`;
  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 300); };
  overlay.querySelector('#modalClose').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

function notificar(title, body, tag) {
  if (!st.notif || Notification.permission !== 'granted') return;
  if (swReg) swReg.active.postMessage({ type: 'notify', title, body, tag });
  else new Notification(title, { body, icon: 'logocorinthians.svg' });
}

document.addEventListener('DOMContentLoaded', init);
