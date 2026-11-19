const BRD = {
  'campeonato brasileiro serie a': ['Globo', 'Premiere', 'Sportv'],
  'campeonato brasileiro serie b': ['Sportv', 'Premiere'],
  'copa do brasil': ['Globo', 'Sportv', 'Prime Video'],
  'campeonato paulista': ['Record TV', 'CazéTV', 'MAX'],
  'copa libertadores': ['ESPN', 'Disney+', 'Globo'],
  'copa sudamericana': ['ESPN', 'Disney+'],
  'supercopa do brasil': ['Globo', 'Sportv'],
  'copa do mundo': ['Globo', 'Sportv'],
  'recopa': ['ESPN', 'Disney+'],
  'amistoso': ['YouTube'],
};

const COMP_KEYS = [
  { key: 'todas', label: 'Todas' },
  { key: 'brasileirao', label: 'Brasileirão' },
  { key: 'supercopa', label: 'Supercopa' },
  { key: 'libertadores', label: 'Libertadores' },
  { key: 'copabrasil', label: 'Copa do Brasil' },
  { key: 'paulista', label: 'Paulista' },
];

const ESPN_LEAGUES = [
  { slug: 'bra.1', key: 'brasileirao', name: 'Brasileirão Série A' },
  { slug: 'conmebol.libertadores', key: 'libertadores', name: 'Copa Libertadores' },
  { slug: 'bra.copa_do_brasil', key: 'copabrasil', name: 'Copa do Brasil' },
  { slug: 'bra.camp.paulista', key: 'paulista', name: 'Campeonato Paulista' },
];

const WEATHER_COORDS = {
  'Neo Química Arena': { lat: -23.5489, lon: -46.4774 },
  'Arena MRV': { lat: -19.9302, lon: -44.0138 },
  'Estádio Mangueirão': { lat: -1.3812, lon: -48.4442 },
  'Morumbi': { lat: -23.6000, lon: -46.7046 },
  'MorumBIS': { lat: -23.6000, lon: -46.7046 },
  'Maracanã': { lat: -22.9121, lon: -43.2302 },
  'Mineirão': { lat: -19.9209, lon: -43.9719 },
  'Beira-Rio': { lat: -30.0650, lon: -51.2428 },
  'default': { lat: -23.5489, lon: -46.4774 },
};

const WMO_CODES = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌧️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

const $ = s => document.querySelector(s);

let st = {
  notif: false,
  remind: true,
  matches: [],
  filtered: [],
  all: [],
  notified: new Set(),
  filter: 'todas',
  statusFilter: 'todos',
  local: '',
  search: '',
  standings: [],
  competitionsMeta: [],
  lineups: {},
  hamTab: 'classif',
  weather: null,
  apiLive: false,
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isCorinthians(name) {
  const n = norm(name);
  return n === 'corinthians' || n.includes('corinthians');
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem('ct') || '{}');
    st.notif = !!d.notif;
    st.remind = d.remind !== false;
    if (d.notified) st.notified = new Set(d.notified);
  } catch (e) {}
}

function save() {
  localStorage.setItem('ct', JSON.stringify({ notif: st.notif, remind: st.remind, notified: [...st.notified] }));
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 4000);
}

function sdot(cls, text) {
  $('#sdot').className = 'sdot ' + cls;
  $('#stxt').textContent = text;
}

function setApiBadge(liveOk) {
  const badge = $('#apiBadge');
  if (!badge) return;
  st.apiLive = liveOk;
  if (liveOk) {
    badge.textContent = 'API ESPN Ao Vivo + Base 2026';
    badge.classList.add('live-ok');
  } else {
    badge.textContent = 'Base Temporada 2026';
    badge.classList.remove('live-ok');
  }
}

async function fetchWeather(venue, matchDate) {
  try {
    const coords = WEATHER_COORDS[venue] || WEATHER_COORDS.default;
    const dateStr = matchDate.toISOString().split('T')[0];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,precipitation_probability,weathercode,windspeed_10m&timezone=America/Sao_Paulo&start_date=${dateStr}&end_date=${dateStr}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.hourly) return null;
    const hour = matchDate.getHours();
    const temps = data.hourly.temperature_2m || [];
    const prec = data.hourly.precipitation_probability || [];
    const codes = data.hourly.weathercode || [];
    const wind = data.hourly.windspeed_10m || [];
    return {
      temp: temps[hour] ?? temps[Math.min(hour, temps.length - 1)] ?? null,
      rain: prec[hour] ?? prec[Math.min(hour, prec.length - 1)] ?? 0,
      code: codes[hour] ?? codes[Math.min(hour, codes.length - 1)] ?? 0,
      wind: wind[hour] ?? wind[Math.min(hour, wind.length - 1)] ?? 0,
      icon: WMO_CODES[codes[hour]] || '🌤️',
    };
  } catch (e) {
    return null;
  }
}

function getBRD(nome) {
  if (!nome) return ['A definir'];
  const n = norm(nome);
  for (const [k, v] of Object.entries(BRD)) {
    if (n.includes(k)) return v;
  }
  return ['A definir'];
}

function fmtD(d) {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtT(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function fmtData(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function cdwn(d) {
  const diff = d - new Date();
  if (diff <= 0) {
    if (diff >= -7200000) return 'AO VIVO';
    return 'Jogo encerrado';
  }
  const days = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `Faltam <strong>${days}d ${h}h ${m}min</strong>`;
  if (h > 0) return `Falta <strong>${h}h ${m}min</strong>`;
  return `Falta <strong>${m}min</strong>`;
}

function toSaoPauloParts(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  parts.forEach(p => { map[p.type] = p.value; });
  const hour = map.hour === '24' ? '00' : map.hour;
  const date = `${map.year}-${map.month}-${map.day}`;
  const time = `${hour}:${map.minute}`;
  return { date, time, datetime: `${date}T${time}:00` };
}

function mapEspnComp(name, slug) {
  const s = norm(`${name || ''} ${slug || ''}`);
  if (s.includes('supercopa')) return { key: 'supercopa', name: 'Supercopa do Brasil' };
  if (s.includes('paulista')) return { key: 'paulista', name: 'Campeonato Paulista' };
  if (s.includes('copa do brasil') || s.includes('copa_do_brasil')) return { key: 'copabrasil', name: 'Copa do Brasil' };
  if (s.includes('libertadores')) return { key: 'libertadores', name: 'Copa Libertadores' };
  if (s.includes('sudamericana') || s.includes('sul americana')) return { key: 'sudamericana', name: 'Copa Sudamericana' };
  if (s.includes('brasileir') || s.includes('serie a') || s.includes('bra 1')) return { key: 'brasileirao', name: 'Brasileirão Série A' };
  return null;
}

function parseEspnScheduleEvents(events, fallbackComp) {
  if (!Array.isArray(events)) return [];
  const list = [];
  events.forEach((ev, idx) => {
    const compObj = ev.competitions?.[0];
    if (!compObj) return;
    const competitors = compObj.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
    const away = competitors.find(c => c.homeAway === 'away') || competitors[1];
    if (!home || !away) return;

    const hRaw = home.team?.shortDisplayName || home.team?.displayName || home.team?.name || '';
    const aRaw = away.team?.shortDisplayName || away.team?.displayName || away.team?.name || '';
    if (!isCorinthians(hRaw) && !isCorinthians(aRaw)) return;

    const homeTeam = isCorinthians(hRaw) ? 'Corinthians' : hRaw;
    const awayTeam = isCorinthians(aRaw) ? 'Corinthians' : aRaw;
    const leagueInfo = ev.league || ev.season?.type || {};
    const comp = mapEspnComp(`${leagueInfo.name || ''} ${leagueInfo.abbreviation || ''} ${ev.name || ''}`, leagueInfo.slug || fallbackComp?.slug) || fallbackComp;
    if (!comp) return;

    const dt = toSaoPauloParts(ev.date || compObj.date);
    if (!dt) return;

    const state = compObj.status?.type?.state || ev.status?.type?.state || 'pre';
    const completed = Boolean(compObj.status?.type?.completed || state === 'post');
    const isLive = state === 'in';
    const status = isLive ? 'live' : (completed ? 'finished' : 'scheduled');

    const getScore = v => {
      if (v === undefined || v === null || v === '') return null;
      const n = typeof v === 'object' ? Number(v.value ?? v.displayValue) : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const homeGoals = (completed || isLive) ? getScore(home.score) : null;
    const awayGoals = (completed || isLive) ? getScore(away.score) : null;
    const clock = compObj.status?.displayClock || '';
    const minM = clock.match(/(\d+)/);

    const isHome = homeTeam === 'Corinthians';
    const roundM = String(ev.week?.text || compObj.notes?.[0]?.headline || '').match(/(\d+)/);
    const round = ev.week?.number || (roundM ? parseInt(roundM[1], 10) : idx + 1);

    list.push({
      round,
      date: dt.date,
      time: dt.time,
      liveMinute: isLive && minM ? minM[1] : null,
      datetime: dt.datetime,
      homeTeam,
      homeAcronym: home.team?.abbreviation || (isHome ? 'COR' : ''),
      awayTeam,
      awayAcronym: away.team?.abbreviation || (!isHome ? 'COR' : ''),
      stadium: compObj.venue?.fullName || '',
      homeGoals,
      awayGoals,
      status,
      championship: comp.name,
      championshipKey: comp.key,
      stage: ev.seasonType?.name || compObj.notes?.[0]?.headline || `Rodada ${round}`,
      homeLogo: isHome ? 'logocorinthians.svg' : (home.team?.logos?.[0]?.href || home.team?.logo || ''),
      awayLogo: !isHome ? 'logocorinthians.svg' : (away.team?.logos?.[0]?.href || away.team?.logo || ''),
      matchId: String(ev.id || ''),
      isHome,
      opponent: isHome ? awayTeam : homeTeam,
      opponentAcronym: isHome ? (away.team?.abbreviation || '') : (home.team?.abbreviation || ''),
    });
  });
  return list;
}

async function fetchJsonSafe(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function fetchLiveEspnData() {
  const urls = [
    { url: 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/teams/874/schedule?lang=pt', comp: null },
    ...ESPN_LEAGUES.map(l => ({
      url: `https://site.api.espn.com/apis/site/v2/sports/soccer/${l.slug}/teams/874/schedule?lang=pt`,
      comp: { key: l.key, name: l.name, slug: l.slug },
    })),
  ];

  const [results, standingsJson] = await Promise.all([
    Promise.all(urls.map(u => fetchJsonSafe(u.url))),
    fetchJsonSafe('https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/standings?lang=pt'),
  ]);

  const events = [];
  let responded = false;

  results.forEach((json, idx) => {
    if (json && Array.isArray(json.events)) {
      responded = true;
      events.push(...parseEspnScheduleEvents(json.events, urls[idx].comp));
    }
  });

  let liveBrasileiraoStandings = null;
  const entries = standingsJson?.children?.[0]?.standings?.entries || standingsJson?.standings?.entries;
  if (Array.isArray(entries) && entries.length > 0) {
    responded = true;
    liveBrasileiraoStandings = entries.map((entry, idx) => {
      const name = entry.team?.shortDisplayName || entry.team?.displayName || entry.team?.name || '';
      const sm = {};
      (entry.stats || []).forEach(s => { sm[s.name] = s.value; });
      const pos = Math.round(sm.rank || idx + 1);
      const games = Math.round(sm.gamesPlayed || 0);
      const points = Math.round(sm.points || 0);
      let zone = 0;
      if (pos <= 4) zone = 1;
      else if (pos <= 6) zone = 2;
      else if (pos <= 12) zone = 3;
      else if (pos >= 17) zone = 4;
      return {
        pos,
        name: isCorinthians(name) ? 'Corinthians' : name,
        shield: isCorinthians(name) ? 'logocorinthians.svg' : (entry.team?.logos?.[0]?.href || ''),
        points,
        games,
        wins: Math.round(sm.wins || 0),
        draws: Math.round(sm.ties || 0),
        losses: Math.round(sm.losses || 0),
        goalsFor: Math.round(sm.pointsFor || 0),
        goalsAgainst: Math.round(sm.pointsAgainst || 0),
        goalDiff: Math.round(sm.pointDifferential || 0),
        pct: games > 0 ? Math.round((points / (games * 3)) * 100) : 0,
        zone,
        movement: '',
      };
    }).sort((a, b) => a.pos - b.pos);
  }

  return { responded, events, liveBrasileiraoStandings };
}

function mergeMatchLists(baseList, liveList) {
  const map = new Map();
  const byRoundOpp = new Map();

  const keyOf = m => `${m.championshipKey}|${m.date}|${m.isHome ? 'H' : 'A'}|${norm(m.opponent)}`;

  baseList.forEach(m => {
    const k = keyOf(m);
    map.set(k, { ...m });
    if (m.round) byRoundOpp.set(`${m.championshipKey}|R${m.round}|${norm(m.opponent)}`, k);
  });

  const statusRank = s => (s === 'live' ? 3 : s === 'finished' ? 2 : 1);

  liveList.forEach(inc => {
    let k = keyOf(inc);
    if (!map.has(k) && inc.round) {
      const alt = byRoundOpp.get(`${inc.championshipKey}|R${inc.round}|${norm(inc.opponent)}`);
      if (alt && map.has(alt)) k = alt;
    }
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...inc });
      return;
    }
    const merged = { ...existing };
    if (statusRank(inc.status) >= statusRank(existing.status)) {
      merged.status = inc.status;
      if (inc.homeGoals !== null && inc.homeGoals !== undefined) merged.homeGoals = inc.homeGoals;
      if (inc.awayGoals !== null && inc.awayGoals !== undefined) merged.awayGoals = inc.awayGoals;
      if (inc.liveMinute) merged.liveMinute = inc.liveMinute;
    }
    if (inc.time && existing.status === 'scheduled') {
      merged.time = inc.time;
      merged.datetime = inc.datetime;
    }
    if (!merged.stadium && inc.stadium) merged.stadium = inc.stadium;
    if (!merged.homeLogo && inc.homeLogo) merged.homeLogo = inc.homeLogo;
    if (!merged.awayLogo && inc.awayLogo) merged.awayLogo = inc.awayLogo;
    map.set(k, merged);
  });

  return [...map.values()];
}

function renderShieldHtml(logo, name, acronym) {
  const abbr = esc((acronym || name || '?').slice(0, 3).toUpperCase());
  if (logo) {
    return `<img class="bd" src="${esc(logo)}" alt="${esc(name)}" onerror="this.outerHTML='<div class=&quot;bd-fallback&quot;>${abbr}</div>'">`;
  }
  return `<div class="bd-fallback">${abbr}</div>`;
}

function renderFiltros() {
  const c = $('#filtros');
  const keys = [...COMP_KEYS];
  if (st.all.some(m => m.championshipKey === 'sudamericana') && !keys.some(k => k.key === 'sudamericana')) {
    keys.push({ key: 'sudamericana', label: 'Sul-Americana' });
  }
  c.innerHTML = keys.map(f =>
    `<button class="fbtn${st.filter === f.key ? ' ativo' : ''}" data-key="${f.key}">${f.label}</button>`
  ).join('');

  c.querySelectorAll('.fbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      st.filter = btn.dataset.key;
      renderFiltros();
      renderCompOverview();
      aplicarFiltro();
    });
  });

  renderStatusPills();
}

function renderStatusPills() {
  const p = $('#statusPills');
  if (!p) return;
  const counts = getBaseListForFilter();
  const totalCount = counts.length;
  const proxCount = counts.filter(m => m.status === 'scheduled' || m.isLive).length;
  const encCount = counts.filter(m => m.status !== 'scheduled' && !m.isLive).length;

  p.innerHTML = `
    <button class="fbtn fsmall${st.statusFilter === 'todos' ? ' ativo' : ''}" data-status="todos">Todos (${totalCount})</button>
    <button class="fbtn fsmall${st.statusFilter === 'proximos' ? ' ativo' : ''}" data-status="proximos">Próximos (${proxCount})</button>
    <button class="fbtn fsmall${st.statusFilter === 'encerrados' ? ' ativo' : ''}" data-status="encerrados">Encerrados (${encCount})</button>
    <span class="fsep"></span>
    <button class="fbtn fsmall${st.local === 'casa' ? ' ativo' : ''}" data-local="casa">Casa</button>
    <button class="fbtn fsmall${st.local === 'fora' ? ' ativo' : ''}" data-local="fora">Fora</button>`;

  p.querySelectorAll('.fbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.status) {
        st.statusFilter = btn.dataset.status;
      } else if (btn.dataset.local) {
        st.local = st.local === btn.dataset.local ? '' : btn.dataset.local;
      }
      renderStatusPills();
      aplicarFiltro();
    });
  });
}

function getBaseListForFilter() {
  let lista = st.filter === 'todas' ? st.all : st.all.filter(m => m.championshipKey === st.filter);
  if (st.local === 'casa') lista = lista.filter(m => m.isHome);
  else if (st.local === 'fora') lista = lista.filter(m => !m.isHome);
  if (st.search) {
    const q = norm(st.search);
    lista = lista.filter(m =>
      norm(m.opponent).includes(q) ||
      norm(m.venue).includes(q) ||
      norm(m.league).includes(q) ||
      norm(m.stage).includes(q)
    );
  }
  return lista;
}

function aplicarFiltro() {
  const now = new Date();
  const base = getBaseListForFilter();
  st.filtered = base
    .filter(m => m.status === 'scheduled' || m.isLive || (m.date >= now && m.status !== 'finished'))
    .sort((a, b) => a.date - b.date);
  renderStatusPills();
  render();
}

function calcResumo(jogos) {
  const r = { vitorias: 0, empates: 0, derrotas: 0, golsPro: 0, golsContra: 0, jogos: 0, pct: 0 };
  jogos.forEach(m => {
    if (m.status === 'scheduled' || m.isLive) return;
    r.jogos++;
    if (m.homeGoals !== null && m.awayGoals !== null) {
      if (m.isHome) { r.golsPro += m.homeGoals; r.golsContra += m.awayGoals; }
      else { r.golsPro += m.awayGoals; r.golsContra += m.homeGoals; }
    }
    if (m.resultado === 'V') r.vitorias++;
    else if (m.resultado === 'E') r.empates++;
    else if (m.resultado === 'D') r.derrotas++;
  });
  r.pct = r.jogos > 0 ? Math.round(((r.vitorias * 3 + r.empates) / (r.jogos * 3)) * 100) : 0;
  return r;
}

function renderCompOverview() {
  const el = $('#compOverview');
  if (!el) return;
  const metas = st.competitionsMeta.length ? st.competitionsMeta : [
    { key: 'brasileirao', shortName: 'Brasileirão', status: 'Em Disputa', statusType: 'active' },
    { key: 'supercopa', shortName: 'Supercopa', status: 'Campeão 🏆', statusType: 'champion' },
    { key: 'libertadores', shortName: 'Libertadores', status: 'Quartas de Final', statusType: 'eliminated' },
    { key: 'copabrasil', shortName: 'Copa do Brasil', status: 'Oitavas de Final', statusType: 'eliminated' },
    { key: 'paulista', shortName: 'Paulistão', status: 'Semifinal', statusType: 'eliminated' },
  ];

  let html = `<div class="section-title" style="margin-top:0">Competições do Timão (2026)</div><div class="comp-grid">`;
  metas.forEach(meta => {
    const games = st.all.filter(m => m.championshipKey === meta.key);
    const done = games.filter(m => m.status !== 'scheduled' && !m.isLive);
    const res = calcResumo(done);
    const isSelected = st.filter === meta.key;
    const typeClass = meta.statusType === 'champion' ? 'is-champion' : meta.statusType === 'active' ? 'is-active' : '';
    const statusClass = meta.statusType || 'eliminated';
    html += `<button class="comp-card ${typeClass}${isSelected ? ' selected' : ''}" data-comp="${esc(meta.key)}" title="${esc(meta.phase || meta.name)}">
      <div class="comp-card-top">
        <span class="comp-card-name">${esc(meta.shortName || meta.name)}</span>
        <span class="comp-status ${esc(statusClass)}">${esc(meta.status)}</span>
      </div>
      <div class="comp-record">
        <span>${res.jogos}J &bull; ${res.vitorias}V ${res.empates}E ${res.derrotas}D</span>
        <strong>${res.pct}%</strong>
      </div>
      <div class="comp-bar"><span style="width:${res.pct}%"></span></div>
    </button>`;
  });
  html += `</div>`;
  el.innerHTML = html;

  el.querySelectorAll('.comp-card').forEach(card => {
    card.addEventListener('click', () => {
      const k = card.dataset.comp;
      st.filter = st.filter === k ? 'todas' : k;
      renderFiltros();
      renderCompOverview();
      aplicarFiltro();
    });
  });
}

async function buscarJogos() {
  sdot('yellow', 'Atualizando...');
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
    </div>`;

  try {
    const [r, espn] = await Promise.all([
      fetch('matches.json?' + Date.now()),
      fetchLiveEspnData(),
    ]);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();

    setApiBadge(espn.responded);

    if (data.lastUpdated) {
      const iso = data.lastUpdated.endsWith('Z') ? data.lastUpdated : data.lastUpdated + 'Z';
      const parsedUpd = new Date(iso);
      $('#lastUpd').textContent = Number.isNaN(parsedUpd.getTime())
        ? '--'
        : parsedUpd.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } else {
      $('#lastUpd').textContent = '--';
    }

    const mergedRaw = mergeMatchLists(data.corinthiansMatches || [], espn.events || []);

    if (mergedRaw.length === 0) {
      $('#matches').innerHTML = '<div class="empty"><p>Nenhum jogo do Corinthians encontrado.</p></div>';
      sdot('gray', 'Nenhum jogo');
      return;
    }

    const now = new Date();
    st.all = mergedRaw.map(m => {
      const dtStr = m.datetime && (m.datetime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(m.datetime))
        ? m.datetime
        : (m.datetime || `${m.date}T00:00:00`) + '-03:00';
      const d = new Date(dtStr);
      let resultado = '';
      let isLive = false;
      const diff = d - now;

      if (m.status === 'live') {
        isLive = true;
      } else if (m.status === 'scheduled' && m.homeGoals !== null && m.awayGoals !== null) {
        isLive = diff <= 0 && diff >= -7200000;
      }

      if (m.status === 'finished' && m.homeGoals !== null && m.awayGoals !== null) {
        if (m.isHome) resultado = m.homeGoals > m.awayGoals ? 'V' : m.homeGoals < m.awayGoals ? 'D' : 'E';
        else resultado = m.awayGoals > m.homeGoals ? 'V' : m.awayGoals < m.homeGoals ? 'D' : 'E';
      }

      return {
        id: `${m.championshipKey}-${m.date}-${m.round}-${m.homeTeam}-${m.awayTeam}`,
        date: d,
        rawDate: m.date,
        homeName: m.homeTeam,
        homeLogo: isCorinthians(m.homeTeam) ? 'logocorinthians.svg' : (m.homeLogo || ''),
        homeAcronym: m.homeAcronym || '',
        awayName: m.awayTeam,
        awayLogo: isCorinthians(m.awayTeam) ? 'logocorinthians.svg' : (m.awayLogo || ''),
        awayAcronym: m.awayAcronym || '',
        venue: m.stadium || 'Local a definir',
        league: m.championship,
        championshipKey: m.championshipKey,
        stage: m.stage || `Rodada ${m.round}`,
        penalties: m.penalties || '',
        notes: m.notes || '',
        ch: getBRD(m.championship),
        isHome: m.isHome,
        opponent: m.opponent,
        opponentAcronym: m.opponentAcronym || '',
        round: m.round,
        matchId: m.matchId || '',
        liveMinute: m.liveMinute || (isLive ? Math.min(Math.floor(-diff / 60000), 120) : null),
        status: m.status,
        resultado,
        isLive,
        homeGoals: m.homeGoals,
        awayGoals: m.awayGoals,
      };
    }).sort((a, b) => a.date - b.date);

    st.matches = st.all.filter(m => m.status === 'scheduled' || m.isLive).sort((a, b) => a.date - b.date);
    st.competitionsMeta = data.competitionsMeta || [];
    st.standings = data.standings || [];
    if (espn.liveBrasileiraoStandings && espn.liveBrasileiraoStandings.length > 0) {
      const idx = st.standings.findIndex(s => s.championshipKey === 'brasileirao');
      const liveTable = { championship: 'Brasileirão Série A', championshipKey: 'brasileirao', teams: espn.liveBrasileiraoStandings };
      if (idx >= 0) st.standings[idx] = liveTable;
      else st.standings.unshift(liveTable);
    }
    st.lineups = data.lineups || {};

    const proximo = st.matches.find(m => !m.isLive);
    if (proximo && proximo.venue && proximo.venue !== 'Local a definir') {
      st.weather = await fetchWeather(proximo.venue, proximo.date);
    } else {
      st.weather = null;
    }

    renderFiltros();
    renderCompOverview();
    aplicarFiltro();

    const liveCount = st.all.filter(m => m.isLive).length;
    if (liveCount > 0) {
      sdot('red', `${liveCount} jogo ao vivo agora`);
    } else {
      const totalDone = st.all.filter(m => m.status === 'finished').length;
      sdot(st.matches.length > 0 ? 'green' : 'gray',
        `${st.all.length} jogos na temporada (${totalDone} encerrados, ${st.matches.length} restantes)`);
    }
  } catch (err) {
    $('#matches').innerHTML = `<div class="empty"><p style="color:#ef4444">Erro ao carregar jogos: ${esc(err.message)}</p></div>`;
    sdot('red', 'Erro');
  }
}

function renderMatchCardHtml(m, isHighlight = false) {
  const isFinished = m.status === 'finished' && !m.isLive;
  const resClass = isFinished ? (m.resultado === 'V' ? 'res-v' : m.resultado === 'E' ? 'res-e' : 'res-d') : '';
  const resText = m.resultado === 'V' ? 'Vitória' : m.resultado === 'E' ? 'Empate' : m.resultado === 'D' ? 'Derrota' : '';
  const homeIsCor = isCorinthians(m.homeName);
  const awayIsCor = isCorinthians(m.awayName);
  const isChampionNote = m.notes && m.notes.toLowerCase().includes('campeão');

  const centerBlock = (m.isLive || isFinished)
    ? `<div class="score-box"><span>${m.homeGoals !== null ? m.homeGoals : '-'}</span><span class="score-x">x</span><span>${m.awayGoals !== null ? m.awayGoals : '-'}</span></div>`
    : `<div class="vs">VS</div>`;

  const topRightBadge = m.isLive
    ? `<span class="res-badge d"><span class="live-dot" style="width:7px;height:7px;margin-right:4px"></span>AO VIVO</span>`
    : isFinished
      ? `<span class="res-badge ${m.resultado.toLowerCase()}">${resText}</span>`
      : `<span class="res-badge sched">${isHighlight ? 'Próximo Jogo' : 'Agendado'}</span>`;

  return `<article class="card${isHighlight ? ' card-destaque' : ''}${m.isLive ? ' card-live' : ''}${isFinished ? ' card-finished ' + resClass : ''}" data-match-id="${esc(m.id)}">
    <div class="card-top">
      <div class="cd">${fmtD(m.date)} &bull; ${fmtT(m.date)}</div>
      ${topRightBadge}
    </div>
    <div class="ccomp">${esc(m.league)} &bull; ${esc(m.stage)}</div>
    <div class="ct">
      <div class="tc">
        ${renderShieldHtml(m.homeLogo, m.homeName, m.homeAcronym)}
        <span class="nm ${homeIsCor ? 'cor-team' : 'opp-team'}">${esc(m.homeName)}</span>
      </div>
      ${centerBlock}
      <div class="tc">
        ${renderShieldHtml(m.awayLogo, m.awayName, m.awayAcronym)}
        <span class="nm ${awayIsCor ? 'cor-team' : 'opp-team'}">${esc(m.awayName)}</span>
      </div>
    </div>
    <div class="destaque-info">
      <div class="di-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${esc(m.venue)} <span class="habadge ${m.isHome ? 'h' : 'a'}">${m.isHome ? 'casa' : 'fora'}</span>
      </div>
      <div class="di-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        ${esc(m.ch.join(' / '))}
      </div>
      ${isHighlight && st.weather ? `<div class="di-item weather-chip">${st.weather.icon} ${st.weather.temp !== null ? Math.round(st.weather.temp) + '°C' : '--'} &bull; Chuva: ${st.weather.rain}% &bull; Vento: ${Math.round(st.weather.wind)}km/h</div>` : ''}
    </div>
    ${m.penalties ? `<div class="match-notes">⚽ ${esc(m.penalties)}</div>` : ''}
    ${m.notes ? `<div class="match-notes${isChampionNote ? ' champion-note' : ''}">${isChampionNote ? '🏆 ' : ''}${esc(m.notes)}</div>` : ''}
    ${!isFinished ? `<div class="cdwn${isHighlight ? ' cdwn-grande' : ''}">${m.isLive ? `<span class="live-dot"></span> AO VIVO${m.liveMinute ? ` <span class="live-minuto">${esc(m.liveMinute)}'</span>` : ''}` : cdwn(m.date)}</div>` : ''}
  </article>`;
}

function render() {
  const c = $('#matches');
  const base = getBaseListForFilter();
  const filtrados = st.filtered;
  const encerrados = base
    .filter(m => m.status === 'finished' && !m.isLive)
    .sort((a, b) => b.date - a.date);

  let html = '';

  // Selected Competition Banner
  if (st.filter !== 'todas') {
    const meta = st.competitionsMeta.find(cm => cm.key === st.filter);
    if (meta) {
      html += `<div class="comp-banner ${esc(meta.statusType || '')}">
        <div>
          <div class="comp-banner-title">${esc(meta.name)} &mdash; ${esc(meta.status)}</div>
          <div class="comp-banner-sub">${esc(meta.phase || '')}${meta.summary ? ' &bull; ' + esc(meta.summary) : ''}</div>
        </div>
        <span class="comp-status ${esc(meta.statusType || 'eliminated')}">${esc(meta.status)}</span>
      </div>`;
    }
  }

  // Highlight Live / Next Match (when viewing todos or proximos)
  const liveMatch = filtrados.find(m => m.isLive);
  if (liveMatch && st.statusFilter !== 'encerrados') {
    html += `<div class="live-banner card card-destaque card-live" id="liveBanner" data-match-id="${esc(liveMatch.id)}">
      <div class="ct">
        <div class="tc">${renderShieldHtml(liveMatch.homeLogo, liveMatch.homeName, liveMatch.homeAcronym)}<span class="nm cor-team">${esc(liveMatch.homeName)}</span><span class="ls-num">${liveMatch.homeGoals !== null ? liveMatch.homeGoals : '?'}</span></div>
        <span class="ls-dot"></span>
        <div class="tc"><span class="ls-num">${liveMatch.awayGoals !== null ? liveMatch.awayGoals : '?'}</span><span class="nm opp-team">${esc(liveMatch.awayName)}</span>${renderShieldHtml(liveMatch.awayLogo, liveMatch.awayName, liveMatch.awayAcronym)}</div>
      </div>
      <div class="destaque-info">
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(liveMatch.venue)} <span class="habadge ${liveMatch.isHome ? 'h' : 'a'}">${liveMatch.isHome ? 'casa' : 'fora'}</span></div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>${esc(liveMatch.league)} &bull; ${esc(liveMatch.stage)}</div>
        <div class="di-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>${esc(liveMatch.ch.join(' / '))}</div>
      </div>
      <div class="cdwn cdwn-grande"><span class="live-dot"></span> AO VIVO${liveMatch.liveMinute ? ` <span class="live-minuto">${esc(liveMatch.liveMinute)}'</span>` : ''}</div>
    </div>`;
  } else if (filtrados.length > 0 && st.statusFilter !== 'encerrados') {
    html += renderMatchCardHtml(filtrados[0], true);
  }

  // Statistical summary for current selection
  if (encerrados.length > 0) {
    const resumo = calcResumo(encerrados);
    const wV = resumo.jogos ? (resumo.vitorias / resumo.jogos) * 100 : 0;
    const wE = resumo.jogos ? (resumo.empates / resumo.jogos) * 100 : 0;
    const wD = resumo.jogos ? (resumo.derrotas / resumo.jogos) * 100 : 0;
    html += `<div class="resumo">
      <div class="r-item"><span class="r-num">${resumo.jogos}</span><span class="r-lab">Jogos</span></div>
      <div class="r-item r-v"><span class="r-num">${resumo.vitorias}</span><span class="r-lab">V</span></div>
      <div class="r-item r-e"><span class="r-num">${resumo.empates}</span><span class="r-lab">E</span></div>
      <div class="r-item r-d"><span class="r-num">${resumo.derrotas}</span><span class="r-lab">D</span></div>
      <div class="r-item"><span class="r-num">${resumo.golsPro}</span><span class="r-lab">GP</span></div>
      <div class="r-item"><span class="r-num">${resumo.golsContra}</span><span class="r-lab">GC</span></div>
      <div class="r-item"><span class="r-num">${resumo.pct}%</span><span class="r-lab">Aprov.</span></div>
    </div>
    <div class="aprov-bar" title="${resumo.vitorias}V ${resumo.empates}E ${resumo.derrotas}D">
      <span class="aprov-v" style="width:${wV}%"></span>
      <span class="aprov-e" style="width:${wE}%"></span>
      <span class="aprov-d" style="width:${wD}%"></span>
    </div>`;
  }

  // Últimos resultados quick strip (when showing todos)
  if (encerrados.length > 0 && st.statusFilter === 'todos') {
    const ultimos = encerrados.slice(0, 6);
    html += `<div class="section-title">Últimos Resultados</div><div class="ultimos">`;
    ultimos.forEach(m => {
      const cls = m.resultado === 'V' ? 'r-v' : m.resultado === 'E' ? 'r-e' : 'r-d';
      html += `<div class="ult-card ${cls}" data-match-id="${esc(m.id)}">
        <span class="u-data">${fmtData(m.date)}</span>
        <span class="u-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
        <span class="u-adv">${esc(m.opponent)}</span>
        <span class="u-comp">${esc(m.league)}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Próximos Jogos list
  if (st.statusFilter !== 'encerrados') {
    const futuros = filtrados.filter(m => !m.isLive);
    if (futuros.length > 0) {
      html += `<div class="section-title">Próximos Jogos (${futuros.length})</div>`;
      html += futuros.map(m => renderMatchCardHtml(m, false)).join('');
    }
  }

  // Jogos Encerrados list (Full Tracker History on Main Screen)
  if (st.statusFilter !== 'proximos' && encerrados.length > 0) {
    html += `<div class="section-title">Jogos Realizados (${encerrados.length})</div>`;
    html += encerrados.map(m => renderMatchCardHtml(m, false)).join('');
  }

  if (!html) {
    html = '<div class="empty"><p>Nenhum jogo encontrado para este filtro.</p></div>';
  }

  c.innerHTML = html;

  // Bind click on any match card or strip card → open universal match detail modal
  c.querySelectorAll('[data-match-id]').forEach(cardEl => {
    cardEl.addEventListener('click', () => {
      const match = st.all.find(x => x.id === cardEl.dataset.matchId);
      if (match) renderMatchModal(match);
    });
  });

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
  const isKnockout = st.filter === 'copabrasil' || st.filter === 'paulista' || st.filter === 'supercopa';

  if (tabelas.length === 0 && !isKnockout) {
    c.innerHTML = '<div class="empty"><p>Classificação indisponível para esta competição.</p></div>';
    return;
  }

  if (isKnockout) {
    const compNames = { copabrasil: 'Copa do Brasil', paulista: 'Campeonato Paulista', supercopa: 'Supercopa do Brasil' };
    const compName = compNames[st.filter] || st.filter;
    const meta = st.competitionsMeta.find(cm => cm.key === st.filter);
    const jogos = st.all.filter(m => m.championshipKey === st.filter && m.status === 'finished').sort((a, b) => a.date - b.date);

    if (jogos.length === 0) {
      c.innerHTML = `<div class="empty"><p>Nenhum jogo realizado na ${esc(compName)}.</p></div>`;
      return;
    }

    const res = calcResumo(jogos);
    let html = `<div class="section-title" style="margin-top:0">${esc(compName)}${meta ? ' &bull; ' + esc(meta.status) : ''}</div>
      <div class="resumo" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-bottom:16px">
        <div class="r-item"><span class="r-num">${res.jogos}</span><span class="r-lab">Jogos</span></div>
        <div class="r-item r-v"><span class="r-num">${res.vitorias}</span><span class="r-lab">V</span></div>
        <div class="r-item r-e"><span class="r-num">${res.empates}</span><span class="r-lab">E</span></div>
        <div class="r-item r-d"><span class="r-num">${res.derrotas}</span><span class="r-lab">D</span></div>
        <div class="r-item"><span class="r-num">${res.golsPro}</span><span class="r-lab">GP</span></div>
        <div class="r-item"><span class="r-num">${res.golsContra}</span><span class="r-lab">GC</span></div>
      </div>`;

    [...jogos].reverse().forEach(m => {
      const cls = m.resultado === 'V' ? 'r-v' : m.resultado === 'E' ? 'r-e' : 'r-d';
      html += `<div class="historico-item ${cls}">
        <span class="h-data">${fmtData(m.date)}</span>
        <span class="h-comp">${esc(m.stage)}</span>
        <span class="h-adv">${esc(m.opponent)}</span>
        <span class="h-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
      </div>`;
    });
    c.innerHTML = html;
    return;
  }

  let html = '';
  tabelas.forEach(tab => {
    html += `<div class="section-title" style="margin-top:4px">${esc(tab.championship)}</div>`;
    if (tab.championshipKey === 'brasileirao') {
      html += `<div class="st-legenda">
        <span class="st-leg z1">Libertadores</span>
        <span class="st-leg z2">Pré-Lib</span>
        <span class="st-leg z3">Sul-Americana</span>
        <span class="st-leg z4">Rebaixamento</span>
      </div>`;
    }
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
      const isCor = isCorinthians(t.name) ? ' st-cor' : '';
      let movHtml = '';
      if (t.movement) {
        const isUp = t.movement.startsWith('S');
        movHtml = `<span class="st-mov ${isUp ? 'st-up' : 'st-down'}">${isUp ? '▲' : '▼'}</span>`;
      }
      const gp = t.goalsFor !== null && t.goalsFor !== undefined ? t.goalsFor : '--';
      const gc = t.goalsAgainst !== null && t.goalsAgainst !== undefined ? t.goalsAgainst : '--';
      const sg = t.goalDiff !== null && t.goalDiff !== undefined ? `${t.goalDiff > 0 ? '+' : ''}${t.goalDiff}` : '--';
      const shieldSrc = isCorinthians(t.name) ? 'logocorinthians.svg' : t.shield;
      html += `<tr class="${zClass}${isCor}">
        <td class="st-pos">${movHtml}<span class="st-pos-num">${t.pos}</span></td>
        <td class="st-team">${shieldSrc ? `<img class="st-shield" src="${esc(shieldSrc)}" alt="">` : ''}${esc(t.name)}</td>
        <td class="st-num st-pontos">${t.points}</td>
        <td class="st-num">${t.games}</td>
        <td class="st-num">${t.wins}</td>
        <td class="st-num">${t.draws}</td>
        <td class="st-num">${t.losses}</td>
        <td class="st-num">${gp}</td>
        <td class="st-num">${gc}</td>
        <td class="st-num">${sg}</td>
        <td class="st-num">${t.pct}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  });
  c.innerHTML = html;
}

function renderEscalacao() {
  const c = $('#hamContent');
  const filtered = m => st.filter === 'todas' || m.championshipKey === st.filter;
  const comEscalacao = st.all.filter(m => filtered(m) && m.status !== 'scheduled' && !m.isLive && m.matchId && st.lineups[m.matchId]).sort((a, b) => b.date - a.date);
  const proximos = st.all.filter(m => filtered(m) && (m.status === 'scheduled' || m.isLive)).sort((a, b) => a.date - b.date);

  let html = '';
  if (comEscalacao.length === 0 && proximos.length === 0) {
    c.innerHTML = '<div class="empty"><p>Nenhuma escalação disponível.</p></div>';
    return;
  }

  if (comEscalacao.length > 0) {
    html += `<p style="font-size:0.85rem;color:var(--gray-300);margin-bottom:12px">Clique em um jogo para ver a escalação:</p>`;
    comEscalacao.forEach((m, idx) => {
      const isFirst = idx === 0;
      html += `<div class="escala-item" data-idx="${idx}">
        <span class="escala-data">${fmtData(m.date)}</span>
        <span class="escala-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
        <span class="escala-adv">${esc(m.opponent)}</span>
        <span class="escala-comp">${esc(m.league)}</span>
        <span class="escala-toggle ${isFirst ? 'aberto' : ''}">${isFirst ? '▲' : '▼'}</span>
      </div>`;
      const lineup = st.lineups[m.matchId];
      html += `<div class="escala-detalhe" id="escala-det-${idx}" style="display:${isFirst ? 'block' : 'none'}">`;
      lineup.forEach(team => {
        html += `<div class="escala-time">
          <div class="escala-time-nome">${esc(team.team)} (${esc(team.acronym)})</div>
          <div class="escala-jogadores">`;
        team.players.forEach(p => {
          html += `<div class="escala-jogador">
            <span class="ej-num">${esc(p.num)}</span>
            <span class="ej-nome">${esc(p.name)}</span>
            <span class="ej-pos">${esc(p.pos)}</span>
          </div>`;
        });
        html += `</div></div>`;
      });
      html += `</div>`;
    });
  }

  if (proximos.length > 0) {
    html += `<p style="font-size:0.85rem;color:var(--gray-300);margin:16px 0 8px">Próximos jogos (escalação sai ~1h antes):</p>`;
    proximos.forEach(m => {
      html += `<div class="escala-item" style="cursor:default;opacity:0.7">
        <span class="escala-data">${fmtData(m.date)}</span>
        <span class="escala-placar" style="color:var(--gray-400)">--</span>
        <span class="escala-adv">${esc(m.opponent)}</span>
        <span class="escala-comp">${esc(m.league)}</span>
        <span class="escala-toggle" style="color:var(--gray-400);font-size:0.7rem">⏳</span>
      </div>`;
    });
  }

  c.innerHTML = html;

  c.querySelectorAll('.escala-item[data-idx]').forEach(item => {
    item.addEventListener('click', () => {
      const det = document.getElementById(`escala-det-${item.dataset.idx}`);
      if (!det) return;
      const isOpen = det.style.display !== 'none';
      det.style.display = isOpen ? 'none' : 'block';
      item.querySelector('.escala-toggle').textContent = isOpen ? '▼' : '▲';
      item.querySelector('.escala-toggle').classList.toggle('aberto', !isOpen);
    });
  });
}

function renderHistorico() {
  const c = $('#hamContent');
  const filtered = m => st.filter === 'todas' || m.championshipKey === st.filter;
  const jogos = st.all.filter(m => filtered(m) && m.status === 'finished').sort((a, b) => b.date - a.date);
  if (jogos.length === 0) { c.innerHTML = '<div class="empty"><p>Nenhum jogo realizado.</p></div>'; return; }
  const label = st.filter === 'todas' ? 'Todos os jogos do Corinthians em 2026' : `Jogos - ${COMP_KEYS.find(k => k.key === st.filter)?.label || st.filter}`;
  let html = `<p style="font-size:0.84rem;color:var(--gray-300);margin-bottom:10px">${esc(label)} (${jogos.length}):</p>`;
  jogos.forEach(m => {
    const cls = m.resultado === 'V' ? 'r-v' : m.resultado === 'E' ? 'r-e' : m.resultado === 'D' ? 'r-d' : '';
    html += `<div class="historico-item ${cls}">
      <span class="h-data">${fmtData(m.date)}</span>
      <span class="h-comp">${esc(m.league)}</span>
      <span class="h-adv">${esc(m.opponent)}</span>
      <span class="h-placar">${m.isHome ? m.homeGoals : m.awayGoals} x ${m.isHome ? m.awayGoals : m.homeGoals}</span>
    </div>`;
  });
  c.innerHTML = html;
}

function renderAproveitamento() {
  const c = $('#hamContent');
  const filtered = m => st.filter === 'todas' || m.championshipKey === st.filter;
  const comps = {};
  st.all.filter(m => filtered(m) && m.status === 'finished').forEach(m => {
    if (!comps[m.league]) comps[m.league] = { j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 };
    const r = comps[m.league];
    r.j++;
    if (m.isHome) { r.gp += m.homeGoals || 0; r.gc += m.awayGoals || 0; }
    else { r.gp += m.awayGoals || 0; r.gc += m.homeGoals || 0; }
    if (m.resultado === 'V') r.v++;
    else if (m.resultado === 'E') r.e++;
    else if (m.resultado === 'D') r.d++;
  });
  if (Object.keys(comps).length === 0) { c.innerHTML = '<div class="empty"><p>Sem dados.</p></div>'; return; }
  let html = `<div class="standings"><table class="st-table">
    <thead><tr><th>Competição</th><th class="st-num">J</th><th class="st-num">V</th><th class="st-num">E</th><th class="st-num">D</th><th class="st-num">GP</th><th class="st-num">GC</th><th class="st-num">SG</th><th class="st-num">%</th></tr></thead><tbody>`;
  Object.entries(comps).forEach(([nome, r]) => {
    const pct = r.j > 0 ? Math.round(((r.v * 3 + r.e) / (r.j * 3)) * 100) : 0;
    html += `<tr><td class="st-team">${esc(nome)}</td>
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
  const filtered = m => st.filter === 'todas' || m.championshipKey === st.filter;
  const ultimos = st.all.filter(m => filtered(m) && m.status === 'finished').sort((a, b) => b.date - a.date).slice(0, 15);
  if (ultimos.length === 0) { c.innerHTML = '<div class="empty"><p>Sem resultados.</p></div>'; return; }

  let sparkHtml = '<div class="fspark">';
  const maxGols = Math.max(...ultimos.map(m => Math.max(m.homeGoals || 0, m.awayGoals || 0)), 3);
  [...ultimos].reverse().forEach(m => {
    const isV = m.resultado === 'V', isE = m.resultado === 'E';
    const cls = isV ? 'up' : isE ? 'ok' : 'down';
    const gols = Math.max(m.homeGoals || 0, m.awayGoals || 0);
    const pct = Math.max((gols / maxGols) * 100, 15);
    const label = (m.isHome ? m.homeGoals : m.awayGoals) + '-' + (m.isHome ? m.awayGoals : m.homeGoals);
    sparkHtml += `<div class="fbar ${cls}" style="height:${pct}%" data-label="${label}" title="${esc(m.opponent)} (${fmtData(m.date)})"></div>`;
  });
  sparkHtml += '</div>';

  const label = st.filter === 'todas' ? 'Últimos 15 jogos do Timão' : `Últimos jogos - ${COMP_KEYS.find(k => k.key === st.filter)?.label || st.filter}`;
  let html = `<p style="font-size:0.85rem;color:var(--gray-300);margin-bottom:4px">${esc(label)}:</p>${sparkHtml}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">`;
  ultimos.forEach(m => {
    const isV = m.resultado === 'V', isE = m.resultado === 'E';
    const cor = isV ? '#22c55e' : isE ? '#eab308' : '#ef4444';
    const placar = (m.isHome ? m.homeGoals : m.awayGoals) + '-' + (m.isHome ? m.awayGoals : m.homeGoals);
    html += `<div style="width:38px;text-align:center;background:${cor}22;border:1px solid ${cor};border-radius:6px;padding:4px 2px;font-size:0.7rem;font-weight:700;color:${cor}" title="${esc(m.opponent)}">${placar}</div>`;
  });
  html += `</div><p style="color:var(--gray-400);font-size:0.8rem">🟢 Vitória &nbsp; 🟡 Empate &nbsp; 🔴 Derrota</p>`;
  c.innerHTML = html;
}

function renderCalendario() {
  const c = $('#hamContent');
  const filtered = m => st.filter === 'todas' || m.championshipKey === st.filter;
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const grupos = {};
  st.all.filter(m => filtered(m)).forEach(m => {
    const chave = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, '0')}`;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(m);
  });
  const keys = Object.keys(grupos).sort();
  if (keys.length === 0) { c.innerHTML = '<div class="empty"><p>Sem jogos.</p></div>'; return; }
  let html = '';
  keys.forEach(k => {
    const [ano, mes] = k.split('-');
    html += `<div class="section-title" style="margin-top:12px">${meses[parseInt(mes, 10) - 1]} ${ano}</div>`;
    grupos[k].sort((a, b) => a.date - b.date).forEach(m => {
      const isDone = m.status === 'finished';
      const placar = isDone ? `${m.isHome ? m.homeGoals : m.awayGoals}x${m.isHome ? m.awayGoals : m.homeGoals}` : (m.isLive ? 'AO VIVO' : fmtT(m.date));
      html += `<div class="cal-item">
        <span class="cal-data">${fmtData(m.date)}</span>
        <span class="cal-placar">${placar}</span>
        <span class="cal-adv">${esc(m.opponent)}</span>
        <span class="cal-comp">${esc(m.league)}</span>
      </div>`;
    });
  });
  c.innerHTML = html;
}

function renderExportar() {
  const c = $('#hamContent');
  const prox = st.matches.filter(m => st.filter === 'todas' || m.championshipKey === st.filter).sort((a, b) => a.date - b.date);
  if (prox.length === 0) { c.innerHTML = '<div class="empty"><p>Nenhum jogo futuro nesta competição.</p></div>'; return; }
  let texto = 'Próximos jogos do Corinthians:\n';
  prox.forEach(m => {
    texto += `${fmtD(m.date)} às ${fmtT(m.date)} - ${m.league} (${m.stage}) - ${m.homeName} x ${m.awayName} (${m.venue})\n`;
  });
  c.innerHTML = `<p style="color:var(--gray-300);font-size:0.85rem;margin-bottom:12px">Copie a agenda de jogos:</p>
    <pre class="export-box" id="exportText">${esc(texto)}</pre>
    <button class="btn" id="copyBtn" style="width:100%;margin-top:8px">Copiar Agenda</button>`;
  const copyBtn = document.getElementById('copyBtn');
  const exportText = document.getElementById('exportText');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
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
  }
}

function checkNotifs() {
  if (!st.notif || !('Notification' in window) || Notification.permission !== 'granted' || !st.matches) return;
  const now = Date.now();
  st.matches.forEach(m => {
    if (st.notified.has(m.id)) return;
    const diff = m.date.getTime() - now;
    if (diff <= 0) {
      if (diff >= -7200000) {
        notificar('Corinthians - Jogo começou!', `${m.league}: ${m.opponent} está jogando agora!`, m.id);
      }
      st.notified.add(m.id); save(); return;
    }
    if (st.remind && diff <= 3600000 && diff > 0) {
      notificar('Corinthians - 1 hora!', `${m.league}: ${m.opponent} - ${m.venue} às ${fmtT(m.date)}`, m.id);
      st.notified.add(m.id); save();
    }
    if (diff <= 86400000 && diff > 3600000) {
      notificar('Corinthians - Jogo amanhã!', `${m.league}: ${m.opponent} - ${fmtD(m.date)} às ${fmtT(m.date)}`, m.id);
      st.notified.add(m.id); save();
    }
  });
}

function init() {
  load();
  renderFiltros();
  $('#notifT').checked = st.notif;
  $('#remindT').checked = st.remind;

  const searchInput = $('#searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      st.search = e.target.value.trim();
      aplicarFiltro();
    });
  }

  window.OneSignal = window.OneSignal || [];
  OneSignal.push(async function() {
    const isSubscribed = await OneSignal.isPushNotificationsEnabled();
    st.notif = isSubscribed;
    $('#notifT').checked = isSubscribed;
    if (isSubscribed) {
      $('#notifCta').style.display = 'none';
      $('#notifSettings').style.display = 'block';
    } else {
      $('#notifCta').style.display = 'block';
      $('#notifSettings').style.display = 'none';
    }
    save();
  });

  $('#notifEnableBtn').addEventListener('click', async () => {
    toast('Abrindo permissão...');
    window.OneSignal = window.OneSignal || [];
    OneSignal.push(async function() {
      try {
        await OneSignal.Slidedown.promptPush();
        const isSubscribed = await OneSignal.isPushNotificationsEnabled();
        if (isSubscribed) {
          st.notif = true;
          $('#notifT').checked = true;
          $('#notifCta').style.display = 'none';
          $('#notifSettings').style.display = 'block';
          save();
          toast('Notificações ativadas!');
        } else {
          toast('Permissão negada. Ative manualmente nas configurações do navegador.');
        }
      } catch (e) {
        toast('Erro ao ativar notificações.');
      }
    });
  });

  $('#notifT').addEventListener('change', async () => {
    const enabled = $('#notifT').checked;
    st.notif = enabled; save();
    if (enabled) {
      toast('Ativando notificações...');
      await toggleOneSignal(true);
      const isSubscribed = await new Promise(r => OneSignal.push(async () => r(await OneSignal.isPushNotificationsEnabled())));
      if (isSubscribed) {
        toast('Notificações ativadas!');
        $('#notifCta').style.display = 'none';
        $('#notifSettings').style.display = 'block';
      } else {
        toast('Notificações bloqueadas pelo navegador.');
        st.notif = false; $('#notifT').checked = false; save();
      }
    } else {
      await toggleOneSignal(false);
      toast('Notificações desativadas.');
      $('#notifCta').style.display = 'block';
      $('#notifSettings').style.display = 'none';
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
    $('#hamTabs').querySelectorAll('.htab').forEach(b => b.classList.toggle('ativo', b.dataset.tab === st.hamTab));
  });
  $('#hamClose').addEventListener('click', () => { $('#hamPanel').classList.remove('show'); $('#hamOverlay').classList.remove('show'); });
  $('#hamOverlay').addEventListener('click', () => { $('#hamPanel').classList.remove('show'); $('#hamOverlay').classList.remove('show'); });

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

  let tx = 0, touchPanel = false;
  document.addEventListener('touchstart', e => {
    tx = e.changedTouches[0].clientX;
    touchPanel = e.target.closest('.panel') !== null;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const startX = tx;
    if (dx > 80 && startX < 60) {
      if (!$('#hamPanel').classList.contains('show')) $('#hamBtn').click();
    } else if (dx < -80) {
      if ($('#hamPanel').classList.contains('show')) $('#hamOverlay').click();
      if ($('#notifPanel').classList.contains('show')) $('#notifOverlay').click();
    } else if (Math.abs(dx) < 20 && !touchPanel) {
      const screenW = window.innerWidth;
      if (startX > screenW - 60 && !$('#hamPanel').classList.contains('show')) $('#hamBtn').click();
    }
  }, { passive: true });
}

function renderMatchModal(m) {
  if (!m) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const lineup = m.matchId && st.lineups[m.matchId];
  const isFinished = m.status === 'finished' && !m.isLive;
  const hasScore = m.isLive || isFinished;
  const scoreDisplay = hasScore
    ? `${m.homeGoals !== null ? m.homeGoals : '?'} x ${m.awayGoals !== null ? m.awayGoals : '?'}`
    : 'VS';

  let statusLine = '';
  if (m.isLive) {
    statusLine = `<div style="margin-top:8px;color:#ef4444;font-weight:700"><span class="live-dot" style="display:inline-block;vertical-align:middle;margin-right:6px"></span>AO VIVO${m.liveMinute ? ` (${esc(m.liveMinute)}')` : ''}</div>`;
  } else if (isFinished) {
    const resLabel = m.resultado === 'V' ? 'Vitória do Timão' : m.resultado === 'E' ? 'Empate' : 'Derrota';
    statusLine = `<div style="margin-top:8px;font-weight:700;color:var(--white)">${resLabel}</div>`;
  } else {
    statusLine = `<div style="margin-top:8px">${cdwn(m.date)}</div>`;
  }

  let html = `<div class="modal-box">
    <button class="modal-close" id="modalClose" aria-label="Fechar">&times;</button>
    <div class="modal-title">${esc(m.league)} &bull; ${esc(m.stage)}</div>
    <div class="modal-teams">
      <div class="modal-team">${renderShieldHtml(m.homeLogo, m.homeName, m.homeAcronym)}<span class="nm">${esc(m.homeName)}</span></div>
      <div class="modal-score${m.isLive ? ' live' : ''}">${scoreDisplay}</div>
      <div class="modal-team">${renderShieldHtml(m.awayLogo, m.awayName, m.awayAcronym)}<span class="nm">${esc(m.awayName)}</span></div>
    </div>
    <div class="modal-info">
      <div>${fmtD(m.date)} &bull; ${fmtT(m.date)}</div>
      <div>${esc(m.venue)} &bull; ${m.isHome ? 'Mandante' : 'Visitante'}</div>
      <div>Transmissão: ${esc(m.ch.join(' / '))}</div>
      ${m.penalties ? `<div style="color:#fde68a;margin-top:6px">⚽ ${esc(m.penalties)}</div>` : ''}
      ${m.notes ? `<div style="color:var(--gray-200);margin-top:6px">${esc(m.notes)}</div>` : ''}
      ${statusLine}
    </div>`;

  if (lineup) {
    html += `<div class="modal-lineup-title">Escalação</div>`;
    lineup.forEach(team => {
      html += `<div class="modal-lineup-team"><strong>${esc(team.team)} (${esc(team.acronym)})</strong><div class="modal-lineup-grid">`;
      team.players.forEach(p => {
        html += `<span class="ej-num">${esc(p.num)}</span><span class="ej-nome">${esc(p.name)}</span><span class="ej-pos">${esc(p.pos)}</span>`;
      });
      html += `</div></div>`;
    });
  }

  html += `</div>`;
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 250);
  };
  overlay.querySelector('#modalClose').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

function notificar(title, body, tag) {
  if (!st.notif) return;
  window.OneSignal = window.OneSignal || [];
  OneSignal.push(function() {
    OneSignal.isPushNotificationsEnabled(function(isEnabled) {
      if (isEnabled) {
        OneSignal.sendSelfNotification(title, body, 'logocorinthians.svg', { tag: tag || 'cor-match' });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'logocorinthians.svg' });
      }
    });
  });
}

async function toggleOneSignal(enable) {
  window.OneSignal = window.OneSignal || [];
  return new Promise(resolve => {
    OneSignal.push(async function() {
      if (enable) {
        const isSubscribed = await OneSignal.isPushNotificationsEnabled();
        if (!isSubscribed) await OneSignal.Slidedown.promptPush();
        resolve(true);
      } else {
        await OneSignal.setSubscription(false);
        resolve(false);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
