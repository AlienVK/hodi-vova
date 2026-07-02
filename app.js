/* =============================================================
 * app.js — UI и связывание всего вместе.
 * 5 вкладок (раздел 9): Карта, Статистика, Стена, Мои данные, Админ.
 * ============================================================= */
(function () {
  const C = window.CONFIG, L = window.Logic, A = window.Auth, S = window.Store;

  // ---------- Состояние ----------
  const state = {
    tab: "map",
    users: [], entries: [], wall: [], race: { lap: 1, lapStartDate: null },
    loaded: { users: false, entries: false, wall: false, race: false },
    session: { login: sessionStorage.getItem("sess.login") || null, admin: sessionStorage.getItem("sess.admin") === "1" },
    statMonth: L.monthKey(L.today()),
    statUnit: "steps",           // steps | km
    editingDate: null,           // редактируемая запись в «Мои данные»
    finishing: false             // защита от повторного сброса круга
  };

  // ---------- Утилиты ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const views = { map: $("view-map"), stats: $("view-stats"), wall: $("view-wall"), me: $("view-me"), admin: $("view-admin") };
  const userMap = () => { const m = {}; state.users.forEach((u) => (m[u.login] = u)); return m; };
  const findUser = (login) => state.users.find((u) => u.login === login);

  let toastT;
  function toast(msg, kind) {
    const t = $("toast"); t.textContent = msg; t.className = "toast show" + (kind === "err" ? " err" : "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 2600);
  }
  function relTime(ms) {
    const d = Math.floor((Date.now() - ms) / 1000);
    if (d < 60) return "только что";
    if (d < 3600) return Math.floor(d / 60) + " мин назад";
    if (d < 86400) return Math.floor(d / 3600) + " ч назад";
    return new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  // ---------- Инициализация ----------
  document.title = C.APP_TITLE;
  $("appTitle").textContent = C.APP_TITLE;

  document.querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => setTab(btn.dataset.tab)));

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    Object.keys(views).forEach((k) => views[k].classList.toggle("active", k === tab));
    render();
  }

  ["users", "entries", "wall", "race"].forEach((name) =>
    S.subscribe(name, (data) => {
      if (name === "race") state.race = data || { lap: 1, lapStartDate: null };
      else state[name] = data || [];
      state.loaded[name] = true;
      maybeAdvanceLap();
      updateBadge();
      render();
    }));

  // ---------- Логика финиша круга (6.4) ----------
  function maybeAdvanceLap() {
    if (!state.loaded.users || !state.loaded.entries || !state.loaded.race) return;
    if (state.finishing) return;
    const next = L.checkFinish(state.users, state.entries, state.race);
    if (next) {
      state.finishing = true;
      S.setRace(next);
      const w = findUser(next.lastWinner);
      setTimeout(() => (state.finishing = false), 1500);
      toast("🏁 " + (next.lastWinner || "Участник") + " дошёл до Парижа! Круг №" + (next.lap - 1) + " завершён.");
    }
  }

  function updateBadge() {
    const b = $("sessionBadge");
    if (state.session.admin) b.innerHTML = "Администратор<small>мастер-режим</small>";
    else if (state.session.login) b.innerHTML = esc(state.session.login) + "<small>участник</small>";
    else b.innerHTML = "Гость<small>только просмотр</small>";
  }

  // ---------- Диспетчер отрисовки ----------
  function render() {
    if (state.tab === "map") renderMap();
    else if (state.tab === "stats") renderStats();
    else if (state.tab === "wall") renderWall();
    else if (state.tab === "me") renderMe();
    else if (state.tab === "admin") renderAdmin();
  }

  /* ===================================================================
   * ГЕОМЕТРИЯ КАРТЫ
   * Маршрут визуально «виляет», но прогресс задаётся ЛИНЕЙНО по вертикали
   * (p = доля пройденного). Извивы — только горизонтальная декорация и НЕ
   * влияют на расчёты дистанции/длины (те живут в logic.js от км).
   * =================================================================== */
  const MAP = { W: 340, H: 820, CX: 170, AMP: 92, TOP: 46, BOT: 780, WAVES: 3, PHASE: 0.6 };
  const routeXY = (p) => ({
    x: MAP.CX + MAP.AMP * Math.sin(p * Math.PI * MAP.WAVES + MAP.PHASE),
    y: MAP.TOP + p * (MAP.BOT - MAP.TOP)
  });
  const routePos = (p) => { const { x, y } = routeXY(p); return { left: x / MAP.W * 100, top: y / MAP.H * 100 }; };
  function routePath(a, b, n) {
    let d = "";
    for (let i = 0; i <= n; i++) { const { x, y } = routeXY(a + (b - a) * i / n); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    return d;
  }
  const YW_TOP = routeXY(0.5).y, YW_BOT = routeXY(0.75).y; // границы Ла-Манша (50%–75%)

  // --- маленькие декоративные объекты ---
  function pine(x, y, s) {
    return `<g opacity="0.9"><rect x="${x - s * 0.14}" y="${y + s * 1.5}" width="${s * 0.28}" height="${s * 0.7}" fill="#7a5a3a"/>`
      + `<path d="M${x} ${y} l${-s} ${s * 1.1} h${2 * s} z" fill="#6f9350"/>`
      + `<path d="M${x} ${y + s * 0.55} l${-s * 1.15} ${s * 1.25} h${2.3 * s} z" fill="#5f854a"/></g>`;
  }
  function tree(x, y, s) {
    return `<g opacity="0.85"><rect x="${x - s * 0.12}" y="${y + s}" width="${s * 0.24}" height="${s * 0.7}" fill="#7a5a3a"/>`
      + `<circle cx="${x}" cy="${y + s * 0.5}" r="${s}" fill="#79a05a"/>`
      + `<circle cx="${x - s * 0.6}" cy="${y + s}" r="${s * 0.7}" fill="#6b9350"/>`
      + `<circle cx="${x + s * 0.6}" cy="${y + s}" r="${s * 0.7}" fill="#6b9350"/></g>`;
  }
  function forest(x, y) {
    return pine(x, y, 7) + tree(x + 14, y + 6, 6) + pine(x - 13, y + 8, 6) + tree(x + 4, y + 14, 5);
  }
  function town(x, y, label, side) {
    const g = `<g opacity="0.9">`
      + `<rect x="${x - 11}" y="${y - 7}" width="8" height="9" fill="#cfc8b2" stroke="#8a8267" stroke-width="0.5"/>`
      + `<polygon points="${x - 11},${y - 7} ${x - 7},${y - 12} ${x - 3},${y - 7}" fill="#9a5b4a"/>`
      + `<rect x="${x - 1}" y="${y - 10}" width="9" height="12" fill="#ddd6c3" stroke="#8a8267" stroke-width="0.5"/>`
      + `<polygon points="${x - 1},${y - 10} ${x + 3.5},${y - 15} ${x + 8},${y - 10}" fill="#9a5b4a"/>`
      + `<rect x="${x + 9}" y="${y - 5}" width="6" height="7" fill="#cfc8b2" stroke="#8a8267" stroke-width="0.5"/></g>`;
    const tx = side === "left" ? x - 14 : x + 17;
    const anc = side === "left" ? "end" : "start";
    return g + `<text x="${tx}" y="${y}" text-anchor="${anc}" font-size="9" fill="#6a6f80" font-family="system-ui,sans-serif">${label}</text>`;
  }
  function hill(x, y, w, h, c) { return `<path d="M${x} ${y} q${w / 2} ${-h} ${w} 0 z" fill="${c}" opacity="0.6"/>`; }
  function gull(x, y) { return `<path d="M${x} ${y} q3 -3 6 0 q3 -3 6 0" fill="none" stroke="#7b8496" stroke-width="1" opacity="0.6"/>`; }

  function mapScenery() {
    const defs = `<defs>
      <linearGradient id="landTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f3de"/><stop offset="1" stop-color="#dcebcd"/></linearGradient>
      <linearGradient id="landBot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2eecf"/><stop offset="1" stop-color="#eaf3df"/></linearGradient>
      <linearGradient id="chan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9dcd7"/><stop offset="0.5" stop-color="#7ec7c0"/><stop offset="1" stop-color="#a9dcd7"/></linearGradient>
      <linearGradient id="riv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fc3e6"/><stop offset="1" stop-color="#6fb0dd"/></linearGradient>
    </defs>`;

    const land = `<rect x="0" y="0" width="${MAP.W}" height="${YW_TOP}" fill="url(#landTop)"/>`
      + `<rect x="0" y="${YW_TOP}" width="${MAP.W}" height="${YW_BOT - YW_TOP}" fill="url(#chan)"/>`
      + `<rect x="0" y="${YW_BOT}" width="${MAP.W}" height="${MAP.H - YW_BOT}" fill="url(#landBot)"/>`
      // мягкие волнистые кромки берегов
      + `<path d="M0 ${YW_TOP} q28 8 56 0 t56 0 t56 0 t56 0 t56 0 t56 0 V${YW_TOP - 10} H0 Z" fill="url(#landTop)"/>`
      + `<path d="M0 ${YW_BOT} q28 -8 56 0 t56 0 t56 0 t56 0 t56 0 t56 0 V${YW_BOT + 10} H0 Z" fill="url(#landBot)"/>`;

    // холмы и облака
    const hills = hill(-10, 96, 120, 34, "#c7dca6") + hill(90, 104, 150, 40, "#bcd39a") + hill(240, 92, 140, 32, "#c7dca6")
      + `<ellipse cx="70" cy="34" rx="26" ry="10" fill="#ffffff" opacity="0.65"/><ellipse cx="255" cy="26" rx="30" ry="11" fill="#ffffff" opacity="0.6"/>`;

    // реки (Темза на севере, Сомма/Сена на юге) — декоративные
    const rivers = `<path d="M-5 132 C60 112,95 156,150 134 S255 156,345 128" fill="none" stroke="url(#riv)" stroke-width="5" opacity="0.55" stroke-linecap="round"/>`
      + `<path d="M-5 716 C70 700,110 742,175 720 S280 700,345 724" fill="none" stroke="url(#riv)" stroke-width="5" opacity="0.55" stroke-linecap="round"/>`;

    // леса (только на суше, вне пролива)
    const woods = [
      [42, 150], [300, 118], [70, 250], [305, 236], [44, 348], [302, 356], [122, 78], [258, 392], [30, 300],
      [44, 636], [300, 628], [72, 742], [300, 752], [122, 792], [278, 706], [40, 712]
    ].map(([x, y]) => forest(x, y)).join("");

    // второстепенные города с подписями
    const towns = [
      [292, 190, "Рочестер", "left"], [58, 200, "Мейдстон", "right"], [292, 320, "Ашфорд", "left"],
      [60, 690, "Булонь", "right"], [292, 660, "Амьен", "left"], [70, 792, "Бове", "right"], [286, 792, "Сен-Дени", "left"]
    ].map(([x, y, l, s]) => town(x, y, l, s)).join("");

    // детали Ла-Манша: волны, чайки, паром, подпись
    const midY = (YW_TOP + YW_BOT) / 2;
    let waves = "";
    for (let k = 0; k < 3; k++) {
      const wy = YW_TOP + 26 + k * ((YW_BOT - YW_TOP - 40) / 2);
      waves += `<path d="M14 ${wy} q18 -7 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0" fill="none" stroke="#ffffff" stroke-width="1.4" opacity="0.35"/>`;
    }
    const ferry = `<g transform="translate(${MAP.CX - 70} ${midY - 18})">
      <path d="M0 10 h34 l-5 9 h-24 z" fill="#3b4a63"/><rect x="8" y="2" width="16" height="9" fill="#e9e3d2"/>
      <rect x="15" y="-8" width="2" height="10" fill="#8a8267"/><rect x="17" y="-8" width="7" height="5" fill="#d1495b"/></g>`;
    const gulls = gull(MAP.CX + 40, YW_TOP + 30) + gull(MAP.CX + 58, YW_TOP + 40) + gull(60, YW_BOT - 34);
    const label = `<text x="322" y="${midY}" text-anchor="middle" transform="rotate(90 322 ${midY})" font-size="11" font-weight="700" fill="#2f8f88" letter-spacing="1">ЛА-МАНШ</text>`;

    return defs + land + hills + rivers + woods + towns + waves + ferry + gulls + label;
  }
  const MAP_SCENERY = mapScenery();

  function mapRouteSVG() {
    const full = routePath(0, 1, 140), water = routePath(0.5, 0.75, 48);
    const dots = L.checkpointDistances().map((cp) => {
      const { x, y } = routeXY(cp.share / 100);
      const fin = cp.share === 100;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#fff" stroke="${fin ? "var(--danger)" : "var(--brass-2)"}" stroke-width="2"/>`;
    }).join("");
    return `<path d="${full}" fill="none" stroke="#cbb98f" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>`
      + `<path d="${full}" fill="none" stroke="var(--brass-2)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="0.1 9"/>`
      + `<path d="${water}" fill="none" stroke="var(--water)" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.1 9"/>`
      + dots;
  }

  /* ===================================================================
   * ВКЛАДКА: КАРТА
   * =================================================================== */
  function renderMap() {
    const race = state.race || { lap: 1 };
    const prog = L.allProgress(state.users, state.entries, race); // отсортировано по km
    const cps = L.checkpointDistances();

    // фишки: декластеризация по вертикали (горизонтальный сдвиг близких)
    const sorted = prog.slice().sort((a, b) => a.pct - b.pct);
    let slot = 0, lastPct = -99;
    const chipHTML = sorted.map((p) => {
      if (p.pct - lastPct < 6) slot++; else slot = 0;
      lastPct = p.pct;
      const dir = slot % 2 ? 1 : -1;
      const off = Math.ceil(slot / 2) * 74 * dir;
      const leader = prog[0] && prog[0].login === p.login && p.km > 0;
      const pos = routePos(Math.min(1, p.pct / 100));
      return `<div class="chip${leader ? " leader" : ""}" style="left:${pos.left}%;top:${pos.top}%;transform:translate(calc(-50% + ${off}px),-50%)" title="${esc(p.login)} — ${L.fmtKm(p.km)} км">
        ${window.avatarSVG(p.user, 24)}<span>${esc(p.login)}</span><span class="chip-pct">${Math.round(p.pct)}%</span>
      </div>`;
    }).join("");

    const cpHTML = cps.map((cp) => {
      const p = cp.share / 100, pos = routePos(p), finish = cp.share === 100;
      const side = routeXY(p).x < MAP.CX ? "right" : "left"; // подпись — в сторону центра
      const tag = side === "right"
        ? `left:${pos.left}%;top:${pos.top}%;transform:translate(26px,-50%);text-align:left`
        : `left:${pos.left}%;top:${pos.top}%;transform:translate(calc(-100% - 26px),-50%);text-align:right`;
      return `<div class="cp-badge${finish ? " finish" : ""}" style="left:${pos.left}%;top:${pos.top}%">${window.checkpointImg(cp)}</div>
        <div class="cp-tag${finish ? " finish" : ""}" style="${tag}">
          <span class="cp-name">${esc(cp.name)}${cp.sub ? " · " + esc(cp.sub) : ""}</span>
          <span class="cp-dist">${cp.share}% · ${L.fmtKm(cp.km)} км</span>
        </div>`;
    }).join("");

    const mapSVG = `<svg class="map-bg" viewBox="0 0 ${MAP.W} ${MAP.H}" preserveAspectRatio="none" aria-hidden="true">${MAP_SCENERY}${mapRouteSVG()}</svg>`;

    const winnerLine = race.lastWinner
      ? `Победитель круга №${(race.lap || 1) - 1}: <span class="winner">${esc(race.lastWinner)}</span>`
      : `Первый круг ещё идёт — победителей пока нет`;

    const whoHTML = prog.length ? prog.map((p, i) => `
      <div class="who">
        <div class="rank-pos ${i === 0 && p.km > 0 ? "first" : ""}">${i + 1}</div>
        ${window.avatarSVG(p.user, 34)}
        <div style="flex:1">
          <div class="who-name">${esc(p.login)}</div>
          <div class="who-bar"><i style="width:${p.pct}%"></i></div>
          <div class="who-meta">${L.fmtKm(p.km)} км · ${Math.round(p.pct)}% · пройдено: ${esc(p.passed.name)}</div>
        </div>
      </div>`).join("") : emptyBlock("👣", "Пока никто не сделал ни шага", "Внесите шаги во вкладке «Мои данные».");

    views.map.innerHTML = `
      <div class="lap-banner">
        <div class="lapno">№${race.lap || 1}</div>
        <div class="lapmeta">
          <div>Текущий круг · Лондон → Париж (${L.fmtKm(C.TOTAL_ROUTE_KM)} км)</div>
          <div>${winnerLine}</div>
        </div>
      </div>
      <div class="card map">
        <div class="map-canvas">
          ${mapSVG}
          ${cpHTML}
          ${chipHTML}
        </div>
      </div>
      <div class="card who-list">
        <h2>Кто где</h2>
        ${whoHTML}
      </div>
      ${modeHint()}`;
  }

  /* ===================================================================
   * ВКЛАДКА: СТАТИСТИКА
   * =================================================================== */
  function renderStats() {
    const mt = L.monthlyTotals(state.users, state.entries);
    const months = mt.months.slice();
    const curMk = L.monthKey(L.today());
    if (!months.includes(curMk)) months.push(curMk);
    months.sort();
    if (!months.includes(state.statMonth)) state.statMonth = curMk;

    // Рейтинг за выбранный месяц (по шагам, OQ-8)
    const ranking = L.monthlyRanking(state.users, state.entries, state.statMonth);
    const maxSteps = Math.max(1, ...ranking.map((r) => r.steps));
    const barsHTML = ranking.some((r) => r.steps > 0)
      ? ranking.map((r, i) => `
        <div class="bar-row">
          <div class="bar-name">${i === 0 ? "🥇 " : ""}${esc(r.user.login)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${r.steps / maxSteps * 100}%"></div></div>
          <div class="bar-val">${L.fmtInt(r.steps)}</div>
        </div>`).join("")
      : `<div class="empty small">Нет данных за ${esc(L.monthLabel(state.statMonth))}.</div>`;

    const monthOpts = months.map((mk) =>
      `<option value="${mk}"${mk === state.statMonth ? " selected" : ""}>${esc(L.monthLabel(mk))}</option>`).join("");

    // Диаграмма помесячной динамики суммарных шагов
    const dyn = mt.months.map((mk) => ({ mk, steps: mt.totals[mk].steps }));
    const dynChart = renderDynChart(dyn);

    // Таблица помесячных итогов (переключатель шаги/км)
    const unit = state.statUnit;
    const cols = mt.months;
    const tableHTML = cols.length ? `
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Участник</th>${cols.map((mk) => `<th>${esc(L.monthLabel(mk))}</th>`).join("")}<th>Итого</th></tr></thead>
        <tbody>
          ${state.users.map((u) => {
            let sum = 0;
            const cells = cols.map((mk) => {
              const v = (mt.perUser[u.login] && mt.perUser[u.login][mk]) || { steps: 0, km: 0 };
              sum += unit === "steps" ? v.steps : v.km;
              return `<td>${v.steps || v.km ? cell(v, unit) : "—"}</td>`;
            }).join("");
            return `<tr><td>${esc(u.login)}</td>${cells}<td>${unit === "steps" ? L.fmtInt(sum) : L.fmtKm(sum)}</td></tr>`;
          }).join("")}
        </tbody>
        <tfoot><tr><td>Всего</td>${cols.map((mk) => {
          const t = mt.totals[mk]; return `<td>${cell(t, unit)}</td>`;
        }).join("")}<td>${totalAll(mt, unit)}</td></tr></tfoot>
      </table></div>` : `<div class="empty small">Пока нет записей для сводки.</div>`;

    // Блок текущего круга
    const prog = L.allProgress(state.users, state.entries, state.race);
    const lapLeader = prog[0] && prog[0].km > 0 ? `${esc(prog[0].login)} (${L.fmtKm(prog[0].km)} км, ${Math.round(prog[0].pct)}%)` : "—";
    const lapRankHTML = prog.length && prog[0].km > 0
      ? prog.filter((p) => p.km > 0).map((p, i) => `<div class="who"><div class="rank-pos ${i===0?"first":""}">${i+1}</div>${window.avatarSVG(p.user,30)}<div style="flex:1"><div class="who-name">${esc(p.login)}</div><div class="who-meta">${L.fmtKm(p.km)} км · ${Math.round(p.pct)}%</div></div></div>`).join("")
      : `<div class="small muted">Круг только начался.</div>`;

    views.stats.innerHTML = `
      <div class="card">
        <div class="row">
          <h2 style="margin:0">Рейтинг за месяц</h2>
          <div class="spacer"></div>
          <select id="statMonthSel" style="width:auto;min-width:150px">${monthOpts}</select>
        </div>
        <p class="small muted" style="margin:6px 0 12px">Основной рейтинг — по количеству шагов (OQ-8).</p>
        <div class="bars">${barsHTML}</div>
      </div>

      <div class="card">
        <h2>Помесячная динамика (суммарные шаги)</h2>
        ${dyn.length ? dynChart : '<div class="empty small">Пока нет данных для графика.</div>'}
      </div>

      <div class="card">
        <div class="row">
          <h2 style="margin:0">Помесячные итоги</h2>
          <div class="spacer"></div>
          <div class="toggle" id="unitToggle">
            <button class="${unit === "steps" ? "on" : ""}" data-unit="steps">Шаги</button>
            <button class="${unit === "km" ? "on" : ""}" data-unit="km">Км</button>
          </div>
        </div>
        ${tableHTML}
      </div>

      <div class="card">
        <h2>Текущий круг №${state.race.lap || 1}</h2>
        <p class="small">Лидер круга: <strong>${lapLeader}</strong></p>
        <div class="who-list">${lapRankHTML}</div>
      </div>
      ${modeHint()}`;

    $("statMonthSel").addEventListener("change", (e) => { state.statMonth = e.target.value; renderStats(); });
    $("unitToggle").querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => { state.statUnit = b.dataset.unit; renderStats(); }));

    function cell(v, u) { return u === "steps" ? L.fmtInt(v.steps) : L.fmtKm(v.km); }
    function totalAll(mt, u) {
      let s = 0; mt.months.forEach((mk) => (s += u === "steps" ? mt.totals[mk].steps : mt.totals[mk].km));
      return u === "steps" ? L.fmtInt(s) : L.fmtKm(s);
    }
  }

  function renderDynChart(dyn) {
    const W = 100 * dyn.length + 20, H = 180, pad = 26, bw = 60;
    const max = Math.max(1, ...dyn.map((d) => d.steps));
    const bars = dyn.map((d, i) => {
      const x = 20 + i * 100, h = (H - pad - 10) * (d.steps / max), y = H - pad - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4"/>
        <text x="${x + bw / 2}" y="${H - pad + 14}" text-anchor="middle">${esc(L.monthLabel(d.mk).replace(/ \d+$/, ""))}</text>
        <text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-weight="700">${shortNum(d.steps)}</text>`;
    }).join("");
    return `<div class="table-wrap"><svg class="dyn-chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.max(W, 300)}px">
      <line class="axis" x1="16" y1="${H - pad}" x2="${W}" y2="${H - pad}"/>${bars}</svg></div>`;
  }
  function shortNum(n) { return n >= 1000 ? Math.round(n / 100) / 10 + "k" : String(n); }

  /* ===================================================================
   * ВКЛАДКА: СТЕНА
   * =================================================================== */
  function renderWall() {
    const um = userMap();
    const list = state.wall.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const canPost = !!state.session.login;

    const composer = canPost ? `
      <div class="card">
        <h2>Новое сообщение</h2>
        <textarea id="wallText" maxlength="${C.WALL_MAX_LEN}" placeholder="Поделитесь успехами…"></textarea>
        <div class="row" style="margin-top:8px">
          <span class="field-hint" id="wallCounter">0 / ${C.WALL_MAX_LEN}</span>
          <div class="spacer"></div>
          <button class="brass" id="wallSend">Опубликовать</button>
        </div>
      </div>`
      : `<div class="card"><div class="notice warn">Чтобы писать на стене, войдите как участник во вкладке «Мои данные». Читать могут все.</div></div>`;

    const feed = list.length ? list.map((m) => `
      <div class="msg" data-id="${esc(m.id)}">
        ${window.avatarSVG(um[m.login] || { login: m.login }, 36)}
        <div class="msg-body">
          <div class="msg-head">
            <span class="msg-author">${esc(m.login)}</span>
            <span class="msg-time">${relTime(m.createdAt || Date.now())}</span>
            ${state.session.admin ? `<button class="ghost small msg-del" data-del="${esc(m.id)}">Удалить</button>` : ""}
          </div>
          <div class="msg-text">${esc(m.text)}</div>
        </div>
      </div>`).join("")
      : emptyBlock("💬", "Пока тихо", "Станьте первым, кто напишет на стене!");

    views.wall.innerHTML = composer + `<div class="card"><h2>Лента</h2>${feed}</div>` + modeHint();

    if (canPost) {
      const ta = $("wallText"), cnt = $("wallCounter");
      ta.addEventListener("input", () => (cnt.textContent = ta.value.length + " / " + C.WALL_MAX_LEN));
      $("wallSend").addEventListener("click", () => {
        const text = ta.value.trim();
        if (!text) return toast("Сообщение пустое", "err");
        S.addWall({ login: state.session.login, text: text.slice(0, C.WALL_MAX_LEN), createdAt: Date.now() });
        ta.value = ""; cnt.textContent = "0 / " + C.WALL_MAX_LEN;
        toast("Опубликовано");
      });
    }
    views.wall.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => {
        if (confirm("Удалить сообщение?")) { S.deleteWall(b.dataset.del); toast("Сообщение удалено"); }
      }));
  }

  /* ===================================================================
   * ВКЛАДКА: МОИ ДАННЫЕ
   * =================================================================== */
  function renderMe() {
    if (!state.session.login) { renderLogin(); return; }
    const login = state.session.login;
    const me = findUser(login);
    if (!me) { // участника удалили
      state.session.login = null; sessionStorage.removeItem("sess.login"); updateBadge(); renderLogin(); return;
    }
    const mine = state.entries.filter((e) => e.login === login).sort((a, b) => b.date.localeCompare(a.date));
    const editing = state.editingDate;
    const editEntry = editing ? mine.find((e) => e.date === editing) : null;
    const defDate = editEntry ? editEntry.date : L.today();
    const defSteps = editEntry ? editEntry.steps : "";

    const listHTML = mine.length ? mine.map((e) => `
      <div class="entry">
        <span class="e-date">${fmtDate(e.date)}</span>
        <span class="e-steps">${L.fmtInt(e.steps)} шаг · <span class="muted">${L.fmtKm(L.stepsToKm(e.steps))} км</span></span>
        <div class="spacer"></div>
        <button class="ghost small" data-edit="${e.date}">Править</button>
      </div>`).join("")
      : emptyBlock("👟", "Пока нет записей", "Внесите первые шаги — км посчитаются сами.");

    views.me.innerHTML = `
      <div class="card">
        <div class="row">
          <div>${window.avatarSVG(me, 40)}</div>
          <div><div style="font-weight:800">${esc(login)}</div><div class="small muted">персональный режим</div></div>
          <div class="spacer"></div>
          <button class="ghost" id="logoutBtn">Выйти</button>
        </div>
      </div>

      <div class="card">
        <h2>${editEntry ? "Редактирование записи" : "Внести шаги"}</h2>
        <label for="entryDate">Дата</label>
        <input type="date" id="entryDate" value="${defDate}" max="${L.today()}" ${editEntry ? "readonly" : ""}>
        <label for="entrySteps">Шаги за день</label>
        <input type="number" id="entrySteps" inputmode="numeric" min="0" step="1" value="${defSteps}" placeholder="например, 8500">
        <div class="field-hint" id="kmPreview"></div>
        <div class="field-hint field-warn" id="stepWarn" style="display:none"></div>
        <div class="row" style="margin-top:12px">
          <button class="brass" id="saveEntry">${editEntry ? "Сохранить изменения" : "Сохранить"}</button>
          ${editEntry ? '<button class="ghost" id="cancelEdit">Отмена</button>' : ""}
        </div>
      </div>

      <div class="card">
        <h2>Мои записи</h2>
        ${listHTML}
      </div>
      ${modeHint()}`;

    const stepsInput = $("entrySteps"), kmPrev = $("kmPreview"), warn = $("stepWarn");
    function refreshPreview() {
      const v = parseInt(stepsInput.value, 10);
      if (!isNaN(v) && v >= 0) kmPrev.textContent = "≈ " + L.fmtKm(L.stepsToKm(v)) + " км";
      else kmPrev.textContent = "";
      if (!isNaN(v) && v > C.MAX_STEPS_PER_DAY) {
        warn.style.display = "block";
        warn.textContent = "Многовато за день (> " + L.fmtInt(C.MAX_STEPS_PER_DAY) + "). Проверьте, нет ли опечатки.";
      } else warn.style.display = "none";
    }
    stepsInput.addEventListener("input", refreshPreview); refreshPreview();

    $("logoutBtn").addEventListener("click", () => {
      state.session.login = null; state.editingDate = null; sessionStorage.removeItem("sess.login");
      updateBadge(); toast("Вы вышли"); render();
    });
    if (editEntry) $("cancelEdit").addEventListener("click", () => { state.editingDate = null; renderMe(); });
    views.me.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => { state.editingDate = b.dataset.edit; renderMe(); window.scrollTo({ top: 0, behavior: "smooth" }); }));

    $("saveEntry").addEventListener("click", () => {
      const date = $("entryDate").value;
      const raw = $("entrySteps").value.trim();
      if (!date) return toast("Укажите дату", "err");
      if (date > L.today()) return toast("Нельзя вносить будущие даты", "err");
      if (raw === "" || !/^\d+$/.test(raw)) return toast("Введите целое число шагов (0 или больше)", "err");
      const steps = parseInt(raw, 10);
      if (steps < 0) return toast("Число шагов не может быть отрицательным", "err");
      if (steps > C.MAX_STEPS_PER_DAY && !confirm("Вы ввели " + L.fmtInt(steps) + " шагов за день — это очень много. Сохранить?")) return;
      const now = Date.now();
      const existing = state.entries.find((e) => e.login === login && e.date === date);
      S.setEntry({ login, date, steps, createdAt: existing ? existing.createdAt : now, updatedAt: now });
      state.editingDate = null;
      toast("Сохранено: " + L.fmtInt(steps) + " шаг (" + L.fmtKm(L.stepsToKm(steps)) + " км)");
    });
  }

  function renderLogin() {
    views.me.innerHTML = `
      <div class="card">
        <h2>Вход участника</h2>
        <p class="small muted">Логин и пароль выдаёт организатор. Забыли — обратитесь к нему.</p>
        <label for="loginName">Логин</label>
        <input id="loginName" autocomplete="username" placeholder="ваш логин">
        <label for="loginPass">Пароль</label>
        <input id="loginPass" type="password" autocomplete="current-password" placeholder="ваш пароль">
        <div id="loginMsg"></div>
        <button class="brass" id="loginBtn" style="margin-top:12px;width:100%">Войти</button>
      </div>
      ${modeHint()}`;
    const doLogin = async () => {
      const login = $("loginName").value.trim();
      const pass = $("loginPass").value;
      const msg = $("loginMsg");
      const u = findUser(login);
      if (!u) { msg.innerHTML = '<div class="notice err">Такого участника нет. Проверьте логин.</div>'; return; }
      if (!(await A.verify(u, pass))) { msg.innerHTML = '<div class="notice err">Неверный пароль.</div>'; return; }
      state.session.login = login; sessionStorage.setItem("sess.login", login);
      updateBadge(); toast("Здравствуйте, " + login + "!"); render();
    };
    $("loginBtn").addEventListener("click", doLogin);
    $("loginPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  }

  /* ===================================================================
   * ВКЛАДКА: АДМИН
   * =================================================================== */
  function renderAdmin() {
    if (!state.session.admin) { renderAdminLogin(); return; }
    const users = state.users.slice().sort((a, b) => a.login.localeCompare(b.login));
    const wall = state.wall.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const usersHTML = users.length ? users.map((u) => {
      const cnt = state.entries.filter((e) => e.login === u.login).length;
      return `<div class="plist-item">
        ${window.avatarSVG(u, 34)}
        <div style="flex:1"><div style="font-weight:700">${esc(u.login)}</div>
          <div class="small muted">${cnt} запис${plural(cnt)} · с ${u.createdAt ? new Date(u.createdAt).toLocaleDateString("ru-RU") : "—"}</div></div>
        <button class="danger small" data-deluser="${esc(u.login)}">Удалить</button>
      </div>`;
    }).join("") : '<div class="empty small">Участников пока нет — зарегистрируйте первого.</div>';

    const wallHTML = wall.length ? wall.slice(0, 30).map((m) => `
      <div class="plist-item">
        <div style="flex:1"><strong>${esc(m.login)}</strong>: ${esc(m.text)}<div class="small muted">${relTime(m.createdAt || Date.now())}</div></div>
        <button class="danger small" data-delmsg="${esc(m.id)}">Удалить</button>
      </div>`).join("") : '<div class="empty small">Сообщений нет.</div>';

    views.admin.innerHTML = `
      <div class="card">
        <div class="row"><h2 style="margin:0">Панель администратора</h2><div class="spacer"></div><button class="ghost" id="adminLogout">Выйти</button></div>
      </div>

      <div class="card">
        <h2>Регистрация участника</h2>
        <label for="regLogin">Логин (уникальный)</label>
        <input id="regLogin" placeholder="например, vova">
        <label for="regPass">Пароль</label>
        <input id="regPass" type="text" placeholder="выдайте участнику">
        <label for="regPhoto">URL аватара (необязательно)</label>
        <input id="regPhoto" placeholder="https://… — иначе монограмма">
        <div id="regMsg"></div>
        <button class="brass" id="regBtn" style="margin-top:12px">Зарегистрировать</button>
      </div>

      <div class="card">
        <h2>Участники (${users.length})</h2>
        ${usersHTML}
      </div>

      <div class="card">
        <h2>Модерация стены</h2>
        ${wallHTML}
      </div>
      ${modeHint()}`;

    $("adminLogout").addEventListener("click", () => {
      state.session.admin = false; sessionStorage.removeItem("sess.admin"); updateBadge(); toast("Выход из админ-режима"); render();
    });

    $("regBtn").addEventListener("click", async () => {
      const login = $("regLogin").value.trim();
      const pass = $("regPass").value;
      const photo = $("regPhoto").value.trim();
      const msg = $("regMsg");
      if (!login) { msg.innerHTML = '<div class="notice err">Укажите логин.</div>'; return; }
      if (!/^[\wа-яА-ЯёЁ.\-]{2,20}$/.test(login)) { msg.innerHTML = '<div class="notice err">Логин: 2–20 символов, буквы/цифры/точка/дефис.</div>'; return; }
      if (login.includes("__")) { msg.innerHTML = '<div class="notice err">Логин не должен содержать «__».</div>'; return; }
      if (findUser(login)) { msg.innerHTML = '<div class="notice err">Логин занят — выберите другой.</div>'; return; }
      if (!pass || pass.length < 3) { msg.innerHTML = '<div class="notice err">Пароль — минимум 3 символа.</div>'; return; }
      const cred = await A.makeCredential(pass);
      S.upsertUser({ login, passwordHash: cred.passwordHash, salt: cred.salt, photoURL: photo || "", createdAt: Date.now() });
      $("regLogin").value = ""; $("regPass").value = ""; $("regPhoto").value = "";
      msg.innerHTML = '<div class="notice ok">Участник «' + esc(login) + '» создан.</div>';
      toast("Участник добавлен");
    });

    views.admin.querySelectorAll("[data-deluser]").forEach((b) =>
      b.addEventListener("click", () => {
        const login = b.dataset.deluser;
        if (confirm('Удалить участника «' + login + '» и ВСЕ его записи? Это необратимо (месячная история по нему тоже исчезнет).')) {
          S.deleteUser(login); toast("Участник удалён");
        }
      }));
    views.admin.querySelectorAll("[data-delmsg]").forEach((b) =>
      b.addEventListener("click", () => { if (confirm("Удалить сообщение?")) { S.deleteWall(b.dataset.delmsg); toast("Удалено"); } }));
  }

  function renderAdminLogin() {
    views.admin.innerHTML = `
      <div class="card">
        <h2>Вход администратора</h2>
        <p class="small muted">Введите мастер-пароль для регистрации/удаления участников и модерации стены.</p>
        <label for="masterPass">Мастер-пароль</label>
        <input id="masterPass" type="password" autocomplete="off" placeholder="мастер-пароль">
        <div id="masterMsg"></div>
        <button class="brass" id="masterBtn" style="margin-top:12px;width:100%">Войти</button>
        <p class="field-hint" style="margin-top:12px">${securityNote()}</p>
      </div>
      ${modeHint()}`;
    const doAuth = () => {
      const val = $("masterPass").value;
      if (val === C.MASTER_PASSWORD) {
        state.session.admin = true; sessionStorage.setItem("sess.admin", "1");
        updateBadge(); toast("Админ-режим включён"); render();
      } else $("masterMsg").innerHTML = '<div class="notice err">Неверный мастер-пароль.</div>';
    };
    $("masterBtn").addEventListener("click", doAuth);
    $("masterPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(); });
  }

  /* ===================================================================
   * Общие фрагменты
   * =================================================================== */
  function emptyBlock(icon, title, sub) {
    return `<div class="empty"><div class="big">${icon}</div><div style="font-weight:700">${esc(title)}</div><div class="small">${esc(sub)}</div></div>`;
  }
  function modeHint() {
    if (S.mode === "local") {
      return `<div class="notice warn mode-hint">⚙️ Демо-режим (localStorage): данные хранятся только в этом браузере и не видны другим устройствам. Для общего доступа заполните <code>FIREBASE_CONFIG</code> в <code>config.js</code>.</div>`;
    }
    return `<div class="notice ok mode-hint">☁️ Облачный режим (Firebase): данные общие и обновляются у всех в реальном времени.</div>`;
  }
  function securityNote() {
    return "Важно (раздел 12 PRD): в публичном репозитории мастер-пароль не является настоящим секретом. Не используйте важные пароли.";
  }
  function fmtDate(d) {
    const [y, m, day] = d.split("-");
    return day + "." + m + "." + y.slice(2);
  }
  function plural(n) { const n10 = n % 10, n100 = n % 100; if (n10 === 1 && n100 !== 11) return "ь"; if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "и"; return "ей"; }

  // ---------- Старт ----------
  updateBadge();
  setTab("map");
})();
