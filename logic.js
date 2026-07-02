/* =============================================================
 * logic.js — бизнес-логика и расчёты (раздел 6 PRD).
 * Чистые функции над состоянием; всё считается на клиенте (раздел 11).
 * ============================================================= */
(function () {
  const C = window.CONFIG;

  /* ---------- Дата/время: граница суток по Алматы, UTC+5 (OQ-9) ---------- */
  function dateStr(ms) {
    const shifted = new Date((ms == null ? Date.now() : ms) + C.TIMEZONE_OFFSET_MIN * 60000);
    return shifted.toISOString().slice(0, 10); // ГГГГ-ММ-ДД
  }
  function today() { return dateStr(Date.now()); }
  function tomorrow() { return dateStr(Date.now() + 86400000); }
  function monthKey(date) { return date.slice(0, 7); }          // ГГГГ-ММ
  function monthLabel(mk) {
    const [y, m] = mk.split("-");
    const names = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
    return names[+m - 1] + " " + y;
  }

  /* ---------- Перевод шагов в километры (6.1) ---------- */
  function stepsToKm(steps) { return steps * C.STRIDE_LENGTH_M / 1000; }
  function fmtKm(km) { return (Math.round(km * 10) / 10).toLocaleString("ru-RU"); }
  function fmtInt(n) { return Math.round(n).toLocaleString("ru-RU"); }

  /* ---------- Дистанции точек маршрута (6.2) ---------- */
  function checkpointDistances() {
    return C.CHECKPOINTS.map((cp) => Object.assign({}, cp, { km: C.TOTAL_ROUTE_KM * cp.share / 100 }));
  }

  /* ---------- Прогресс участника в текущем круге (6.3) ---------- */
  // entries: массив {login,date,steps}; race: {lap,lapStartDate}
  function lapProgress(login, entries, race) {
    const start = race && race.lapStartDate;
    let steps = 0;
    for (const e of entries) {
      if (e.login !== login) continue;
      if (start && e.date < start) continue; // записи раньше старта круга не считаются
      steps += Number(e.steps) || 0;
    }
    const km = stepsToKm(steps);
    const pct = Math.min(100, C.TOTAL_ROUTE_KM ? km / C.TOTAL_ROUTE_KM * 100 : 0);
    // самая дальняя пройденная точка
    const cps = checkpointDistances();
    let passed = cps[0];
    for (const cp of cps) if (cp.km <= km + 1e-9) passed = cp;
    return { login, stepsLap: steps, km, pct, passed };
  }

  function allProgress(users, entries, race) {
    return users.map((u) => Object.assign({ user: u }, lapProgress(u.login, entries, race)))
                .sort((a, b) => b.km - a.km);
  }

  /* ---------- Условие финиша и сброс круга (6.4) ---------- */
  // Возвращает объект нового состояния race, если кто-то финишировал; иначе null.
  function checkFinish(users, entries, race) {
    const prog = allProgress(users, entries, race);
    const finisher = prog.find((p) => p.km >= C.TOTAL_ROUTE_KM - 1e-9);
    if (!finisher) return null;
    return {
      lap: (race.lap || 1) + 1,
      lapStartDate: tomorrow(),            // OQ-7: новый круг стартует «завтра»
      lastWinner: finisher.login,
      lastWinnerAt: Date.now()
    };
  }

  /* ---------- Ежемесячные итоги и рейтинг (6, 5.3) ---------- */
  // -> { months:[mk...], perUser:{login:{mk:{steps,km}}}, totals:{mk:{steps,km}} }
  function monthlyTotals(users, entries) {
    const perUser = {}, totals = {}, monthSet = new Set();
    users.forEach((u) => (perUser[u.login] = {}));
    for (const e of entries) {
      const mk = monthKey(e.date), steps = Number(e.steps) || 0;
      monthSet.add(mk);
      if (!perUser[e.login]) perUser[e.login] = {};
      const pu = perUser[e.login][mk] || (perUser[e.login][mk] = { steps: 0, km: 0 });
      pu.steps += steps; pu.km += stepsToKm(steps);
      const t = totals[mk] || (totals[mk] = { steps: 0, km: 0 });
      t.steps += steps; t.km += stepsToKm(steps);
    }
    const months = Array.from(monthSet).sort();
    return { months, perUser, totals };
  }

  // Рейтинг за месяц по шагам (OQ-8, основной)
  function monthlyRanking(users, entries, mk) {
    return users.map((u) => {
      let steps = 0;
      for (const e of entries) if (e.login === u.login && monthKey(e.date) === mk) steps += Number(e.steps) || 0;
      return { user: u, steps, km: stepsToKm(steps) };
    }).sort((a, b) => b.steps - a.steps);
  }

  window.Logic = {
    dateStr, today, tomorrow, monthKey, monthLabel,
    stepsToKm, fmtKm, fmtInt,
    checkpointDistances, lapProgress, allProgress,
    checkFinish, monthlyTotals, monthlyRanking
  };
})();
