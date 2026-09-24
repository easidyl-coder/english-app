/* ── 로그인과 진도 동기화 ──
   firebase-config.js 가 채워져 있으면 구글 로그인을 켜고,
   단어장 단계(vb.box)·레벨(vb.level)·최고 연속(vb.best)을 사람별로 서버에 저장합니다.
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
    btn.textContent = user ? ((user.displayName || user.email || "내 계정").split(" ")[0]) : "로그인";
  }

  function local(){
    return { box: get("vb.box", {}) || {}, level: get("vb.level", 0) || 0,
             levelAt: get("vb.at.level", 0) || 0, best: get("vb.best", 0) || 0 };
  }

  /* 두 쪽 기록을 합칩니다: 단어는 더 최근에 바뀐 쪽, 레벨은 더 최근 테스트, 최고 연속은 큰 값 */
  function merge(a, b){
    const box = Object.assign({}, a.box);
    Object.keys(b.box || {}).forEach(k => {
      const x = box[k], y = b.box[k];
      if (!x || (y && (y.t || 0) > (x.t || 0))) box[k] = y;
    });
    const useB = (b.levelAt || 0) > (a.levelAt || 0);
    return { box, level: useB ? b.level : a.level, levelAt: Math.max(a.levelAt || 0, b.levelAt || 0),
             best: Math.max(a.best || 0, b.best || 0) };
  }

  async function pull(){
    pulling = true;
    try{
      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();
      const mine = local();
      const merged = merge(mine, snap.exists ? snap.data() : {});
      const changed = JSON.stringify(merged.box) !== JSON.stringify(mine.box)
        || merged.level !== mine.level || merged.best !== mine.best;
      put("vb.box", merged.box); put("vb.level", merged.level);
      put("vb.at.level", merged.levelAt); put("vb.best", merged.best);
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
  window.onStoreSet = k => {
    if (k === "vb.level") put("vb.at.level", Date.now());
    if (k === "vb.box" || k === "vb.level" || k === "vb.best") push();
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
