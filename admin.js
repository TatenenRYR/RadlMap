// ===== Helpers / UI =====
const db = firebase.firestore();
const auth = firebase.auth();

const UI = {
  showSection(section) {
    // alle Sektionen verstecken
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    // gewünschte Section zeigen
    document.getElementById(`section-${section}`).style.display = 'block';

    // Tabs aktualisieren
    document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('active-tab'));
    document.getElementById(`tab-${section}`).classList.add('active-tab');

    // ✅ Fix: Leaflet Maps nach dem Umschalten refreshen
    setTimeout(() => {
      document.querySelectorAll('[id^="map-hut-"], [id^="map-spiel-"]').forEach(c => {
        if (c._leaflet_map) {
          c._leaflet_map.invalidateSize();
        }
      });
    }, 250);
  },
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(UI._t);
    UI._t = setTimeout(() => el.classList.add('hidden'), 2200);
  },
  safeDateValue(ts) {
    try {
      if (!ts) return '';
      const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    } catch { return ''; }
  },
  toTimestamp(val) {
    if (!val) return firebase.firestore.FieldValue.delete();
    const d = new Date(val);
    if (isNaN(d)) return firebase.firestore.FieldValue.delete();
    return d;
  },
  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(UI._t);
    UI._t = setTimeout(() => el.classList.add('hidden'), 2200);
  },
  safeDateValue(ts) {
    try {
      if (!ts) return '';
      const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    } catch { return ''; }
  },
  toTimestamp(val) {
    if (!val) return firebase.firestore.FieldValue.delete();
    const d = new Date(val);
    if (isNaN(d)) return firebase.firestore.FieldValue.delete();
    return d;
  }
};

const Admin = {
  start() {
    document.getElementById('login-btn').onclick = () =>
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

    auth.onAuthStateChanged(async user => {
  if (!user) {
    // Login-Formular anzeigen
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    return;
  }

  try {
    const email = user.email;
    console.log("🔐 Prüfe Admin für:", email);

    // Admin-Dokument per Email-ID laden
    const docSnap = await db.collection("admins").doc(email).get();

    if (!docSnap.exists) {
      console.warn("❌ Kein Admin-Eintrag gefunden für:", email);
      alert("Kein Zugriff! Diese Email ist nicht als Admin eingetragen.");
      await auth.signOut();
      document.getElementById('login-section').classList.remove('hidden');
      document.getElementById('dashboard').classList.add('hidden');
      return;
    }

    // Rolle prüfen (falls vorhanden)
    const data = docSnap.data();
    if (data.role && data.role !== "admin") {
      console.warn("❌ Rolle nicht admin:", data.role);
      alert("Kein Zugriff! Rolle nicht ausreichend.");
      await auth.signOut();
      document.getElementById('login-section').classList.remove('hidden');
      document.getElementById('dashboard').classList.add('hidden');
      return;
    }

    // ✅ Zugriff erlaubt
    console.log("✅ Zugriff erlaubt:", email);
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.displayName || email;

    // Module laden
    Huts.load();
    Playgrounds.load();
    Support.load();

  } catch (err) {
    console.error("⚠️ Admin-Check Fehler:", err);
    alert("Fehler beim Admin-Check.");
    await auth.signOut();
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }
});
  },

  logout() { auth.signOut().then(() => location.reload()); },

  reloadAll() {
    Huts.load(); Playgrounds.load(); Support.load();
    UI.toast('Neu geladen');
  }
};

// ===== Hütten =====
const Huts = {
  cache: [],
  async load() {
    try {
      const snap = await db.collection('eierhuetten').orderBy('name').get();
      Huts.cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      Huts.render();
    } catch (e) {
      console.warn('loadHuts error', e);
      UI.toast('Fehler beim Laden der Hütten');
    }
  },
  render() {
    const list = document.getElementById('hut-list');
    list.innerHTML = '';
    const search = (document.getElementById('searchHut').value || '').toLowerCase();
    const status = document.getElementById('statusHut').value || '';

    const filtered = Huts.cache.filter(d =>
      (!search || (d.name || '').toLowerCase().includes(search)) &&
      (!status || d.status === status)
    );

    filtered.forEach(d => {
      const el = document.createElement('div');
      el.className = 'card';
      const lat = d.location?.latitude ?? 52.5;
      const lng = d.location?.longitude ?? 7.5;

      const fotosHtml = Array.isArray(d.fotos) && d.fotos.length
        ? d.fotos.map((f, i) => {
            const url = (typeof f === 'string') ? f : (f?.url || '');
            const status = (typeof f === 'string') ? 'freigegeben' : (f?.status || 'offen');
            return `
              <div class="photo-tile">
                <img src="${url}" alt="Foto">
                <button class="photo-x" title="Foto löschen" onclick="Huts.deletePhoto('${d.id}', ${i})">✖</button>
                <div class="text-[11px] text-gray-500 mt-1">${status}</div>
                ${status !== 'freigegeben' ? `
                  <button class="mt-1 px-2 py-0.5 rounded bg-green-600 text-white text-xs"
                    onclick="Huts.approvePhoto('${d.id}', ${i})">✅ Freigeben</button>` : ''
                }
              </div>`;
          }).join('')
        : '<div class="text-sm text-gray-400">Keine Fotos</div>';

      el.innerHTML = `
        <div class="flex flex-wrap gap-3">
          <div class="grow">
            <label class="label">Name</label>
            <input class="field" value="${d.name || ''}" 
              onchange="Huts.update('${d.id}', {name:this.value})">

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label class="label">Status</label>
                <select class="field" onchange="Huts.update('${d.id}', {status:this.value})">
                  ${['offen','angenommen','abgelehnt'].map(s => `<option ${s===d.status?'selected':''}>${s}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label">Öffnungszeiten</label>
                <input class="field" value="${d.oeffnungszeiten || ''}"
                  onchange="Huts.update('${d.id}', {oeffnungszeiten:this.value})">
              </div>
              <div>
                <label class="label">Strom</label>
                <select class="field" onchange="Huts.update('${d.id}', {strom:this.value})">
                  ${['Ja','Nein'].map(o => `<option ${o===d.strom?'selected':''}>${o}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label">Sitzplätze</label>
                <select class="field" onchange="Huts.update('${d.id}', {sitzplaetze:this.value})">
                  ${['Ja','Nein'].map(o => `<option ${o===d.sitzplaetze?'selected':''}>${o}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label">Abo Monate</label>
                <input class="field" type="number" value="${d.aboMonate ?? ''}"
                  onchange="Huts.update('${d.id}', {aboMonate: (this.value?parseInt(this.value):firebase.firestore.FieldValue.delete())})">
              </div>
              <div>
                <label class="label">Abo Start</label>
                <input class="field" type="date" value="${UI.safeDateValue(d.aboStart)}"
                  onchange="Huts.update('${d.id}', {aboStart: UI.toTimestamp(this.value)})">
              </div>
              <div>
                <label class="label">PayPal Subscription ID</label>
                <input class="field" value="${d.paypalSubscriptionId || ''}"
                  onchange="Huts.update('${d.id}', {paypalSubscriptionId:this.value})">
              </div>
              <div>
                <label class="label">Extras</label>
                <textarea class="field" rows="2"
                  onchange="Huts.update('${d.id}', {extras:this.value})">${d.extras || ''}</textarea>
              </div>
            </div>

            <div id="map-hut-${d.id}" class="minimap"></div>

            <div class="mt-3 text-xs text-gray-600">
              <div>📅 Erstellt am: ${d.erstelltAm?.toDate?.().toLocaleString('de-DE') || '-'}</div>
              <div>🔒 Datenschutz: ${d.datenschutzZustimmung?.durch || '-'} (${d.datenschutzZustimmung?.bestätigtAm?.toDate?.().toLocaleString('de-DE') || '-'})</div>
              <div>👤 User: ${d.userId || '-'}</div>
            </div>
          </div>

          <div class="min-w-[240px]">
            <div class="font-semibold mb-1">📷 Fotos</div>
            ${fotosHtml}
          </div>
        </div>

        <div class="pt-3 border-t flex gap-2">
          <button class="px-3 py-2 rounded bg-red-600 text-white" onclick="Huts.remove('${d.id}')">🗑️ Hütte löschen</button>
        </div>
      `;

      list.appendChild(el);
      setTimeout(() => renderHutMap(`map-hut-${d.id}`, d.id, lat, lng), 100);
    });
  },
  async update(id, patch) {
    confirmUpdate('eierhuetten', id, patch);
  },
  async deletePhoto(id, index) {
    try {
      const ref = db.collection('eierhuetten').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return;
      const d = snap.data();
      if (!Array.isArray(d.fotos)) return;
      d.fotos.splice(index, 1);
      await ref.update({ fotos: d.fotos });
      UI.toast('Foto gelöscht');
      Huts.load();
    } catch (e) { console.warn(e); UI.toast('Fehler beim Löschen'); }
  },
  async approvePhoto(id, index) {
    try {
      const ref = db.collection('eierhuetten').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return;
      const d = snap.data();
      if (!Array.isArray(d.fotos)) return;
      if (typeof d.fotos[index] === 'string') {
        UI.toast('Foto ist bereits freigegeben');
        return;
      }
      d.fotos[index].status = 'freigegeben';
      await ref.update({ fotos: d.fotos });
      UI.toast('Foto freigegeben');
      Huts.load();
    } catch (e) { console.warn(e); UI.toast('Fehler beim Freigeben'); }
  },
  async remove(id) {
    if (!confirm('Hütte wirklich löschen?')) return;
    try { await db.collection('eierhuetten').doc(id).delete(); Huts.load(); UI.toast('Gelöscht'); }
    catch (e) { console.warn(e); UI.toast('Fehler beim Löschen'); }
  }
};
// ===== Spielplätze =====
const Playgrounds = {
  cache: [],
  async load() {
    try {
      const snap = await db.collection('spielplaetze').orderBy('name').get();
      Playgrounds.cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      Playgrounds.render();
    } catch (e) {
      console.warn('loadSpielplaetze error', e);
      UI.toast('Fehler beim Laden der Spielplätze');
    }
  },
  render() {
    const list = document.getElementById('spielplatz-list');
    list.innerHTML = '';
    const search = (document.getElementById('searchSpiel').value || '').toLowerCase();
    const status = document.getElementById('statusSpiel').value || '';

    const filtered = Playgrounds.cache.filter(d =>
      (!search || (d.name || '').toLowerCase().includes(search)) &&
      (!status || d.status === status)
    );

    filtered.forEach(d => {
      const el = document.createElement('div');
      el.className = 'card';
      const lat = d.location?.latitude ?? 52.5;
      const lng = d.location?.longitude ?? 7.5;

      const fotosHtml = Array.isArray(d.fotos) && d.fotos.length
        ? d.fotos.map((f, i) => {
            const url = (typeof f === 'string') ? f : (f?.url || '');
            const status = (typeof f === 'string') ? 'freigegeben' : (f?.status || 'offen');
            return `
              <div class="photo-tile">
                <img src="${url}" alt="Foto">
                <button class="photo-x" title="Foto löschen" onclick="Playgrounds.deletePhoto('${d.id}', ${i})">✖</button>
                <div class="text-[11px] text-gray-500 mt-1">${status}</div>
                ${status !== 'freigegeben' ? `
                  <button class="mt-1 px-2 py-0.5 rounded bg-green-600 text-white text-xs"
                    onclick="Playgrounds.approvePhoto('${d.id}', ${i})">✅ Freigeben</button>` : ''
                }
              </div>`;
          }).join('')
        : '<div class="text-sm text-gray-400">Keine Fotos</div>';

      el.innerHTML = `
        <div class="flex flex-wrap gap-3">
          <div class="grow">
            <label class="label">Name</label>
            <input class="field" value="${d.name || ''}" 
              onchange="Playgrounds.update('${d.id}', {name:this.value})">

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div>
                <label class="label">Status</label>
                <select class="field" onchange="Playgrounds.update('${d.id}', {status:this.value})">
                  ${['offen','angenommen','abgelehnt'].map(s => `<option ${s===d.status?'selected':''}>${s}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label">Sitzplätze</label>
                <select class="field" onchange="Playgrounds.update('${d.id}', {sitz:this.value})">
                  ${['Ja','Nein'].map(o => `<option ${o===d.sitz?'selected':''}>${o}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="label">Typ</label>
                <input class="field" value="${d.typ || ''}"
                  onchange="Playgrounds.update('${d.id}', {typ:this.value})">
              </div>
              <div>
                <label class="label">Tags (Komma-getrennt)</label>
                <input class="field" value="${(d.tags||[]).join(', ')}"
                  onchange="Playgrounds.update('${d.id}', {tags:this.value.split(',').map(t=>t.trim()).filter(Boolean)})">
              </div>
            </div>

            <div id="map-spiel-${d.id}" class="h-48 w-full mt-3"></div>

            <div class="mt-3 text-xs text-gray-600">
              <div>📅 Erstellt am: ${d.erstelltAm?.toDate?.().toLocaleString('de-DE') || '-'}</div>
              <div>👤 User: ${d.userId || '-'}</div>
            </div>
          </div>

          <div class="min-w-[240px]">
            <div class="font-semibold mb-1">📷 Fotos</div>
            ${fotosHtml}
          </div>
        </div>
        
        <div class="pt-3 border-t flex gap-2">
          <button class="px-3 py-2 rounded bg-red-600 text-white" onclick="Playgrounds.remove('${d.id}')">🗑️ Spielplatz löschen</button>
        </div>
      `;

      list.appendChild(el);
      setTimeout(() => renderPlaygroundMap(`map-spiel-${d.id}`, d.id, lat, lng), 100);
    });
  },
  async update(id, patch) {
   confirmUpdate('spielplaetze', id, patch);
  },
  async deletePhoto(id, index) {
    try {
      const ref = db.collection('spielplaetze').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return;
      const d = snap.data();
      if (!Array.isArray(d.fotos)) return;
      d.fotos.splice(index, 1);
      await ref.update({ fotos: d.fotos });
      UI.toast('Foto gelöscht');
      Playgrounds.load();
    } catch (e) { console.warn(e); UI.toast('Fehler beim Löschen'); }
  },
  async approvePhoto(id, index) {
    try {
      const ref = db.collection('spielplaetze').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return;
      const d = snap.data();
      if (!Array.isArray(d.fotos)) return;
      if (typeof d.fotos[index] === 'string') {
        UI.toast('Foto ist bereits freigegeben');
        return;
      }
      d.fotos[index].status = 'freigegeben';
      await ref.update({ fotos: d.fotos });
      UI.toast('Foto freigegeben');
      Playgrounds.load();
    } catch (e) { console.warn(e); UI.toast('Fehler beim Freigeben'); }
  },
  async remove(id) {
    if (!confirm('Spielplatz wirklich löschen?')) return;
    try { await db.collection('spielplaetze').doc(id).delete(); Playgrounds.load(); UI.toast('Gelöscht'); }
    catch (e) { console.warn(e); UI.toast('Fehler beim Löschen'); }
  }
};

// ===== Support =====
const Support = {
  cache: [],
  async load() {
    try {
      const snap = await db.collection('supportTickets').orderBy('createdAt','desc').get();
      Support.cache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      Support.render();
    } catch (e) {
      console.warn('loadSupport error', e);
      UI.toast('Fehler beim Laden der Tickets');
    }
  },
  render() {
    const tbody = document.getElementById('support-tickets-body');
    tbody.innerHTML = '';
    const search = (document.getElementById('searchSupport').value || '').toLowerCase();
    const status = document.getElementById('statusSupport').value || '';

    const filtered = Support.cache.filter(t =>
      (!search || (t.email || '').toLowerCase().includes(search) || (t.message || '').toLowerCase().includes(search)) &&
      (!status || (t.status || 'offen') === status)
    );

    filtered.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="px-4 py-2 text-xs">${t.createdAt?.toDate?.().toLocaleString('de-DE') || '-'}</td>
        <td class="px-4 py-2 text-xs">${t.email || '-'}</td>
        <td class="px-4 py-2">${t.message || ''}</td>
        <td class="px-4 py-2">
          <select class="border rounded p-1 text-sm" onchange="Support.update('${t.id}', {status:this.value})">
            ${['offen','in_bearbeitung','geschlossen'].map(s => `<option ${s=== (t.status||'offen') ? 'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td class="px-4 py-2">
          <button class="bg-red-600 text-white px-2 py-1 rounded text-sm" onclick="Support.remove('${t.id}')">🗑️</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },
  async update(id, patch) {
   confirmUpdate('supportTickets', id, patch);
  },
  async remove(id) {
    if (!confirm('Ticket wirklich löschen?')) return;
    try { await db.collection('supportTickets').doc(id).delete(); Support.load(); UI.toast('Ticket gelöscht'); }
    catch (e) { console.warn(e); UI.toast('Fehler beim Löschen'); }
  }
};
function renderHutMap(containerId, hutId, lat, lng) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const map = L.map(containerId, { zoomControl: false }).setView([lat, lng], 13);
  container._leaflet_map = map;  // 👈 Map-Instanz am DOM-Element merken

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  const marker = L.marker([lat, lng], { draggable: true }).addTo(map);

  setTimeout(() => map.invalidateSize(), 400);

  marker.on("dragend", async () => {
    const pos = marker.getLatLng();
    if (confirm("Neue Position speichern?")) {
      await db.collection("eierhuetten").doc(hutId).update({
        location: new firebase.firestore.GeoPoint(pos.lat, pos.lng)
      });
      UI.toast("Position gespeichert");
    } else {
      marker.setLatLng([lat || 52.5, lng || 7.5]);
    }
  });
}
function renderPlaygroundMap(containerId, spielId, lat, lng) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const map = L.map(containerId, { zoomControl: true }).setView([lat || 52.5, lng || 7.5], 15);
  container._leaflet_map = map;  // 👈 merken

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a>',
    maxZoom: 19
  }).addTo(map);

  const marker = L.marker([lat || 52.5, lng || 7.5], { draggable: true }).addTo(map);

  setTimeout(() => map.invalidateSize(), 400);

  marker.on("dragend", async () => {
    const pos = marker.getLatLng();
    if (confirm("Neue Position speichern?")) {
      await db.collection("spielplaetze").doc(spielId).update({
        location: new firebase.firestore.GeoPoint(pos.lat, pos.lng)
      });
      UI.toast("Position gespeichert");
    } else {
      marker.setLatLng([lat || 52.5, lng || 7.5]);
    }
  });
}

async function confirmUpdate(collection, id, patch) {
  if (!confirm("Änderung wirklich speichern?")) return;
  try {
    await db.collection(collection).doc(id).update(patch);
    UI.toast("Gespeichert");
  } catch (e) {
    console.warn(e);
    UI.toast("Fehler beim Speichern");
  }
}

// ===== Boot =====
window.Admin = Admin;
window.UI = UI;
window.Huts = Huts;
window.Playgrounds = Playgrounds;
window.Support = Support;

document.getElementById('login-btn').onclick = () =>
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());

    auth.onAuthStateChanged(async user => {
  if (!user) {
    // Login-Formular anzeigen
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    return;
  }

  try {
    const email = user.email;
    console.log("🔐 Prüfe Admin für:", email);

    // Admin-Dokument per Email-ID laden
    const docSnap = await db.collection("admins").doc(email).get();

    if (!docSnap.exists) {
      console.warn("❌ Kein Admin-Eintrag gefunden für:", email);
      alert("Kein Zugriff! Diese Email ist nicht als Admin eingetragen.");
      await auth.signOut();
      document.getElementById('login-section').classList.remove('hidden');
      document.getElementById('dashboard').classList.add('hidden');
      return;
    }

    // Rolle prüfen (falls vorhanden)
    const data = docSnap.data();
    if (data.role && data.role !== "admin") {
      console.warn("❌ Rolle nicht admin:", data.role);
      alert("Kein Zugriff! Rolle nicht ausreichend.");
      await auth.signOut();
      document.getElementById('login-section').classList.remove('hidden');
      document.getElementById('dashboard').classList.add('hidden');
      return;
    }

    // ✅ Zugriff erlaubt
    console.log("✅ Zugriff erlaubt:", email);
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.displayName || email;

    // Module laden
    Huts.load();
    Playgrounds.load();
    Support.load();

  } catch (err) {
    console.error("⚠️ Admin-Check Fehler:", err);
    alert("Fehler beim Admin-Check.");
    await auth.signOut();
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }
});
/*document.getElementById('login-btn')?.addEventListener('click', () =>
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
);

auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.displayName || user.email || 'Angemeldet';
    Huts.load(); Playgrounds.load(); Support.load();
  } else {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }
});*/
