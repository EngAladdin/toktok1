'use strict';

/* ═══════ إعداد Firebase ═══════
   مفتاح الـ API هنا مش سري (ده طبيعي في تطبيقات الويب)، لكن لازم تقيّده
   بدومين موقعك من Google Cloud Console وتفعّل App Check.
   لو سجّلت Web app في Firebase Console، استبدل appId بالقيمة اللي بتبدأ بـ :web: */
const firebaseConfig = {
  apiKey: "AIzaSyDXQ7KZUWl_NX5YI-7uUtqIV2lD5bd7wpE",
  authDomain: "tuktuk-app-aladdin-2026-6dc3d.firebaseapp.com",
  databaseURL: "https://tuktuk-app-aladdin-2026-6dc3d-default-rtdb.firebaseio.com",
  projectId: "tuktuk-app-aladdin-2026-6dc3d",
  storageBucket: "tuktuk-app-aladdin-2026-6dc3d.firebasestorage.app",
  messagingSenderId: "442409733059",
  appId: "1:442409733059:android:fec26a500bee46cc5d0b76"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

/* ═══════ ثوابت وحالة ═══════ */
const MIN_PRICE = 10, MAX_PRICE = 1000, SEAT_LIMIT = 2;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const DEFAULT_PLACES = {
  "الحي الأول":   {lat:30.9315, lng:30.4370},
  "الحي الثاني":  {lat:30.9350, lng:30.4420},
  "الحي المتميز": {lat:30.9280, lng:30.4400},
  "أبنى بيتك أ":  {lat:30.9330, lng:30.4330},
  "أبنى بيتك ب":  {lat:30.9340, lng:30.4350},
  "أبنى بيتك ج":  {lat:30.9350, lng:30.4360},
  "السواحلي":     {lat:30.9300, lng:30.4390},
  "الأسيوطي":     {lat:30.9320, lng:30.4410},
  "الحادي عشر":   {lat:30.9345, lng:30.4380},
  "الأربعة عشر":  {lat:30.9360, lng:30.4400}
};

const $ = id => document.getElementById(id);
let UID = null, IS_ADMIN = false, IS_APPROVED = false, MY_NAME = '';
let places = {}, placesSeeded = false, routes = {}, waitingTrips = {}, myTrip = null;
let map = null, placesLayer = null, ridersLayer = null;
let subs = [], waitingSub = null, mineSub = null;
let activeTripId = null, prevActiveId = null, finishing = false;

/* ═══════ أدوات DOM آمنة (من غير innerHTML) ═══════ */
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach(k => n.append(k));
  return n;
}
function actionBtn(text, cls, action, arg, disabled) {
  const b = el('button', { type: 'button', class: 'btn btn-sm ' + cls, 'data-action': action, text });
  if (arg !== undefined) b.setAttribute('data-arg', arg);
  if (disabled) b.disabled = true;
  return b;
}
function badge(gender) {
  return el('span', { class: 'badge ' + (gender === 'أنثى' ? 'b-female' : 'b-male'), text: String(gender) });
}
function tripSummary(t) {
  return [
    badge(t.gender),
    el('b', { text: 'العدد:' }), ' ' + t.count + ' | ',
    el('b', { text: 'من:' }), ' ' + t.from + ' | ',
    el('b', { text: 'إلى:' }), ' ' + t.dest,
    el('br'),
    el('span', { class: 'price', text: t.price + ' جنيه' })
  ];
}
const okId = id => typeof id === 'string' && ID_RE.test(id);
const round3 = x => Math.round(x * 1000) / 1000;

/* ═══════ إدارة المستمعين ═══════ */
function listen(ref, cb, err) {
  const h = ref.on('value', cb, err || (e => console.warn('RTDB', e.code)));
  const sub = { off() { ref.off('value', h); subs = subs.filter(s => s !== sub); } };
  subs.push(sub);
  return sub;
}
function detachAll() { subs.slice().forEach(s => s.off()); }

/* ═══════ التنقل ═══════ */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
  if (id === 'screen-role' && map) setTimeout(() => map.invalidateSize(), 50);
}
function toggleAdmin() { $('adminPanel').classList.toggle('hidden'); }

/* ═══════ الموقع (تقريبي) ═══════ */
function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/* ═══════ الخريطة ═══════ */
function initMap() {
  map = L.map('map').setView([30.9320, 30.4385], 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
  placesLayer = L.layerGroup().addTo(map);
  ridersLayer = L.layerGroup().addTo(map);
}
function drawPlaces() {
  if (!map) return;
  placesLayer.clearLayers();
  Object.entries(places).forEach(([name, p]) => {
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
    const icon = (typeof p.img === 'string' && p.img.startsWith('https://'))
      ? L.icon({ iconUrl: p.img, iconSize: [32, 32] })
      : L.divIcon({ html: '📍', className: 'x', iconSize: [24, 24] });
    L.marker([p.lat, p.lng], { icon }).addTo(placesLayer).bindPopup(el('b', { text: name }));
  });
}
function tripPos(t) {
  if (typeof t.lat === 'number' && typeof t.lng === 'number') return [t.lat, t.lng];
  const p = places[t.from];
  return p ? [p.lat, p.lng] : null;
}
function drawWaitingRiders() {
  if (!map) return;
  ridersLayer.clearLayers();
  Object.entries(waitingTrips).forEach(([id, t]) => {
    const pos = tripPos(t);
    if (!pos) return;
    const pop = el('div', {},
      el('b', { text: 'راكب منتظر' }), el('br'),
      t.gender + ' – ' + t.count + ' – وجهة: ' + t.dest, el('br'),
      actionBtn('تفاصيل المسار المقترح', 'btn-outline', 'showTrip', id));
    L.marker(pos).addTo(ridersLayer).bindPopup(pop);
  });
}
function showTrip(id) {
  const t = waitingTrips[id]; if (!t) return;
  const p = places[t.dest];
  const pos = tripPos(t);
  if (pos && map) map.setView(pos, 16);
  alert('المسار المقترح: من ' + t.from + ' إلى ' + t.dest +
    (p ? ' (إحداثيات: ' + p.lat + ', ' + p.lng + ')' : '') + '\nالسعر: ' + t.price + ' ج');
}

/* ═══════ الأماكن والأسعار ═══════ */
function fillPlaceSelects() {
  const names = Object.keys(places);
  ['rDest', 'rFrom', 'admFrom', 'admTo'].forEach(id => {
    const sel = $(id), cur = sel.value;
    sel.replaceChildren(...names.map(n => el('option', { value: n, text: n })));
    if (names.includes(cur)) sel.value = cur;
  });
  syncPrice();
}
function minPriceFor(from, dest) {
  const rp = routes[from + '→' + dest];
  return (typeof rp === 'number' && rp >= MIN_PRICE) ? rp : MIN_PRICE;
}
function syncPrice() {
  const min = minPriceFor($('rFrom').value, $('rDest').value);
  $('rPrice').min = min;
  $('rPrice').value = min;
}

/* ═══════ الراكب ═══════ */
async function publishTrip() {
  $('geoWarn').classList.add('hidden');
  const dest = $('rDest').value, from = $('rFrom').value;
  if (!dest || !from) return alert('اختر المكان أولاً');
  const geo = await getLocation();
  if (!geo) $('geoWarn').classList.remove('hidden');
  const min = minPriceFor(from, dest);
  const price = Math.min(MAX_PRICE, Math.max(min, parseFloat($('rPrice').value) || min));
  const trip = {
    riderId: UID, gender: $('rGender').value, count: $('rCount').value,
    dest, from, price, status: 'waiting',
    publishedAt: firebase.database.ServerValue.TIMESTAMP,
    seatsTaken: 0, arrivedRider: false, arrivedDriver: false
  };
  if (geo) { trip.lat = round3(geo.lat); trip.lng = round3(geo.lng); }
  finishing = false;
  db.ref('trips/' + UID).set(trip).catch(e => { console.warn(e); alert('تعذر نشر الرحلة، حاول مرة أخرى'); });
}
function cancelTrip() { db.ref('trips/' + UID).remove(); }
function onMyTrip(s) {
  const t = s.val(); myTrip = t;
  const box = $('riderActive');
  if (!t) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  $('riderTripCard').replaceChildren(...tripSummary(t),
    t.driverId ? el('p', { class: 'small', text: 'السائق المختار: ' + (t.driverName || '') }) : '');
  const entries = Object.entries(t.offers || {});
  $('riderOffers').replaceChildren(...(entries.length
    ? entries.map(([did, o]) => el('div', { class: 'offer' },
        el('b', { text: String(o.name) }), ' — يقول: "' + (o.message || 'أقدر أوصلك') + '"',
        actionBtn('✅ اختيار هذا السائق', 'btn-blue', 'chooseDriver', did, !!t.driverId)))
    : [el('p', { class: 'small', text: 'لا عروض بعد، انتظر قليلًا...' })]));
  if (t.status === 'done' && t.arrivedRider && t.arrivedDriver && !finishing) {
    finishing = true;
    alert('✅ تم إنهاء الرحلة بسلام!');
    db.ref('trips/' + UID).remove();
  }
}
function chooseDriver(did) {
  if (!myTrip || !myTrip.offers || !myTrip.offers[did]) return;
  db.ref('trips/' + UID).update({ driverId: did, driverName: myTrip.offers[did].name || '', status: 'picked' })
    .catch(e => { console.warn(e); alert('تعذر اختيار السائق'); });
}
function riderArrive() { db.ref('trips/' + UID + '/arrivedRider').set(true); }

/* ═══════ السائق ═══════ */
function saveDriver() {
  const name = $('driverName').value.trim();
  if (!name) return alert('اكتب اسم علامة توكتوك');
  if (name.length > 30) return alert('الاسم طويل (30 حرف كحد أقصى)');
  db.ref('drivers/' + UID + '/name').set(name).catch(e => { console.warn(e); alert('تعذر الحفظ'); });
}
function onDriverRecord(s) {
  const d = s.val() || {};
  MY_NAME = d.name || '';
  if (MY_NAME && document.activeElement !== $('driverName')) $('driverName').value = MY_NAME;
  IS_APPROVED = d.approved === true;
  $('driverApproval').textContent = !MY_NAME ? 'اكتب اسمك واحفظه أولاً'
    : IS_APPROVED ? '✅ تمت الموافقة على حسابك كسائق' : '⏳ حسابك في انتظار موافقة الأدمن';
  if (IS_APPROVED) startDriverListeners(); else stopDriverListeners();
}
function startDriverListeners() {
  if (!waitingSub) waitingSub = listen(db.ref('trips').orderByChild('status').equalTo('waiting'), s => {
    waitingTrips = s.val() || {}; drawWaitingRiders(); renderDriverTrips();
  });
  if (!mineSub) mineSub = listen(db.ref('trips').orderByChild('driverId').equalTo(UID), onMyDrives);
}
function stopDriverListeners() {
  if (waitingSub) waitingSub.off();
  if (mineSub) mineSub.off();
  waitingSub = mineSub = null; waitingTrips = {};
  drawWaitingRiders(); renderDriverTrips();
  $('driverActive').classList.add('hidden');
}
function renderDriverTrips() {
  const box = $('driverTrips');
  if (!IS_APPROVED) {
    return box.replaceChildren(el('p', { class: 'small',
      text: MY_NAME ? 'بعد موافقة الأدمن هتظهرلك طلبات الركاب هنا.' : 'اكتب اسمك واحفظه عشان تقدر تطلب الموافقة.' }));
  }
  const list = Object.entries(waitingTrips);
  if (!list.length) return box.replaceChildren(el('p', { class: 'small', text: 'لا يوجد ركاب منتظرون حاليًا...' }));
  box.replaceChildren(...list.map(([id, t]) => {
    const offered = !!(t.offers && t.offers[UID]);
    return el('div', { class: 'trip-item' }, el('div', { class: 'info' }, ...tripSummary(t),
      el('div', { class: 'actions' },
        actionBtn(offered ? '✔ تم إرسال عرضك' : '🙋 مثابر على الرحلة', 'btn-yellow', 'offerRide', id, offered),
        actionBtn('🚀 استلام الراكب فورًا', 'btn-green', 'takeTrip', id),
        actionBtn('🗺️ المسار المقترح', 'btn-outline', 'showTrip', id))));
  }));
}
function offerRide(id) {
  if (!okId(id) || !IS_APPROVED || !MY_NAME) return;
  db.ref('trips/' + id + '/offers/' + UID).set({ name: MY_NAME, message: 'مستعد أوصلك الآن' })
    .catch(e => { console.warn(e); alert('تعذر إرسال العرض'); });
}
function takeTrip(id) {
  if (!okId(id) || !IS_APPROVED || !MY_NAME) return;
  db.ref('trips/' + id).update({ driverId: UID, driverName: MY_NAME, status: 'picked' })
    .catch(() => alert('سبقك سائق آخر على هذه الرحلة أو تم إلغاؤها'));
}
function onMyDrives(s) {
  let active = null, id = null;
  s.forEach(c => { if (!active) { active = c.val(); id = c.key; } });
  const box = $('driverActive');
  if (active) {
    box.classList.remove('hidden');
    $('driverTripCard').replaceChildren(...tripSummary(active));
    const n = active.seatsTaken || 0;
    $('seatsBar').replaceChildren('ركاب التوكتوك الآن: ' + n + ' ',
      ...[0, 1].map(i => el('span', { class: 'dot' + (i < n ? ' full' : '') })),
      n >= SEAT_LIMIT ? ' (ممتلئ)' : '');
    if (active.arrivedRider && active.arrivedDriver && active.status !== 'done') {
      db.ref('trips/' + id + '/status').transaction(v => v === 'done' ? undefined : 'done', (err, committed) => {
        if (!err && committed) db.ref('history').push({
          riderId: active.riderId, driverId: UID, from: active.from, to: active.dest,
          price: active.price, at: firebase.database.ServerValue.TIMESTAMP });
      });
    }
  } else {
    box.classList.add('hidden');
    if (prevActiveId) alert('✅ تم الوصول بسلام — العدادات تم تفريغها');
  }
  activeTripId = id; prevActiveId = id;
}
function pickUpPassenger() {
  if (!activeTripId) return alert('لا توجد رحلة نشطة');
  db.ref('trips/' + activeTripId + '/seatsTaken').transaction(v => Math.min(SEAT_LIMIT, (v || 0) + 1));
}
function driverArrive() {
  if (!activeTripId) return alert('لا توجد رحلة نشطة');
  db.ref('trips/' + activeTripId + '/arrivedDriver').set(true);
}

/* ═══════ الأدمن (الحماية الحقيقية في database.rules.json) ═══════ */
function renderAdminState() {
  $('adminLogin').classList.toggle('hidden', IS_ADMIN);
  $('adminTools').classList.toggle('hidden', !IS_ADMIN);
}
async function adminLogin() {
  try {
    const cred = await auth.signInWithEmailAndPassword($('admEmail').value.trim(), $('admPass').value);
    $('admPass').value = '';
    const tok = await cred.user.getIdTokenResult(true);
    if (tok.claims.admin !== true) { await auth.signOut(); alert('هذا الحساب ليس أدمن'); }
  } catch (e) { alert('بيانات الدخول غير صحيحة'); }
}
function adminLogout() { auth.signOut(); }
function renderAdminDrivers(s) {
  const all = Object.entries(s.val() || {}).sort((a, b) => (a[1].approved === true) - (b[1].approved === true));
  $('adminDrivers').replaceChildren(...(all.length ? all.map(([uid, d]) => {
    const ok = d.approved === true;
    return el('div', { class: 'drv-row' },
      el('b', { text: d.name || '(بدون اسم)' }), ' — ' + uid.slice(-6) + ' — ' + (ok ? '✅ موافق عليه' : '⏳ ينتظر'),
      ok ? actionBtn('إلغاء الموافقة', 'btn-red', 'revokeDriver', uid)
         : actionBtn('موافقة', 'btn-green', 'approveDriver', uid));
  }) : [el('p', { class: 'small', text: 'لا يوجد سائقون مسجلون بعد.' })]));
}
function setApproval(uid, val) {
  if (!IS_ADMIN || !okId(uid)) return;
  db.ref('drivers/' + uid + '/approved').set(val).catch(e => { console.warn(e); alert('تعذر التنفيذ'); });
}
async function addPlace() {
  const name = $('admName').value.trim();
  const lat = parseFloat($('admLat').value), lng = parseFloat($('admLng').value);
  const img = $('admImg').value.trim();
  if (!/^[^.$#\[\]\/]{1,40}$/.test(name)) return alert('اسم المكان غير صالح (بدون . $ # [ ] /)');
  if (!isFinite(lat) || !isFinite(lng) || lat < 29 || lat > 32 || lng < 29 || lng > 32) return alert('إحداثيات غير صالحة');
  if (img && !/^https:\/\/\S{1,290}$/.test(img)) return alert('رابط الصورة لازم يبدأ بـ https://');
  try {
    if (!placesSeeded) await db.ref('places').set(DEFAULT_PLACES);
    await db.ref('places/' + name).set(img ? { lat, lng, img } : { lat, lng });
    alert('تم إضافة المكان ✅');
  } catch (e) { console.warn(e); alert('تعذر الحفظ'); }
}
function seedPlaces() {
  if (!confirm('هيتم استبدال كل الأماكن بالأماكن الافتراضية. متأكد؟')) return;
  db.ref('places').set(DEFAULT_PLACES).catch(e => { console.warn(e); alert('تعذر الحفظ'); });
}
function setRoutePrice() {
  const price = parseFloat($('admRoutePrice').value);
  if (!isFinite(price) || price < 1 || price > MAX_PRICE) return alert('سعر غير صالح');
  db.ref('routes/' + $('admFrom').value + '→' + $('admTo').value).set(price)
    .then(() => alert('تم حفظ سعر المسار ✅')).catch(e => { console.warn(e); alert('تعذر الحفظ'); });
}

/* ═══════ الإقلاع ═══════ */
const actions = {
  show, toggleAdmin, publishTrip, cancelTrip, chooseDriver, riderArrive, saveDriver,
  offerRide, takeTrip, showTrip, pickUpPassenger, driverArrive, adminLogin, adminLogout,
  addPlace, seedPlaces, setRoutePrice,
  approveDriver: uid => setApproval(uid, true),
  revokeDriver: uid => setApproval(uid, false)
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (fn) fn(b.dataset.arg);
});
['rFrom', 'rDest'].forEach(id => $(id).addEventListener('change', syncPrice));

function boot() {
  detachAll();
  waitingSub = mineSub = null; waitingTrips = {}; myTrip = null;
  IS_APPROVED = false; MY_NAME = ''; activeTripId = prevActiveId = null; finishing = false;
  const shortId = UID.slice(-6);
  $('riderUid').textContent = 'رقمك: ' + shortId;
  $('driverUid').textContent = 'رقمك: ' + shortId;
  $('driverPid').textContent = 'رقمك التعريفي: ' + shortId;
  $('riderActive').classList.add('hidden');
  $('driverActive').classList.add('hidden');
  renderAdminState(); renderDriverTrips(); drawWaitingRiders();

  listen(db.ref('places'), s => {
    placesSeeded = s.exists();
    places = placesSeeded ? s.val() : DEFAULT_PLACES;
    fillPlaceSelects(); drawPlaces();
  });
  listen(db.ref('routes'), s => { routes = s.val() || {}; syncPrice(); });
  listen(db.ref('trips/' + UID), onMyTrip);
  listen(db.ref('drivers/' + UID), onDriverRecord);
  if (IS_ADMIN) listen(db.ref('drivers'), renderAdminDrivers);
}

initMap();
auth.onAuthStateChanged(async user => {
  if (!user) {
    try { await auth.signInAnonymously(); }
    catch (e) { console.error(e); alert('تعذر الاتصال بالخدمة. تأكد من تفعيل Anonymous Auth في Firebase.'); }
    return;
  }
  try { IS_ADMIN = (await user.getIdTokenResult(true)).claims.admin === true; } catch (e) { IS_ADMIN = false; }
  UID = user.uid;
  boot();
});
