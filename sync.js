/* ── 로그인과 진도 동기화 ──
   firebase-config.js 가 채워져 있으면 구글 로그인을 켜고, 사람별로 서버에 저장합니다:
   단어장 단계(vb.box)·레벨(vb.level)·최고 연속(vb.best)·레슨 진도(vb.day)·막혔던 말 메모(vb.notes)·
   하루 목표(vb.goal)·날짜별 공부량(vb.log).
   앱을 업데이트해도 로그인과 이 기록은 그대로입니다. 앱을 지웠다 다시 깔거나 휴대폰을 바꿔도
   같은 구글 계정으로 로그인하면 서버 기록을 합쳐서 되살립니다.
   설정이 비어 있으면 아무것도 하지 않고, 지금처럼 기기 안에만 저장합니다. */
(function(){
  const cfg = window.FIREBASE_CONFIG;
  const btn = document.getElementById("hAcct");
  if (!cfg){ if (btn) btn.hidden = true; return; }

  const V = "10.12.2";
  const SDK = ["app", "auth", "firestore"].map(n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}-compat.js`);
  const get = (k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch(e){ return f; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
  let auth, db, user = null, timer = null, pulling = false;

  function load(i){
    if (i >= SDK.length) return start();
    const s = document.createElement("script");
    s.src = SDK[i]; s.onload = () => load(i + 1);
    s.onerror = () => { if (btn) { btn.textContent = "오프라인"; btn.disabled = true; } };
    document.head.appendChild(s);
  }

  function label(){
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = user ? "내 계정" : "로그인";          // 이름·이메일은 화면에 띄우지 않음 (캡처해 공유할 때 개인정보가 보이지 않게)
  }

  const obj = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const num = v => Number.isFinite(+v) ? +v : 0;
  function local(){
    const notes = get("vb.notes", []), goal = get("vb.goal", null);
    return { box: obj(get("vb.box", {})), level: num(get("vb.level", 0)),
             levelAt: num(get("vb.at.level", 0)), best: num(get("vb.best", 0)),
             day: Math.max(1, num(get("vb.day", 1))),
             notes: Array.isArray(notes) ? notes : [], notesAt: num(get("vb.at.notes", 0)),
             goal: goal && Number.isFinite(goal.w) && Number.isFinite(goal.s) ? { w: goal.w, s: goal.s } : null,
             goalAt: num(get("vb.at.goal", 0)),
             log: obj(get("vb.log", {})) };
  }

  /* 두 쪽(이 기기 a · 서버 b) 기록을 합칩니다. 어느 쪽 기록도 함부로 지우지 않는 쪽으로 합칩니다.
     단어: 단어마다 더 최근에 바뀐 쪽 · 레벨·메모·하루 목표: 더 최근에 바꾼 쪽 ·
     최고 연속·레슨 진도: 큰 값 · 날짜별 공부량: 날짜·항목마다 큰 값 */
  function merge(a, b){
    const box = Object.assign({}, obj(a.box));
    Object.keys(obj(b.box)).forEach(k => {
      const x = box[k], y = b.box[k];
      if (!x || (y && (y.t || 0) > (x.t || 0))) box[k] = y;
    });
    const useLv = num(b.levelAt) > num(a.levelAt);
    const bNotes = Array.isArray(b.notes) ? b.notes : null;
    const useNotes = bNotes && (num(b.notesAt) > num(a.notesAt)
      || (!a.notes.length && !num(a.notesAt) && bNotes.length));   // 이 기기에 메모를 쓴 적이 없을 때만 서버 것을 그대로
    const bGoal = b.goal && Number.isFinite(b.goal.w) && Number.isFinite(b.goal.s) ? b.goal : null;
    const useGoal = bGoal && (!a.goal || num(b.goalAt) > num(a.goalAt));
    const log = Object.assign({}, obj(a.log));
    Object.keys(obj(b.log)).forEach(k => {
      const x = obj(log[k]), y = obj(b.log[k]), d = {};
      ["w", "s", "t", "n"].forEach(f => { const v = Math.max(num(x[f]), num(y[f])); if (v) d[f] = v; });
      log[k] = d;
    });
    return { box,
             level: useLv ? num(b.level) : a.level, levelAt: Math.max(num(a.levelAt), num(b.levelAt)),
             best: Math.max(num(a.best), num(b.best)),
             day: Math.max(num(a.day), num(b.day), 1),
             notes: useNotes ? bNotes : a.notes, notesAt: Math.max(num(a.notesAt), num(b.notesAt)),
             goal: useGoal ? { w: bGoal.w, s: bGoal.s } : a.goal, goalAt: Math.max(num(a.goalAt), num(b.goalAt)),
             log };
  }

  async function pull(){
    pulling = true;
    try{
      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();
      const mine = local();
      const merged = merge(mine, snap.exists ? snap.data() : {});
      const same = k => JSON.stringify(merged[k]) === JSON.stringify(mine[k]);
      const changed = !["box", "level", "best", "day", "notes", "goal", "log"].every(same);
      put("vb.box", merged.box); put("vb.level", merged.level); put("vb.at.level", merged.levelAt);
      put("vb.best", merged.best); put("vb.day", merged.day);
      put("vb.notes", merged.notes); put("vb.at.notes", merged.notesAt);
      if (merged.goal){ put("vb.goal", merged.goal); put("vb.at.goal", merged.goalAt); }
      put("vb.log", merged.log);
      await ref.set(Object.assign({ name: user.displayName || "", updatedAt: Date.now() }, merged));
      if (changed) location.reload();          // 합친 기록으로 화면을 다시 그립니다
    } catch(e){ console.warn("동기화 실패", e); }
    pulling = false;
  }

  function push(){
    if (!user || pulling) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      db.collection("users").doc(user.uid)
        .set(Object.assign({ name: user.displayName || "", updatedAt: Date.now() }, local()))
        .catch(e => console.warn("저장 실패", e));
    }, 1500);
  }
  const SYNCED = ["vb.box", "vb.level", "vb.best", "vb.day", "vb.notes", "vb.goal", "vb.log"];
  window.onStoreSet = k => {
    if (k === "vb.level") put("vb.at.level", Date.now());    // 언제 바꿨는지 남겨야 두 기기 중 최신을 고릅니다
    if (k === "vb.notes") put("vb.at.notes", Date.now());
    if (k === "vb.goal") put("vb.at.goal", Date.now());
    if (SYNCED.includes(k)) push();
  };

  /* 로그인 상태를 앱 화면(index.html)에 알려 줍니다: window.appUser, 'authchange' 이벤트 */
  const fire = () => window.dispatchEvent(new Event("authchange"));

  function start(){
    firebase.initializeApp(cfg);
    auth = firebase.auth(); db = firebase.firestore();
    auth.onAuthStateChanged(u => {
      user = u;
      window.appUser = u ? { uid: u.uid, name: u.displayName || "", email: u.email || "" } : null;
      label();
      if (u) pull().finally(fire); else fire();          // 서버 기록(레벨 포함)을 합친 뒤에 알림
    });
    auth.getRedirectResult().catch(() => {});
    label();
  }

  async function signIn(){
    if (!auth){ alert("로그인을 준비하고 있어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요."); return; }
    const p = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(p); }
    catch(e){
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment"))
        auth.signInWithRedirect(p);
      else if (e && e.code !== "auth/popup-closed-by-user") alert("로그인하지 못했어요: " + (e.message || e));
    }
  }
  window.appSignIn = signIn;

  if (btn) btn.addEventListener("click", () => {
    if (!auth) return;
    if (user){ if (confirm("로그아웃할까요? 이 기기에 저장된 진도는 그대로 남아요.")) auth.signOut(); return; }
    signIn();
  });

  if (btn){ btn.hidden = false; btn.textContent = "…"; btn.disabled = true; }
  load(0);
})();
