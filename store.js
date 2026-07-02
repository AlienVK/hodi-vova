/* =============================================================
 * store.js — слой данных с живыми подписками (NFR-4).
 * Две реализации за единым интерфейсом:
 *   • Firebase Firestore (+ Anonymous Auth) — когда задан FIREBASE_CONFIG.
 *   • localStorage — демо-режим по умолчанию (данные не общие между
 *     устройствами, но многовкладочно синхронизируются через BroadcastChannel).
 *
 * Интерфейс:
 *   Store.mode  -> "firebase" | "local"
 *   Store.ready -> Promise
 *   Store.subscribe(name, cb) -> unsubscribe   (name: users|entries|wall|race)
 *   Store.upsertUser(user), Store.deleteUser(login),
 *   Store.setEntry(entry), Store.addWall(msg), Store.deleteWall(id),
 *   Store.setRace(race)
 * ============================================================= */
(function () {
  const cfg = window.CONFIG.FIREBASE_CONFIG;
  const useFirebase = cfg && cfg.projectId;

  const Store = {
    mode: useFirebase ? "firebase" : "local",
    ready: null,
    subscribe() {},
    upsertUser() {}, deleteUser() {},
    setEntry() {}, deleteEntry() {},
    addWall() {}, deleteWall() {},
    setRace() {}
  };

  /* ---------- Локальный (localStorage) движок ---------- */
  function LocalEngine() {
    const KEY = "hodivova.v1";
    const listeners = { users: [], entries: [], wall: [], race: [] };
    let db = load();
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("hodivova") : null;

    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { users: {}, entries: {}, wall: {}, race: { lap: 1, lapStartDate: null } };
    }
    function persist(broadcast) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
      if (broadcast && bc) bc.postMessage("changed");
    }
    function emit(name) { listeners[name].slice().forEach((cb) => cb(snapshot(name))); }
    function emitAll() { Object.keys(listeners).forEach(emit); }
    function snapshot(name) {
      if (name === "race") return Object.assign({}, db.race);
      return Object.values(db[name] || {});
    }

    window.addEventListener("storage", (e) => { if (e.key === KEY) { db = load(); emitAll(); } });
    if (bc) bc.onmessage = () => { db = load(); emitAll(); };

    Store.ready = Promise.resolve();
    Store.subscribe = (name, cb) => {
      listeners[name].push(cb);
      Promise.resolve().then(() => cb(snapshot(name))); // начальный снимок — асинхронно (после инициализации модулей)
      return () => { const a = listeners[name]; const i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); };
    };
    Store.upsertUser = (u) => { db.users[u.login] = u; persist(true); emit("users"); };
    Store.deleteUser = (login) => {
      delete db.users[login];
      Object.keys(db.entries).forEach((k) => { if (db.entries[k].login === login) delete db.entries[k]; });
      persist(true); emit("users"); emit("entries");
    };
    Store.setEntry = (e) => { db.entries[e.login + "__" + e.date] = e; persist(true); emit("entries"); };
    Store.deleteEntry = (login, date) => { delete db.entries[login + "__" + date]; persist(true); emit("entries"); };
    Store.addWall = (m) => { const id = m.id || ("m" + Date.now() + Math.random().toString(36).slice(2, 6)); db.wall[id] = Object.assign({ id }, m); persist(true); emit("wall"); };
    Store.deleteWall = (id) => { delete db.wall[id]; persist(true); emit("wall"); };
    Store.setRace = (r) => { db.race = r; persist(true); emit("race"); };
  }

  /* ---------- Firebase-движок (ленивая загрузка SDK v9 compat) ---------- */
  function FirebaseEngine() {
    Store.ready = (async () => {
      await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js");
      firebase.initializeApp(cfg);
      const auth = firebase.auth();
      const fs = firebase.firestore();
      await auth.signInAnonymously().catch((e) => console.warn("Anon auth:", e));

      const colName = { users: "users", entries: "entries", wall: "wall" };

      Store.subscribe = (name, cb) => {
        if (name === "race") {
          return fs.doc("meta/race").onSnapshot((d) => cb(d.exists ? d.data() : { lap: 1, lapStartDate: null }));
        }
        let q = fs.collection(colName[name]);
        if (name === "wall") q = q.orderBy("createdAt", "desc");
        return q.onSnapshot((snap) => cb(snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))));
      };
      Store.upsertUser = (u) => fs.doc("users/" + u.login).set(u);
      Store.deleteUser = async (login) => {
        const batch = fs.batch();
        batch.delete(fs.doc("users/" + login));
        const es = await fs.collection("entries").where("login", "==", login).get();
        es.forEach((d) => batch.delete(d.ref));
        return batch.commit();
      };
      Store.setEntry = (e) => fs.doc("entries/" + e.login + "__" + e.date).set(e);
      Store.deleteEntry = (login, date) => fs.doc("entries/" + login + "__" + date).delete();
      Store.addWall = (m) => fs.collection("wall").add(m);
      Store.deleteWall = (id) => fs.doc("wall/" + id).delete();
      Store.setRace = (r) => fs.doc("meta/race").set(r);
    })().catch((err) => {
      console.error("Firebase недоступен, переключаюсь на локальный режим:", err);
      Store.mode = "local";
      LocalEngine();
      return Store.ready;
    });
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("script " + src));
      document.head.appendChild(s);
    });
  }

  if (useFirebase) FirebaseEngine(); else LocalEngine();
  window.Store = Store;
})();
