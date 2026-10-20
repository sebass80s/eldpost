(() => {
  'use strict';

  const STORAGE_KEY = 'eldpost.state.v1';
  const MIN_SOLDIERS = 4;
  const MAX_SOLDIERS = 20;
  const DRIVER_REST_MINUTES = 360;
  const REST_TARGET_MINUTES = 240;
  const DEFAULT_COUNT = 12;

  const $ = id => document.getElementById(id);
  const els = {
    soldierCount: $('soldierCount'), soldierList: $('soldierList'), startDate: $('startDate'), nightCount: $('nightCount'),
    fireStart: $('fireStart'), fireEnd: $('fireEnd'), fireDuration: $('fireDuration'),
    patrolEnabled: $('patrolEnabled'), patrolStart: $('patrolStart'), patrolEnd: $('patrolEnd'), patrolDuration: $('patrolDuration'), patrolFields: $('patrolFields'),
    guardEnabled: $('guardEnabled'), guardStart: $('guardStart'), guardEnd: $('guardEnd'), guardDuration: $('guardDuration'), guardFields: $('guardFields'),
    allowPcFire: $('allowPcFire'), allowPcPatrol: $('allowPcPatrol'), allowStfFire: $('allowStfFire'), allowStfPatrol: $('allowStfPatrol'),
    tentMap: $('tentMap'), generateButton: $('generateButton'), generateMessage: $('generateMessage'), resetButton: $('resetButton'),
    resultSection: $('resultSection'), resultTitle: $('resultTitle'), nightTabs: $('nightTabs'), scheduleWarnings: $('scheduleWarnings'), scheduleTable: $('scheduleTable'), restSummary: $('restSummary'), resultTentMap: $('resultTentMap'), copyButton: $('copyButton'),
    shareButton: $('shareButton'), sharePanel: $('sharePanel'), shareUrl: $('shareUrl'), shareCopyButton: $('shareCopyButton'), nativeShareButton: $('nativeShareButton'), shareQr: $('shareQr'), shareQrHelp: $('shareQrHelp'), shareStatus: $('shareStatus'),
    soldierTemplate: $('soldierTemplate')
  };

  let activeNight = 0;
  let saveTimer = null;
  let state = loadState() || makeDefaultState();

  function todayLocal() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  function makeSoldier(index) {
    return { id: crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${index}`, name: '', sleepPlace: index + 1, driver: false, pc: false, stf: false, excluded: false };
  }

  function makeDefaultState() {
    return {
      version: 1,
      settings: {
        startDate: todayLocal(), nightCount: 3,
        fireStart: '22:00', fireEnd: '06:00', fireDuration: 60,
        patrolEnabled: true, patrolStart: '22:00', patrolEnd: '06:00', patrolDuration: 60,
        guardEnabled: false, guardStart: '22:00', guardEnd: '06:00', guardDuration: 60,
        allowPcFire: false, allowPcPatrol: false, allowStfFire: false, allowStfPatrol: false
      },
      soldiers: Array.from({ length: DEFAULT_COUNT }, (_, i) => makeSoldier(i)),
      generated: null
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.soldiers)) return null;
      parsed.settings ||= {};
      for (const [role, oldKey] of [['Pc','allowPcDuties'], ['Stf','allowStfDuties']]) {
        for (const key of [`allow${role}Fire`, `allow${role}Patrol`]) {
          if (typeof parsed.settings[key] !== 'boolean') parsed.settings[key] = !!parsed.settings[oldKey];
        }
      }
      return parsed;
    } catch { return null; }
  }

  function saveStateSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), 120);
  }

  function initOptions() {
    for (let n = MIN_SOLDIERS; n <= MAX_SOLDIERS; n++) els.soldierCount.add(new Option(String(n), String(n)));
    for (let n = 1; n <= 14; n++) els.nightCount.add(new Option(`${n} ${n === 1 ? 'natt' : 'nätter'}`, String(n)));
  }

  function syncControlsFromState() {
    const s = state.settings;
    els.soldierCount.value = String(state.soldiers.length);
    els.startDate.value = s.startDate || todayLocal();
    els.nightCount.value = String(s.nightCount || 1);
    els.fireStart.value = s.fireStart; els.fireEnd.value = s.fireEnd; els.fireDuration.value = String(s.fireDuration);
    els.patrolEnabled.checked = !!s.patrolEnabled; els.patrolStart.value = s.patrolStart; els.patrolEnd.value = s.patrolEnd; els.patrolDuration.value = String(s.patrolDuration);
    els.guardEnabled.checked = !!s.guardEnabled; els.guardStart.value = s.guardStart; els.guardEnd.value = s.guardEnd; els.guardDuration.value = String(s.guardDuration);
    for (const key of ['allowPcFire', 'allowPcPatrol', 'allowStfFire', 'allowStfPatrol']) els[key].checked = !!s[key];
    updateOptionalFields();
  }

  function readSettingsFromControls() {
    state.settings = {
      startDate: els.startDate.value || todayLocal(), nightCount: Number(els.nightCount.value),
      fireStart: els.fireStart.value, fireEnd: els.fireEnd.value, fireDuration: Number(els.fireDuration.value),
      patrolEnabled: els.patrolEnabled.checked, patrolStart: els.patrolStart.value, patrolEnd: els.patrolEnd.value, patrolDuration: Number(els.patrolDuration.value),
      guardEnabled: els.guardEnabled.checked, guardStart: els.guardStart.value, guardEnd: els.guardEnd.value, guardDuration: Number(els.guardDuration.value),
      allowPcFire: els.allowPcFire.checked, allowPcPatrol: els.allowPcPatrol.checked,
      allowStfFire: els.allowStfFire.checked, allowStfPatrol: els.allowStfPatrol.checked
    };
    state.generated = null;
    sharedUrl='';
    els.sharePanel.classList.add('hidden');
    saveStateSoon();
  }

  function updateOptionalFields() {
    els.patrolFields.classList.toggle('disabled-fields', !els.patrolEnabled.checked);
    els.guardFields.classList.toggle('disabled-fields', !els.guardEnabled.checked);
  }

  function resizeSoldierList(count) {
    count = Math.max(MIN_SOLDIERS, Math.min(MAX_SOLDIERS, count));
    const old = state.soldiers.length;
    if (count > old) {
      for (let i = old; i < count; i++) state.soldiers.push(makeSoldier(i));
    } else if (count < old) {
      state.soldiers = state.soldiers.slice(0, count);
    }
    normalizeSleepPlaces();
    state.generated = null;
    sharedUrl=''; els.sharePanel.classList.add('hidden');
    renderSoldiers(); renderTentMaps(); saveStateSoon();
  }

  function normalizeSleepPlaces() {
    const used = new Set();
    for (const soldier of state.soldiers) {
      const p = Number(soldier.sleepPlace);
      if (p >= 1 && p <= state.soldiers.length && !used.has(p)) used.add(p);
      else soldier.sleepPlace = null;
    }
    const free = [];
    for (let p = 1; p <= state.soldiers.length; p++) if (!used.has(p)) free.push(p);
    for (const soldier of state.soldiers) if (!soldier.sleepPlace) soldier.sleepPlace = free.shift();
  }

  function renderSoldiers() {
    els.soldierList.innerHTML = '';
    state.soldiers.forEach(soldier => {
      const node = els.soldierTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = soldier.id;
      const badge = node.querySelector('.place-badge');
      const name = node.querySelector('.soldier-name');
      const place = node.querySelector('.sleep-place');
      const driver = node.querySelector('.role-driver');
      const pc = node.querySelector('.role-pc');
      const stf = node.querySelector('.role-stf');
      const excluded = node.querySelector('.role-excluded');
      badge.textContent = soldier.sleepPlace;
      name.value = soldier.name;
      for (let p = 1; p <= state.soldiers.length; p++) place.add(new Option(`Plats ${p}`, String(p)));
      place.value = String(soldier.sleepPlace);
      driver.checked = !!soldier.driver; pc.checked = !!soldier.pc; stf.checked = !!soldier.stf; excluded.checked = !!soldier.excluded;

      name.addEventListener('input', () => { soldier.name = name.value; invalidateGenerated(); renderTentMaps(); });
      place.addEventListener('change', () => {
        const target = Number(place.value); const previous = soldier.sleepPlace;
        const other = state.soldiers.find(s => s.id !== soldier.id && s.sleepPlace === target);
        if (other) other.sleepPlace = previous;
        soldier.sleepPlace = target; invalidateGenerated(); renderSoldiers(); renderTentMaps();
      });
      driver.addEventListener('change', () => { soldier.driver = driver.checked; invalidateGenerated(); renderTentMaps(); });
      pc.addEventListener('change', () => { soldier.pc = pc.checked; if (pc.checked) soldier.stf = false; invalidateGenerated(); renderSoldiers(); renderTentMaps(); });
      stf.addEventListener('change', () => { soldier.stf = stf.checked; if (stf.checked) soldier.pc = false; invalidateGenerated(); renderSoldiers(); renderTentMaps(); });
      excluded.addEventListener('change', () => { soldier.excluded = excluded.checked; invalidateGenerated(); renderTentMaps(); });
      els.soldierList.appendChild(node);
    });
  }

  function invalidateGenerated() {
    state.generated = null;
    sharedUrl = '';
    els.sharePanel.classList.add('hidden');
    els.resultSection.classList.add('hidden');
    saveStateSoon();
  }

  function polar(cx, cy, r, deg) {
    const rad = deg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function ringSegmentPath(cx, cy, outerR, innerR, a1, a2) {
    const o1 = polar(cx, cy, outerR, a1), o2 = polar(cx, cy, outerR, a2);
    const i2 = polar(cx, cy, innerR, a2), i1 = polar(cx, cy, innerR, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${o1.x} ${o1.y} A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${innerR} ${innerR} 0 ${large} 0 ${i1.x} ${i1.y} Z`;
  }

  function canTakeDuty(person, duty) {
    if (person.excluded) return false;
    const type = duty === 'fire' ? 'Fire' : 'Patrol';
    if (person.pc && !state.settings[`allowPc${type}`]) return false;
    if (person.stf && !state.settings[`allowStf${type}`]) return false;
    return true;
  }
  function canTakeFire(person) { return canTakeDuty(person, 'fire'); }
  function canTakePatrol(person) { return canTakeDuty(person, 'patrol'); }
  function canTakeGuard(person) { return !person.excluded && !person.pc && !person.stf; }

  function personRole(s) {
    if (s.pc) return 'PC'; if (s.stf) return 'STF'; if (s.excluded) return 'X'; if (s.driver) return 'F'; return '';
  }

  function tentSvg(soldiers) {
    const n = soldiers.length, gap = 34, start = 90 + gap / 2, span = 360 - gap, step = span / n;
    const sortedByPlace = [...soldiers].sort((a, b) => a.sleepPlace - b.sleepPlace);
    const segs = sortedByPlace.map((s, idx) => {
      const a1 = start + idx * step, a2 = start + (idx + 1) * step, mid = (a1 + a2) / 2;
      const label = polar(160, 160, 112, mid); const role = personRole(s);
      const rawName = (s.name || '').trim(); const short = rawName.length > 9 ? `${rawName.slice(0, 8)}…` : rawName;
      const opacity = (!canTakeFire(s) && !canTakePatrol(s) && !canTakeGuard(s)) ? .55 : 1;
      return `<g opacity="${opacity}"><path class="tent-segment" d="${ringSegmentPath(160,160,145,50,a1,a2)}"/><text class="tent-number" x="${label.x.toFixed(1)}" y="${(label.y-5).toFixed(1)}">${s.sleepPlace}</text>${short ? `<text class="tent-name" x="${label.x.toFixed(1)}" y="${(label.y+5).toFixed(1)}">${escapeHtml(short)}</text>` : ''}${role ? `<text class="tent-name" x="${label.x.toFixed(1)}" y="${(label.y+13).toFixed(1)}">${role}</text>` : ''}</g>`;
    }).join('');
    return `<svg class="tent-svg" viewBox="0 0 320 330" role="img" aria-label="Tält med ${n} sovplatser">${segs}<circle class="tent-core" cx="160" cy="160" r="50"/><rect class="tent-entry" x="143" y="205" width="34" height="112"/><text class="tent-entry-label" x="160" y="321">INGÅNG</text></svg>`;
  }

  function renderTentMaps() {
    const svg = tentSvg(state.soldiers);
    els.tentMap.innerHTML = svg;
    els.resultTentMap.innerHTML = svg;
  }

  function parseClock(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return NaN;
    const [h, m] = value.split(':').map(Number); return h * 60 + m;
  }

  function makeWindow(startClock, endClock, anchorRaw) {
    let start = parseClock(startClock), end = parseClock(endClock);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    const anchor = Number.isFinite(anchorRaw) ? anchorRaw : start;
    while (start < anchor - 720) start += 1440;
    while (start > anchor + 720) start -= 1440;
    while (end <= start) end += 1440;
    return { start, end };
  }

  function makeSlots(window, duration, type) {
    const slots = []; let cursor = window.start;
    while (cursor < window.end) {
      const end = Math.min(cursor + duration, window.end);
      slots.push({ type, start: cursor, end }); cursor = end;
    }
    return slots;
  }

  function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    const sorted = intervals.map(i => ({ start: i.start, end: i.end })).sort((a,b) => a.start - b.start || a.end - b.end);
    const out = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = out[out.length - 1], cur = sorted[i];
      if (cur.start <= last.end) last.end = Math.max(last.end, cur.end); else out.push(cur);
    }
    return out;
  }

  function maxRestGap(bounds, intervals) {
    const busy = mergeIntervals(intervals.map(i => ({ start: Math.max(bounds.start, i.start), end: Math.min(bounds.end, i.end) })).filter(i => i.end > i.start));
    let cursor = bounds.start, best = 0;
    for (const b of busy) { if (b.start > cursor) best = Math.max(best, b.start - cursor); cursor = Math.max(cursor, b.end); }
    best = Math.max(best, bounds.end - cursor); return best;
  }

  function busyMinutes(intervals) { return mergeIntervals(intervals).reduce((sum, i) => sum + i.end - i.start, 0); }
  function clusterCount(intervals) { return mergeIntervals(intervals).length; }
  function displayName(s) { return (s.name || '').trim() || `Plats ${s.sleepPlace}`; }

  function chooseCandidate(eligible, assignmentsByPerson, proposedFactory, bounds, historyMinutes, nightIndex, extraFilter = () => true, historyRest = new Map(), trial = 0, shortRestCounts = new Map(), allowShortRest = false) {
    let best = null;
    for (let idx = 0; idx < eligible.length; idx++) {
      const person = eligible[idx]; if (!extraFilter(person)) continue;
      const proposed = proposedFactory(person).filter(Boolean);
      const existing = assignmentsByPerson.get(person.id) || [];
      if (proposed.some(p => existing.some(e => overlaps(p, e)))) continue;
      const all = [...existing, ...proposed];
      const longest = maxRestGap(bounds, all);
      if (person.driver && longest < DRIVER_REST_MINUTES) continue;
      if (!allowShortRest && longest < REST_TARGET_MINUTES) continue;
      const minutes = busyMinutes(all), clusters = clusterCount(all), hist = historyMinutes.get(person.id) || 0;
      const rotation = ((idx - (nightIndex * 2)) % eligible.length + eligible.length) % eligible.length;
      const burden = bounds.end - bounds.start - longest;
      const tie = ((idx * 71 + trial * 137 + nightIndex * 103) % 101) / 101;
      const shortRestPenalty = longest < REST_TARGET_MINUTES ? 100000 + (shortRestCounts.get(person.id) || 0) * 1000000 + (REST_TARGET_MINUTES-longest)*300 : 0;
      const score = hist * .28 + (historyRest.get(person.id) || 0) * .45 + minutes * .22 + clusters * 20 + burden * .23 + rotation * .8 + tie * 90 + shortRestPenalty;
      if (!best || score < best.score) best = { person, proposed, score };
    }
    return best;
  }

  function validateBeforeGenerate() {
    const errors = [];
    const s = state.settings;
    if (!s.fireStart || !s.fireEnd) errors.push('Ange start- och sluttid för eldpost.');
    const eligible = state.soldiers.filter(canTakeFire);
    if (eligible.length < 1) errors.push('Minst en person måste kunna sitta eldpost.');
    if (s.patrolEnabled && state.soldiers.filter(canTakePatrol).length < 2) errors.push('Minst två personer måste kunna gå patrull.');
    const names = state.soldiers.map(p => (p.name || '').trim()).filter(Boolean);
    if (new Set(names.map(n => n.toLocaleLowerCase('sv'))).size !== names.length) errors.push('Två personer har samma namn. Gör namnen unika.');
    const places = state.soldiers.map(p => p.sleepPlace);
    if (new Set(places).size !== state.soldiers.length) errors.push('Varje person måste ha en unik sovplats.');
    return errors;
  }

  function generatePlan() {
    readSettingsFromControls();
    const errors = validateBeforeGenerate();
    if (errors.length) { els.generateMessage.textContent = errors[0]; return; }
    els.generateMessage.textContent = '';

    const s = state.settings;
    const fireRaw = parseClock(s.fireStart);
    const fireWindow = makeWindow(s.fireStart, s.fireEnd, fireRaw);
    const patrolWindow = s.patrolEnabled ? makeWindow(s.patrolStart, s.patrolEnd, fireRaw) : null;
    const guardWindow = s.guardEnabled ? makeWindow(s.guardStart, s.guardEnd, fireRaw) : null;
    const bounds = {
      start: Math.min(fireWindow.start, patrolWindow?.start ?? Infinity, guardWindow?.start ?? Infinity),
      end: Math.max(fireWindow.end, patrolWindow?.end ?? -Infinity, guardWindow?.end ?? -Infinity)
    };
    const eligible = state.soldiers.filter(p => canTakeFire(p) || canTakePatrol(p) || canTakeGuard(p));
    const fireEligible = state.soldiers.filter(canTakeFire);
    const patrolEligible = state.soldiers.filter(canTakePatrol);
    const guardEligible = state.soldiers.filter(canTakeGuard);
    const historyMinutes = new Map(eligible.map(p => [p.id, 0]));
    let bestPlan = null, bestScore = Infinity;
    for (let trial = 0; trial < (s.nightCount === 1 ? 1 : 90); trial++) {
    const nights = [];
    const historyRest = new Map(eligible.map(p => [p.id, 0]));
    const shortRestCounts = new Map(eligible.map(p => [p.id, 0]));
    historyMinutes.forEach((_,id) => historyMinutes.set(id,0));
    for (let nightIndex = 0; nightIndex < s.nightCount; nightIndex++) {
      const assignmentsByPerson = new Map(eligible.map(p => [p.id, []]));
      const assignments = [];
      const warnings = [];

      const addInterval = (person, interval) => {
        const row = { ...interval, personId: person.id };
        assignmentsByPerson.get(person.id).push(row); assignments.push(row); return row;
      };

      const fireSlots = makeSlots(fireWindow, s.fireDuration, 'fire');
      for (const slot of fireSlots) {
        const patrolFollows = !!(patrolWindow && slot.end >= patrolWindow.start && slot.end + s.patrolDuration <= patrolWindow.end);
        const fireCandidateArgs = [
          fireEligible, assignmentsByPerson,
          () => [slot, patrolFollows ? { type: 'patrol', start: slot.end, end: slot.end + s.patrolDuration, linked: true } : null],
          bounds, historyMinutes, nightIndex,
          person => !patrolFollows || canTakePatrol(person), historyRest, trial, shortRestCounts
        ];
        const pick = chooseCandidate(...fireCandidateArgs) || chooseCandidate(...fireCandidateArgs, true);
        if (!pick) { warnings.push(`Ingen möjlig eldpost ${formatRange(slot.start, slot.end)} utan att bryta vila eller överlapp.`); continue; }
        addInterval(pick.person, slot);
        if (patrolFollows) {
          const patrol = { type: 'patrol', start: slot.end, end: slot.end + s.patrolDuration, linked: true, outgoing: true, pairId: `${nightIndex}-${slot.end}` };
          addInterval(pick.person, patrol);
          const buddyArgs = [
            patrolEligible, assignmentsByPerson,
            () => [{ type: 'patrol', start: patrol.start, end: patrol.end, linked: true, buddy: true, pairId: patrol.pairId }],
            bounds, historyMinutes, nightIndex,
            p => p.id !== pick.person.id, historyRest, trial, shortRestCounts
          ];
          const buddyPick = chooseCandidate(...buddyArgs) || chooseCandidate(...buddyArgs, true);
          if (buddyPick) addInterval(buddyPick.person, { type: 'patrol', start: patrol.start, end: patrol.end, linked: true, buddy: true, pairId: patrol.pairId });
          else warnings.push(`Ingen ledig patrullkamrat ${formatRange(patrol.start, patrol.end)}.`);
        }
      }

      if (guardWindow) {
        const guardSlots = makeSlots(guardWindow, s.guardDuration, 'guard');
        for (const slot of guardSlots) {
          const guardArgs = [guardEligible, assignmentsByPerson, () => [slot], bounds, historyMinutes, nightIndex, () => true, historyRest, trial, shortRestCounts];
          const pick = chooseCandidate(...guardArgs) || chooseCandidate(...guardArgs, true);
          if (pick) addInterval(pick.person, slot);
          else warnings.push(`Ingen möjlig vaktpost ${formatRange(slot.start, slot.end)} utan att bryta vila eller överlapp.`);
        }
      }

      const rest = eligible.map(person => {
        const personal = assignmentsByPerson.get(person.id) || [];
        return { personId: person.id, longestRest: maxRestGap(bounds, personal), busy: busyMinutes(personal), clusters: clusterCount(personal) };
      });
      for (const r of rest) {
        if (r.longestRest < REST_TARGET_MINUTES) shortRestCounts.set(r.personId, (shortRestCounts.get(r.personId) || 0) + 1);
        historyMinutes.set(r.personId, (historyMinutes.get(r.personId) || 0) + r.busy);
        historyRest.set(r.personId, (historyRest.get(r.personId) || 0) + bounds.end - bounds.start - r.longestRest);
      }

      const shortRest = rest.filter(r => r.longestRest < REST_TARGET_MINUTES);
      for (const r of shortRest) {
        const soldier = state.soldiers.find(p => p.id === r.personId);
        warnings.push(`${displayName(soldier)} får bara ${formatMinutes(r.longestRest)} sammanhängande vila denna natt (målet är minst 4 h).`);
      }
      const driversBroken = rest.filter(r => state.soldiers.find(p => p.id === r.personId)?.driver && r.longestRest < DRIVER_REST_MINUTES);
      if (driversBroken.length) warnings.push('Minst en förare får mindre än sex timmars sammanhängande vila.');
      nights.push({ nightIndex, assignments, rest, warnings, bounds });
    }

    const totals = eligible.map(p=>nights.reduce((sum,n)=>{
      const r=n.rest.find(x=>x.personId===p.id);
      return sum + (r ? n.bounds.end-n.bounds.start-r.longestRest : 0);
    },0));
    const mean = totals.reduce((a,b)=>a+b,0) / Math.max(1,totals.length);
    let score = totals.reduce((sum,t)=>sum+(t-mean)**2,0) / Math.max(1,totals.length);
    for (const p of eligible) {
      let last = 0;
      for (const n of nights) {
        const r=n.rest.find(x=>x.personId===p.id);
        const burden = r ? n.bounds.end-n.bounds.start-r.longestRest : 0;
        score += Math.min(last,burden)**2 * .4;
        last = burden;
      }
    }
    const underRestCounts = eligible.map(p => nights.filter(n => n.rest.some(r => r.personId === p.id && r.longestRest < REST_TARGET_MINUTES)).length);
    const extraViolations = underRestCounts.reduce((sum,count) => sum + Math.max(0,count-1),0);
    const violations = underRestCounts.reduce((sum,count)=>sum+count,0);
    score += extraViolations * 1000000000000 + violations * 1000000000;
    score += nights.reduce((sum,n)=>sum+n.warnings.filter(w=>!w.includes('sammanhängande vila denna natt')).length*10000000,0);
    if (score < bestScore) {bestScore=score;bestPlan=nights;}
    }
    const settingsCopy = typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s));
    state.generated = { createdAt: new Date().toISOString(), nights: bestPlan, settings: settingsCopy };
    activeNight = 0; sharedUrl=''; els.sharePanel.classList.add('hidden'); saveStateSoon(); renderResults();
    els.resultSection.classList.remove('hidden');
    els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function dateForNight(index) {
    const base = new Date(`${state.settings.startDate}T12:00:00`); base.setDate(base.getDate() + index); return base;
  }

  function formatNightDate(index) {
    return new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).format(dateForNight(index));
  }

  function clockFromMinute(minute) {
    const m = ((Math.round(minute) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  }
  function formatRange(start, end) { return `${clockFromMinute(start)}–${clockFromMinute(end)}`; }
  function formatMinutes(mins) { const h = Math.floor(mins / 60), m = mins % 60; return m ? `${h} h ${m} min` : `${h} h`; }
  function getPerson(id) { return state.soldiers.find(p => p.id === id); }
  function personWithPlace(id) { const p = getPerson(id); return p ? `${displayName(p)} · plats ${p.sleepPlace}` : 'Okänd'; }

  function renderResults() {
    if (!state.generated?.nights?.length) { els.resultSection.classList.add('hidden'); return; }
    activeNight = Math.min(activeNight, state.generated.nights.length - 1);
    const night = state.generated.nights[activeNight];
    els.resultTitle.textContent = `Natt ${activeNight + 1} · ${formatNightDate(activeNight)}`;
    els.nightTabs.innerHTML = state.generated.nights.map((_, i) => `<button type="button" class="night-tab ${i === activeNight ? 'active' : ''}" data-night="${i}">Natt ${i+1}</button>`).join('');
    els.nightTabs.querySelectorAll('.night-tab').forEach(btn => btn.addEventListener('click', () => { activeNight = Number(btn.dataset.night); renderResults(); }));
    els.scheduleWarnings.innerHTML = night.warnings.map(w => `<p class="warning">${escapeHtml(w)}</p>`).join('');
    els.scheduleTable.innerHTML = renderScheduleRows(night);
    els.restSummary.innerHTML = night.rest.map(r => {
      const p = getPerson(r.personId); if (!p) return '';
      const driverClass = p.driver ? (r.longestRest >= DRIVER_REST_MINUTES ? 'ok' : 'bad') : '';
      const role = p.driver ? ' · Förare' : '';
      return `<div class="rest-item"><div><div class="rest-name">${escapeHtml(displayName(p))}</div><div class="rest-meta">${formatMinutes(r.busy)} tjänst · ${r.clusters} block${role}</div></div><div class="rest-hours ${driverClass}">Längsta vila<br>${formatMinutes(r.longestRest)}</div></div>`;
    }).join('');
    renderTentMaps();
  }

  function renderScheduleRows(night) {
    const fireAndGuard = night.assignments.filter(a => a.type !== 'patrol').map(a => ({ start: a.start, end: a.end, type: a.type, personIds: [a.personId] }));
    const patrolGroups = new Map();
    for (const a of night.assignments.filter(a => a.type === 'patrol')) {
      const key = a.pairId || `${a.start}-${a.end}`;
      if (!patrolGroups.has(key)) patrolGroups.set(key, { start: a.start, end: a.end, type: 'patrol', personIds: [] });
      patrolGroups.get(key).personIds.push(a.personId);
    }
    const items = [...fireAndGuard, ...patrolGroups.values()].sort((a,b) => a.start - b.start || dutyOrder(a.type) - dutyOrder(b.type));
    const byRange = new Map();
    for (const item of items) {
      const key = `${item.start}-${item.end}`; if (!byRange.has(key)) byRange.set(key, { start: item.start, end: item.end, items: [] }); byRange.get(key).items.push(item);
    }
    return [...byRange.values()].sort((a,b) => a.start - b.start).map(row => {
      const assignments = row.items.map(item => {
        const label = item.type === 'fire' ? 'Eldpost' : item.type === 'patrol' ? 'Patrull' : 'Vaktpost';
        const people = item.personIds.map(personWithPlace).join(' + ');
        return `<div class="assignment ${item.type}"><span class="kind">${label}</span><span>${escapeHtml(people)}</span></div>`;
      }).join('');
      return `<div class="schedule-row"><div class="schedule-time">${formatRange(row.start,row.end)}</div><div class="schedule-duty">${assignments}</div></div>`;
    }).join('') || '<div class="schedule-row"><div class="schedule-time">–</div><div class="schedule-duty">Inga pass kunde skapas.</div></div>';
  }

  function dutyOrder(type) { return type === 'fire' ? 0 : type === 'patrol' ? 1 : 2; }

  function copyCurrentNight() {
    const night = state.generated?.nights?.[activeNight]; if (!night) return;
    const lines = [`ELDPOST · Natt ${activeNight+1} · ${formatNightDate(activeNight)}`];
    const items = [];
    for (const a of night.assignments.filter(a => a.type !== 'patrol')) items.push({ ...a, personIds:[a.personId] });
    const patrols = new Map();
    for (const a of night.assignments.filter(a => a.type === 'patrol')) {
      const key = a.pairId || `${a.start}-${a.end}`; if (!patrols.has(key)) patrols.set(key,{...a,personIds:[]}); patrols.get(key).personIds.push(a.personId);
    }
    items.push(...patrols.values()); items.sort((a,b)=>a.start-b.start || dutyOrder(a.type)-dutyOrder(b.type));
    for (const item of items) {
      const label = item.type === 'fire' ? 'Eldpost' : item.type === 'patrol' ? 'Patrull' : 'Vaktpost';
      lines.push(`${formatRange(item.start,item.end)}  ${label}: ${item.personIds.map(personWithPlace).join(' + ')}`);
    }
    navigator.clipboard?.writeText(lines.join('\n')).then(() => { els.copyButton.textContent='Kopierat'; setTimeout(()=>els.copyButton.textContent='Kopiera',1200); });
  }

  function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }


  let sharedUrl = '';
  async function makeShareLink() {
    if (!state.generated?.nights?.length) return;
    els.shareStatus.textContent = '';
    els.shareButton.disabled = true;
    try {
      if (!('CompressionStream' in window)) throw Error('Din webbläsare behöver uppdateras för att skapa delningslänk.');
      const payload = {
        v: 1,
        d: state.generated.settings.startDate,
        p: state.soldiers.map((p,i)=>[i,(p.name || '').trim() || 'Plats '+p.sleepPlace,p.sleepPlace]),
        n: state.generated.nights.map(n=>{
          const items=n.assignments.filter(a=>a.type!=='patrol').map(a=>[a.type,a.start,a.end,[state.soldiers.findIndex(p=>p.id===a.personId)]]);
          const pairs=new Map();
          for(const a of n.assignments.filter(a=>a.type==='patrol')){
            const key=a.pairId || a.start+'-'+a.end;
            if(!pairs.has(key))pairs.set(key,['patrol',a.start,a.end,[]]);
            pairs.get(key)[3].push(state.soldiers.findIndex(p=>p.id===a.personId));
          }
          return [...items,...pairs.values()].sort((a,b)=>a[1]-b[1]);
        })
      };
      const source = new Blob([JSON.stringify(payload)]);
      const compressed=await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      const bytes=new Uint8Array(compressed);
      let binary='';
      for(let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.slice(offset,offset+8192));
      const token=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      sharedUrl=new URL('/share.html#s='+token, location.origin).href;
      els.shareUrl.value=sharedUrl;
      els.sharePanel.classList.remove('hidden');
      els.shareQr.innerHTML='';
      els.shareQrHelp.textContent='';
      try {
        if (typeof qrcode !== 'function') throw Error('QR-kodsbiblioteket saknas.');
        const qr=qrcode(0,'L');
        qr.addData(sharedUrl);
        qr.make();
        els.shareQr.innerHTML=qr.createSvgTag({cellSize:3,margin:9,scalable:true});
        els.shareQrHelp.textContent='Skanna med iPhone-kameran för att öppna den skrivskyddade sidan.';
      } catch {
        els.shareQrHelp.textContent='Schemat är för stort för en läsbar QR-kod. Kopiera länken i stället.';
      }
    } catch(error) {
      els.shareStatus.textContent=error.message || 'Kunde inte skapa delningslänk.';
    } finally { els.shareButton.disabled=false; }
  }
  async function copyShareLink(){
    if(!sharedUrl)return;
    try {
      await navigator.clipboard.writeText(sharedUrl);
      els.shareStatus.textContent='Länken är kopierad.';
    }catch{els.shareStatus.textContent='Markera och kopiera länken i fältet.';}
  }
  async function shareUsingPhone(){
    if(!sharedUrl)return;
    if(navigator.share){
      try { await navigator.share({title:'Eldpost · Delat schema',url:sharedUrl}); }catch {}
    }else {await copyShareLink();}
  }

  function bindEvents() {
    els.soldierCount.addEventListener('change', () => resizeSoldierList(Number(els.soldierCount.value)));
    [els.startDate, els.nightCount, els.fireStart, els.fireEnd, els.fireDuration, els.patrolStart, els.patrolEnd, els.patrolDuration, els.guardStart, els.guardEnd, els.guardDuration].forEach(el => el.addEventListener('change', () => { readSettingsFromControls(); els.resultSection.classList.add('hidden'); }));
    [els.patrolEnabled, els.guardEnabled, els.allowPcFire, els.allowPcPatrol, els.allowStfFire, els.allowStfPatrol].forEach(el => el.addEventListener('change', () => { updateOptionalFields(); readSettingsFromControls(); els.resultSection.classList.add('hidden'); }));
    els.generateButton.addEventListener('click', generatePlan);
    els.copyButton.addEventListener('click', copyCurrentNight);
    els.shareButton.addEventListener('click', makeShareLink);
    els.shareCopyButton.addEventListener('click', copyShareLink);
    els.nativeShareButton.addEventListener('click', shareUsingPhone);
    els.resetButton.addEventListener('click', () => {
      if (!confirm('Nollställa alla namn, tider och sparade scheman på den här telefonen?')) return;
      localStorage.removeItem(STORAGE_KEY); state = makeDefaultState(); activeNight = 0; syncControlsFromState(); renderSoldiers(); renderTentMaps(); els.resultSection.classList.add('hidden'); els.generateMessage.textContent = ''; saveStateSoon();
    });
  }

  initOptions(); syncControlsFromState(); renderSoldiers(); renderTentMaps(); bindEvents();
  if (state.generated?.nights?.length) { els.resultSection.classList.remove('hidden'); renderResults(); }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
})();
