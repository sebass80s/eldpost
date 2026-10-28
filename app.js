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
    soldierCount: $('soldierCount'), soldierList: $('soldierList'), smallTeamWarning: $('smallTeamWarning'), combinedDutyWarning: $('combinedDutyWarning'), startDate: $('startDate'), nightCount: $('nightCount'),
    fireStart: $('fireStart'), fireEnd: $('fireEnd'), fireDuration: $('fireDuration'),
    patrolEnabled: $('patrolEnabled'), patrolStart: $('patrolStart'), patrolEnd: $('patrolEnd'), patrolDuration: $('patrolDuration'), patrolFields: $('patrolFields'), patrolNights: $('patrolNights'), patrolMode: $('patrolMode'), patrolPeople: $('patrolPeople'),
    guardEnabled: $('guardEnabled'), guardStart: $('guardStart'), guardEnd: $('guardEnd'), guardDuration: $('guardDuration'), guardFields: $('guardFields'), guardNights: $('guardNights'), guardPeople: $('guardPeople'),
    allowPcFire: $('allowPcFire'), allowPcPatrol: $('allowPcPatrol'), allowStfFire: $('allowStfFire'), allowStfPatrol: $('allowStfPatrol'),
    tentMap: $('tentMap'), generateButton: $('generateButton'), generateMessage: $('generateMessage'), resetButton: $('resetButton'),
    changeStaffingButton: $('changeStaffingButton'), resultSection: $('resultSection'), resultTitle: $('resultTitle'), nightTabs: $('nightTabs'), scheduleWarnings: $('scheduleWarnings'), scheduleTable: $('scheduleTable'), restSummary: $('restSummary'), resultTentMap: $('resultTentMap'), copyButton: $('copyButton'),
    shareButton: $('shareButton'), sharePanel: $('sharePanel'), shareUrl: $('shareUrl'), shareCopyButton: $('shareCopyButton'), nativeShareButton: $('nativeShareButton'), shareQr: $('shareQr'), shareQrHelp: $('shareQrHelp'), shareStatus: $('shareStatus'),
    soldierTemplate: $('soldierTemplate')
  };

  let activeNight = 0;
  let totalView = false;
  let selectedTotalNights = null;
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
        patrolEnabled: true, patrolNights: null, patrolStart: '22:00', patrolEnd: '06:00', patrolDuration: 60, patrolMode: 'linked', patrolPeople: 2,
        guardEnabled: false, guardNights: null, guardStart: '22:00', guardEnd: '06:00', guardDuration: 60, guardPeople: 2,
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
      parsed.lockedNights = Math.max(0, Math.min(Number(parsed.lockedNights)||0, parsed.generated?.nights?.length||0));
      if (![1,2].includes(Number(parsed.settings.guardPeople))) parsed.settings.guardPeople=2;
      if (!['linked','independent'].includes(parsed.settings.patrolMode)) parsed.settings.patrolMode='linked';
      if (![1,2].includes(Number(parsed.settings.patrolPeople))) parsed.settings.patrolPeople=2;
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
    els.nightCount.add(new Option('Okänt · en natt i taget', '0'));
    for (let n = 1; n <= 14; n++) els.nightCount.add(new Option(`${n} ${n === 1 ? 'natt' : 'nätter'}`, String(n)));
  }

  function syncControlsFromState() {
    const s = state.settings;
    els.soldierCount.value = String(state.soldiers.length);
    updateSmallTeamWarning();
    els.startDate.value = s.startDate || todayLocal();
    els.nightCount.value = String(s.nightCount ?? 3);
    els.fireStart.value = s.fireStart; els.fireEnd.value = s.fireEnd; els.fireDuration.value = String(s.fireDuration);
    els.patrolMode.value=s.patrolMode || 'linked'; els.patrolPeople.value=String(s.patrolPeople || 2);
    els.patrolEnabled.checked = !!s.patrolEnabled; els.patrolStart.value = s.patrolStart; els.patrolEnd.value = s.patrolEnd; els.patrolDuration.value = String(s.patrolDuration);
    els.guardPeople.value=String(s.guardPeople || 2);
    els.guardEnabled.checked = !!s.guardEnabled; els.guardStart.value = s.guardStart; els.guardEnd.value = s.guardEnd; els.guardDuration.value = String(s.guardDuration);
    for (const key of ['allowPcFire', 'allowPcPatrol', 'allowStfFire', 'allowStfPatrol']) els[key].checked = !!s[key];
    updateOptionalFields();
    updateCombinedDutyWarning();
    renderDutyNightChoices();
  }

  function readSettingsFromControls() {
    const oldSettings=state.settings;
    state.settings = {
      startDate: els.startDate.value || todayLocal(), nightCount: Number(els.nightCount.value),
      fireStart: els.fireStart.value, fireEnd: els.fireEnd.value, fireDuration: Number(els.fireDuration.value),
      patrolMode: els.patrolMode.value, patrolPeople: Number(els.patrolPeople.value),
      patrolEnabled: els.patrolEnabled.checked, patrolNights: selectedDutyNights('patrol'), patrolStart: els.patrolStart.value, patrolEnd: els.patrolEnd.value, patrolDuration: Number(els.patrolDuration.value),
      guardPeople: Number(els.guardPeople.value), guardEnabled: els.guardEnabled.checked, guardNights: selectedDutyNights('guard'), guardStart: els.guardStart.value, guardEnd: els.guardEnd.value, guardDuration: Number(els.guardDuration.value),
      allowPcFire: els.allowPcFire.checked, allowPcPatrol: els.allowPcPatrol.checked,
      allowStfFire: els.allowStfFire.checked, allowStfPatrol: els.allowStfPatrol.checked
    };
    if (state.settings.nightCount === 0 && state.generated?.settings?.nightCount === 0) {
      for(const type of ['patrol','guard']) {
        const previous=oldSettings[type+'Nights']||[];
        const nextIndex=state.generated.nights.length;
        state.settings[type+'Nights']=[...new Set([...previous.filter(i=>i!==nextIndex),...state.settings[type+'Nights']])].sort((a,b)=>a-b);
      }
    } else if (!state.lockedNights) state.generated = null;
    sharedUrl='';
    els.sharePanel.classList.add('hidden');
    updateCombinedDutyWarning();
    saveStateSoon();
  }

  function selectedDutyNights(type) {
    const container = type === 'patrol' ? els.patrolNights : els.guardNights;
    return [...container.querySelectorAll('input[data-duty-night]')].filter(el=>el.checked).map(el=>Number(el.dataset.dutyNight));
  }

  function dutyEnabledOnNight(settings, type, index) {
    if (!settings[type+'Enabled']) return false;
    const selected = settings[type+'Nights'];
    return !Array.isArray(selected) || selected.includes(index);
  }

  function renderDutyNightChoices() {
    const unknown = els.nightCount.value === '0';
    const offset = unknown ? (state.generated?.settings?.nightCount === 0 ? state.generated.nights.length : 0) : 0;
    const count = unknown ? 1 : Number(els.nightCount.value) || 1;
    for (const type of ['patrol','guard']) {
      const container = type === 'patrol' ? els.patrolNights : els.guardNights;
      const existing = container.querySelectorAll('input[data-duty-night]');
      const prior = unknown && existing.length && ![...existing].some(el=>Number(el.dataset.dutyNight)===offset)
        ? null
        : existing.length ? [...existing].filter(el=>el.checked).map(el=>Number(el.dataset.dutyNight)) : state.settings[type+'Nights'];
      container.innerHTML = Array.from({length:count},(_,i) => {
        const index=i+offset;
        return `<label class="total-night-choice"><input type="checkbox" data-duty-night="${index}" ${!Array.isArray(prior)||prior.includes(index)?'checked':''}>Natt ${index+1}</label>`;
      }).join('');
      container.querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>{readSettingsFromControls();updateCombinedDutyWarning();}));
    }
  }

  function updateOptionalFields() {
    els.patrolFields.classList.toggle('disabled-fields', !els.patrolEnabled.checked);
    els.guardFields.classList.toggle('disabled-fields', !els.guardEnabled.checked);
  }

  function updateSmallTeamWarning() {
    els.smallTeamWarning.classList.toggle('hidden', state.soldiers.length >= 8);
  }

  function resizeSoldierList(count) {
    count = Math.max(MIN_SOLDIERS, Math.min(MAX_SOLDIERS, count));
    const old = state.soldiers.length;
    if (count > old) {
      for (let i = old; i < count; i++) state.soldiers.push(makeSoldier(i));
    } else if (count < old) {
      if(state.lockedNights) { alert('Behåll historiken: markera den som lämnat som Ej schema i stället för att minska antalet soldater.'); els.soldierCount.value=String(old); return; }
      state.soldiers = state.soldiers.slice(0, count);
    }
    normalizeSleepPlaces();
    if (!state.lockedNights) state.generated = null;
    sharedUrl=''; els.sharePanel.classList.add('hidden');
    renderSoldiers(); renderTentMaps(); updateSmallTeamWarning(); saveStateSoon();
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

  function updateUnderstaffedWarning() {
    const count=state.soldiers.filter(p=>!p.excluded).length;
    const warning=$('understaffedWarning');
    if(warning) warning.classList.toggle('hidden',count>=9);
  }

  function renderSoldiers() {
    updateUnderstaffedWarning();
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

      name.addEventListener('input', () => { soldier.name = name.value; invalidateGenerated(); renderTentMaps(); validateUniqueNames(); });
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
    validateUniqueNames();
  }

  function normalizeName(value) { return (value || '').trim().replace(/\\s+/g, ' ').toLocaleLowerCase('sv-SE'); }

  function validateUniqueNames() {
    const counts = new Map();
    for (const soldier of state.soldiers) {
      const key = normalizeName(soldier.name);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    let duplicated = false, missing = false;
    for (const row of els.soldierList.querySelectorAll('.soldier-card')) {
      const soldier = state.soldiers.find(p => p.id === row.dataset.id);
      const input = row.querySelector('.soldier-name');
      const key = normalizeName(soldier?.name);
      const isMissing = !key;
      const isDuplicate = !isMissing && counts.get(key) > 1;
      input.classList.toggle('duplicate-name', isDuplicate);
      input.classList.toggle('missing-name', isMissing);
      input.setAttribute('aria-invalid', String(isDuplicate || isMissing));
      input.setCustomValidity(isMissing ? 'Ange ett namn för sovplatsen.' : isDuplicate ? 'Namnet används redan på en annan sovplats.' : '');
      duplicated ||= isDuplicate;
      missing ||= isMissing;
    }
    els.generateButton.disabled = duplicated || missing;
    els.generateMessage.textContent = duplicated
      ? 'Samma namn förekommer flera gånger. Ändra de markerade namnen.'
      : missing ? 'Fyll i namn för alla valda sovplatser innan du genererar.' : '';
    return !duplicated && !missing;
  }

  function invalidateGenerated() {
    if (!state.lockedNights) state.generated = null;
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

  function understaffedMode() { return state.soldiers.filter(p=>!p.excluded).length < 9; }
  function canTakeDuty(person, duty) {
    if (person.excluded) return false;
    const type = duty === 'fire' ? 'Fire' : 'Patrol';
    if (person.pc && !state.settings[`allowPc${type}`] && !(understaffedMode() && duty==='patrol')) return false;
    if (person.stf && !state.settings[`allowStf${type}`] && !(understaffedMode() && duty==='patrol')) return false;
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

  function tripleDutyOverlap(settings) {
    if (!settings.patrolEnabled || !settings.guardEnabled) return false;
    const anchor = parseClock(settings.fireStart);
    if (!Array.from({length:settings.nightCount||1},(_,i)=>i).some(i=>dutyEnabledOnNight(settings,'patrol',i)&&dutyEnabledOnNight(settings,'guard',i))) return false;
    const windows = [
      makeWindow(settings.fireStart, settings.fireEnd, anchor),
      makeWindow(settings.patrolStart, settings.patrolEnd, anchor),
      makeWindow(settings.guardStart, settings.guardEnd, anchor)
    ];
    return windows.every(Boolean) &&
      Math.max(...windows.map(w => w.start)) < Math.min(...windows.map(w => w.end));
  }

  function updateCombinedDutyWarning() {
    els.combinedDutyWarning.classList.toggle('hidden', !tripleDutyOverlap(state.settings));
  }

  function makeSlots(window, duration, type) {
    const slots = []; let cursor = window.start;
    while (cursor < window.end) {
      const end = Math.min(cursor + duration, window.end);
      slots.push({ type, start: cursor, end }); cursor = end;
    }
    return slots;
  }

  function patrolOrderValid(shifts) {
    const ordered=[...shifts].sort((a,b)=>a.start-b.start);
    if (understaffedMode()) return ordered.length<=2 && ordered.every((a,i)=>!i || ordered[i-1].end<=a.start);
    // Normalbemanning: aldrig brutna turer. Alla pass under natten
    // måste bilda ett enda obrutet tjänstgöringsblock.
    if (ordered.some((a,i)=>i>0 && ordered[i-1].end!==a.start)) return false;
    if (!state.settings.guardEnabled && ordered.length>2) return false;
    if (new Set(ordered.map(a=>a.type)).size !== ordered.length) return false;
    return true; // Eldpost före patrull/vaktpost är en preferens, inte ett krav.
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

  function shiftQuality(slot, bounds) {
    // Klassificera efter passets starttid, inte mittpunkt eller sluttid.
    const start = ((slot.start % 1440) + 1440) % 1440;
    const bad = start >= 120 && start < 300; // 02:00, 03:00, 04:00 (entimmespass)
    const good = (slot.start >= bounds.start && slot.start < bounds.start + 2*(slot.end-slot.start)) || slot.end === bounds.end;
    return { bad, good };
  }

  function chooseCandidate(eligible, assignmentsByPerson, proposedFactory, bounds, historyMinutes, nightIndex, extraFilter = () => true, historyRest = new Map(), trial = 0, shortRestCounts = new Map(), allowShortRest = false, qualityHistory = new Map()) {
    let best = null;
    for (let idx = 0; idx < eligible.length; idx++) {
      const person = eligible[idx]; if (!extraFilter(person)) continue;
      const proposed = proposedFactory(person).filter(Boolean);
      const existing = assignmentsByPerson.get(person.id) || [];
      const combined = [...existing, ...proposed];
      // Hård gräns: högst ett pass av varje typ och högst två totalt.
      if (combined.length > 2 || (!understaffedMode() && (combined.filter(x=>x.type==='fire').length > 1 ||
          combined.filter(x=>x.type==='patrol').length > 1 ||
          combined.filter(x=>x.type==='guard').length > 1))) continue;
      // Avbruten sömn tillåts endast som sista utväg när vaktpost är aktiv.
      const ordered = [...combined].sort((a,b)=>a.start-b.start);
      const interrupted = ordered.length === 2 && ordered[0].end !== ordered[1].start;
      if (interrupted && state.settings.guardEnabled && !allowShortRest) continue;
      if (proposed.some(p => existing.some(e => overlaps(p, e)))) continue;
      const all = [...existing, ...proposed];
      if (!patrolOrderValid(all)) continue;
      const longest = maxRestGap(bounds, all);
      if (person.driver && longest < DRIVER_REST_MINUTES) continue;
      if (!allowShortRest && longest < REST_TARGET_MINUTES) continue;
      const minutes = busyMinutes(all), clusters = clusterCount(all), hist = historyMinutes.get(person.id) || 0;
      const rotation = ((idx - (nightIndex * 2)) % eligible.length + eligible.length) % eligible.length;
      const burden = bounds.end - bounds.start - longest;
      const tie = ((idx * 71 + trial * 137 + nightIndex * 103) % 101) / 101;
      const shortRestPenalty = longest < REST_TARGET_MINUTES ? 100000 + (shortRestCounts.get(person.id) || 0) * 1000000 + (REST_TARGET_MINUTES-longest)*300 : 0;
      const interruptedPenalty = interrupted ? 500000 + (person.driver ? 200000 : 0) : 0;
      // Fristående patrull: prioritera den som ännu inte tjänstgjort denna natt.
      // Därefter jämnas tjänstgöringsminuter ut över samtliga nätter.
      const independent = state.settings.patrolEnabled && state.settings.patrolMode === 'independent';
      const nightlyLoad = busyMinutes(existing);
      const dutyBalancePenalty = independent ? (nightlyLoad > 0 ? 9000 + nightlyLoad * 12 : 0) + hist * 2.5 : 0;
      const quality = qualityHistory.get(person.id) || {bad:0,good:0,lastBad:false,lastHeavy:false,credit:0};
      const bad = proposed.filter(p=>shiftQuality(p,bounds).bad).length;
      const good = proposed.filter(p=>shiftQuality(p,bounds).good).length;
      const finalPatrol = proposed.some(p => p.type === 'patrol' && p.end === makeWindow(state.settings.patrolStart, state.settings.patrolEnd, parseClock(state.settings.fireStart))?.end);
      const lateDriver = 0; // Inget särskilt tidspreferenskrav för förare.
      const badPenalty = bad * (quality.bad * 650 + (quality.lastBad?1200:0) + (existing.some(p=>shiftQuality(p,bounds).bad)?850:0));
      const driverBadPenalty = 0; // Förare får skitpass om sex timmars sammanhängande vila uppfylls.
      const goodPenalty = good * quality.good * 230;
      // Den som haft tung föregående natt ska först kompenseras med bra pass.
      const recoveryPenalty = bad * (quality.lastHeavy ? 6000000 : quality.lastBad ? 600000 : 0)
        - good * ((quality.credit||0)*250000 + (quality.lastHeavy?6000000:0));
      const score = hist * .28 + (historyRest.get(person.id) || 0) * .45 + minutes * .22 + clusters * 20 + burden * .23 + rotation * .8 + tie * 90 + shortRestPenalty + dutyBalancePenalty + interruptedPenalty + badPenalty + goodPenalty + lateDriver + driverBadPenalty + recoveryPenalty;
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
    if (s.patrolEnabled && state.soldiers.filter(canTakePatrol).length < s.patrolPeople) errors.push('För få personer är tillgängliga för patrull.');
    if (state.soldiers.some(p => !normalizeName(p.name))) errors.push('Fyll i namn för alla valda sovplatser.');
    const names = state.soldiers.map(p => (p.name || '').trim()).filter(Boolean);
    if (new Set(names.map(normalizeName)).size !== names.length) errors.push('Två personer har samma namn. Gör namnen unika.');
    const places = state.soldiers.map(p => p.sleepPlace);
    if (new Set(places).size !== state.soldiers.length) errors.push('Varje person måste ha en unik sovplats.');
    return errors;
  }

  function balanceDifficultShifts(nights, soldiers, lockedNightCount = 0) {
    const regular=soldiers.filter(p=>!p.excluded);
    const byId=new Map(soldiers.map(p=>[p.id,p]));
    const allowed=(p,type)=>type==='fire'?canTakeFire(p):type==='patrol'?canTakePatrol(p):canTakeGuard(p);
    function score() {
      const badCounts=new Map(regular.map(p=>[p.id,0]));
      let repeated=0, restPenalty=0, excessShifts=0;
      const badNights=new Map(regular.map(p=>[p.id,[]]));
      const shortRestNights=new Map(regular.map(p=>[p.id,[]]));
      for(const [nightIndex,night] of nights.entries()) {
        for(const p of soldiers) {
          const shifts=night.assignments.filter(a=>a.personId===p.id);
          const rest=maxRestGap(night.bounds,shifts);
          excessShifts+=Math.max(0,shifts.length-2)*1000000000;
          if(p.excluded)continue;
          if(p.driver && rest<DRIVER_REST_MINUTES)return Infinity;
          if(!p.driver) {
            shortRestNights.get(p.id).push(rest<REST_TARGET_MINUTES);
            if(rest<REST_TARGET_MINUTES)restPenalty+=100000000+(REST_TARGET_MINUTES-rest)*2000;
          }
          {
            const bad=shifts.filter(a=>shiftQuality(a,night.bounds).bad).length;
            badCounts.set(p.id,(badCounts.get(p.id)||0)+bad);
            badNights.get(p.id).push(bad);
            repeated+=Math.max(0,bad-1)*60000;
          }
        }
      }
      // Föredra eldpost före patrull/vaktpost utan att förbjuda omvänd ordning.
      for(const night of nights.slice(lockedNightCount))for(const p of regular) {
        const shifts=night.assignments.filter(a=>a.personId===p.id).sort((a,b)=>a.start-b.start);
        if(shifts.length>1 && shifts[0].type!=='fire' && shifts.some(a=>a.type==='fire')) repeated+=250000;
      }
      const values=regular.map(p=>badCounts.get(p.id)||0);
      const average=values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
      let nightBalancePenalty=0;
      for(const daily of badNights.values()) {
        for(let i=1;i<daily.length;i++) {
          // Undvik skitpass under flera nätter i rad, särskilt dubbla skitpass.
          if(daily[i] && daily[i-1]) nightBalancePenalty+=20000*Math.min(daily[i],daily[i-1]);
        }
        const total=daily.reduce((a,b)=>a+b,0);
        const mean=total/Math.max(1,daily.length);
        nightBalancePenalty+=daily.reduce((a,b)=>a+(b-mean)**2,0)*18000;
      }
      let goodCoveragePenalty=0;
      for (const p of soldiers.filter(p=>!p.excluded)) {
        const hasGood=nights.some(n=>n.assignments.some(a=>a.personId===p.id && shiftQuality(a,n.bounds).good));
        if(!hasGood)goodCoveragePenalty+=50000000;
      }
      let shortRestFairness=0;
      const counts=[];
      for(const daily of shortRestNights.values()) {
        const count=daily.filter(Boolean).length;
        counts.push(count);
        for(let i=1;i<daily.length;i++)
          if(daily[i] && daily[i-1])shortRestFairness+=5000000000;
      }
      const mean=counts.reduce((a,b)=>a+b,0)/Math.max(1,counts.length);
      shortRestFairness+=counts.reduce((a,b)=>a+(b-mean)**2,0)*100000000;
      return values.reduce((a,b)=>a+(b-average)**2,0)*140000 + repeated + nightBalancePenalty + restPenalty + shortRestFairness + goodCoveragePenalty + excessShifts;
    }
    let current=score();
    for(let pass=0;pass<18;pass++) {
      let best=null;
      for(const night of nights.slice(lockedNightCount)) {
        const rows=night.assignments;
        const nonDriverCount=regular.length,driverCount=soldiers.filter(p=>p.driver&&!p.excluded).length;
        const maxShifts=Math.max(3,Math.ceil((rows.length-driverCount)/Math.max(1,nonDriverCount)));
        const typeLimit=type=>Math.max(2,Math.ceil((rows.filter(a=>a.type===type).length-soldiers.filter(p=>p.driver&&allowed(p,type)).length)/Math.max(1,regular.filter(p=>allowed(p,type)).length)));
        for(let i=0;i<rows.length;i++) {
          const a=rows[i],old=byId.get(a.personId);
          if(!old || old.excluded)continue;
          for(const person of regular) {
            if(person.id===old.id || !allowed(person,a.type))continue;
            const target=rows.filter((x,j)=>j!==i && x.personId===person.id);
            if(target.length>=(state.settings.guardEnabled?maxShifts:2) || target.filter(x=>x.type===a.type).length>=(state.settings.guardEnabled?typeLimit(a.type):1))continue;
            if(target.some(x=>overlaps(x,a)) || !patrolOrderValid([...target,a]))continue;
            a.personId=person.id;
            const value=score();
            a.personId=old.id;
            if(value<current-0.001 && (!best || value<best.value))best={a,person,value};
          }
        }
      }
      // Swap assignments as well: a fully loaded team may have no legal one-way moves.
      for(const night of nights.slice(lockedNightCount)) {
        const rows=night.assignments;
        const typeLimit=type=>Math.max(2,Math.ceil((rows.filter(a=>a.type===type).length-soldiers.filter(p=>p.driver&&allowed(p,type)).length)/Math.max(1,regular.filter(p=>allowed(p,type)).length)));
        for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++) {
          const a=rows[i],b=rows[j];
          if(a.personId===b.personId)continue;
          const first=byId.get(a.personId),second=byId.get(b.personId);
          if(!first || !second || first.excluded || second.excluded)continue;
          if(!allowed(first,b.type) || !allowed(second,a.type))continue;
          const firstOther=rows.filter((x,k)=>k!==i && k!==j && x.personId===first.id);
          const secondOther=rows.filter((x,k)=>k!==i && k!==j && x.personId===second.id);
          if(firstOther.some(x=>overlaps(x,b)) || secondOther.some(x=>overlaps(x,a)))continue;
          if(!patrolOrderValid([...firstOther,b]) || !patrolOrderValid([...secondOther,a]))continue;
          if(firstOther.filter(x=>x.type===b.type).length>=(state.settings.guardEnabled?typeLimit(b.type):1) || secondOther.filter(x=>x.type===a.type).length>=(state.settings.guardEnabled?typeLimit(a.type):1))continue;
          a.personId=second.id;b.personId=first.id;
          const value=score();
          a.personId=first.id;b.personId=second.id;
          if(value<current-0.001 && (!best || value<best.value))best={a,b,first,second,value};
        }
      }
      // Byt hela tjänstgöringsblock. En eldpost direkt följd av patrull
      // kan annars inte flyttas som en enhet utan att bryta passordningen.
      for(const night of nights.slice(lockedNightCount)) {
        const rows=night.assignments;
        for(let x=0;x<regular.length;x++)for(let y=x+1;y<regular.length;y++) {
          const first=regular[x],second=regular[y];
          const a=rows.filter(r=>r.personId===first.id),b=rows.filter(r=>r.personId===second.id);
          if(!a.length && !b.length)continue;
          if(!a.every(r=>allowed(second,r.type))||!b.every(r=>allowed(first,r.type)))continue;
          const oldA=a.map(r=>r.personId),oldB=b.map(r=>r.personId);
          a.forEach(r=>r.personId=second.id);
          b.forEach(r=>r.personId=first.id);
          const value=score();
          a.forEach((r,i)=>r.personId=oldA[i]);
          b.forEach((r,i)=>r.personId=oldB[i]);
          if(value<current-0.001 && (!best || value<best.value))
            best={blockA:a,blockB:b,first,second,value};
        }
      }
      if(!best)break;
      if(best.blockA){best.blockA.forEach(r=>r.personId=best.second.id);best.blockB.forEach(r=>r.personId=best.first.id);}
      else if(best.b){best.a.personId=best.second.id;best.b.personId=best.first.id;}
      else best.a.personId=best.person.id;
      current=best.value;
    }
    for(const night of nights.slice(lockedNightCount)) {
      night.rest=soldiers.filter(p=>canTakeFire(p)||canTakePatrol(p)||canTakeGuard(p)).map(p=>{
        const shifts=night.assignments.filter(a=>a.personId===p.id);
        return {personId:p.id,longestRest:maxRestGap(night.bounds,shifts),
          busy:busyMinutes(shifts),clusters:clusterCount(shifts)};
      });
      night.warnings=night.warnings.filter(w=>!w.includes('sammanhängande vila denna natt'));
      for(const r of night.rest.filter(r=>r.longestRest<REST_TARGET_MINUTES)) {
        const p=byId.get(r.personId);
        night.warnings.push(`${displayName(p)} får bara ${formatMinutes(r.longestRest)} sammanhängande vila denna natt (målet är minst 4 h).`);
      }
    }
  }

  const IMPOSSIBLE_MESSAGE = 'Det är matematiskt omöjligt att bemanna detta schema. Kontakta din chef';
  const SEARCH_LIMIT_MESSAGE = 'Schemaläggaren kunde inte hitta en fullständig bemanning inom sökgränsen. Prova att ändra tider eller bemanning och försök igen.';
  let searchLimitReached = false;

  function expectedDutySlots(settings, index, fireWindow, patrolWindow, guardWindow) {
    const jobs = makeSlots(fireWindow,settings.fireDuration,'fire').map(slot=>({...slot, people:1}));
    if (patrolWindow && dutyEnabledOnNight(settings,'patrol',index))
      jobs.push(...makeSlots(patrolWindow,settings.patrolDuration,'patrol').map(slot=>({...slot,people:settings.patrolPeople})));
    if (guardWindow && dutyEnabledOnNight(settings,'guard',index))
      jobs.push(...makeSlots(guardWindow,settings.guardDuration,'guard').map(slot=>({...slot,people:settings.guardPeople})));
    return jobs.sort((a,b)=>a.start-b.start||b.people-a.people);
  }

  function fullyStaffed(night, jobs, soldiers) {
    for (const job of jobs) {
      const matched=night.assignments.filter(a=>a.type===job.type&&a.start===job.start&&a.end===job.end);
      if (matched.length!==job.people || new Set(matched.map(a=>a.personId)).size!==matched.length) return false;
    }
    return night.assignments.every(a=>jobs.some(j=>j.type===a.type&&j.start===a.start&&j.end===a.end)) &&
      soldiers.filter(p=>p.driver).every(p=>maxRestGap(night.bounds,night.assignments.filter(a=>a.personId===p.id))>=DRIVER_REST_MINUTES);
  }

  // Reservlösning: samtliga tjänster måste tillsättas. Endast förarnas 6 h vila
  // och samtidiga dubbelbokningar är absoluta. Övriga mål blir mjuka.
  function rescueNight(jobs, bounds, soldiers, history, trial, strictTwo = false) {
    const poolByType={fire:soldiers.filter(canTakeFire),patrol:soldiers.filter(canTakePatrol),guard:soldiers.filter(canTakeGuard)};
    if (jobs.some(j=>poolByType[j.type].length<j.people)) return null;
    const nonDrivers=soldiers.filter(p=>!p.driver && !p.excluded).length;
    const drivers=soldiers.filter(p=>p.driver && !p.excluded).length;
    const totalDemand=jobs.reduce((sum,j)=>sum+j.people,0);
    // With contiguous fire -> patrol blocks and no duplicate duty types, nobody can take more than two slots.
    if (!state.settings.guardEnabled && totalDemand > soldiers.filter(p=>canTakeFire(p)||canTakePatrol(p)).length*2) return null;
    // Skip strict search when two assignments per eligible person cannot cover demand.
    if(strictTwo && totalDemand>soldiers.filter(p=>poolByType.fire.includes(p)||poolByType.patrol.includes(p)||poolByType.guard.includes(p)).length*2) return null;
    const maxShifts=understaffedMode() ? 2 : strictTwo ? 2 : Math.max(3,Math.ceil((totalDemand-drivers)/Math.max(1,nonDrivers)));
    const maxByType=Object.fromEntries(['fire','patrol','guard'].map(type=>{
      const pool=poolByType[type],normal=pool.filter(p=>!p.driver).length;
      const eligibleDrivers=pool.filter(p=>p.driver).length;
      const demand=jobs.filter(j=>j.type===type).reduce((sum,j)=>sum+j.people,0);
      return [type,understaffedMode() ? 2 : strictTwo ? 1 : Math.max(2,Math.ceil((demand-eligibleDrivers)/Math.max(1,normal)))];
    }));
    const assigned=new Map(soldiers.map(p=>[p.id,[]]));
    const rows=[];
    const maxNodes=strictTwo ? 15000 : 120000;
    let visited=0;
    let limitReached=false;
    const failedStates=new Set();
    const order=[...jobs].sort((a,b)=>a.start-b.start || b.people-a.people);
    function search(pos) {
      if(pos===order.length)return true;
      if(++visited>maxNodes){limitReached=true;return false;}
      const job=order[pos], people=poolByType[job.type];
      const key=pos+'|'+soldiers.map(p=>assigned.get(p.id).map(a=>a.start+':'+a.end).join(',')).join('|');
      if(failedStates.has(key))return false;
      const ranked=people.filter(p=>{
        const existing=assigned.get(p.id);
        // Reservsökningen får aldrig stapla obegränsat många pass på en soldat.
        // Tre behövs i belastade nattupplägg med fler personpass än två per person.
        if(existing.length >= (state.settings.guardEnabled ? maxShifts : 2)) return false;
        if(existing.filter(a=>a.type===job.type).length >= (state.settings.guardEnabled || understaffedMode() ? maxByType[job.type] : 1)) return false;
        if(existing.some(a=>overlaps(a,job)))return false;
        if(!patrolOrderValid([...existing,job]))return false;
        return !p.driver || maxRestGap(bounds,[...existing,job])>=DRIVER_REST_MINUTES;
      }).sort((a,b)=>{
        const weight=p=>{
          const prior=assigned.get(p.id);
          const recent=history.get(p.id)||{bad:0,good:0,load:0};
          const q=shiftQuality(job,bounds);
          const rest=maxRestGap(bounds,[...prior,job]);
          const shiftCount=prior.length;
          return shiftCount*900 + (bounds.end-bounds.start-rest)*1.7 +
            (q.bad?recent.bad*380:0) + (q.good?recent.good*95:0) +
            recent.load*.15 + (p.driver && !(job.type === 'patrol' && job.end === makeWindow(state.settings.patrolStart,state.settings.patrolEnd,parseClock(state.settings.fireStart))?.end) ? Math.max(0,job.start-bounds.start)*4 : 0) +
            ((soldiers.indexOf(p)*31+trial*17+pos*13)%37);
        };
        return weight(a)-weight(b);
      });
      // Välj hela patrull-/vaktparet atomärt, utan överlapp mellan partners.
      function pick(k,from) {
        if(k===job.people)return search(pos+1);
        for(let idx=from;idx<ranked.length;idx++) {
          const p=ranked[idx], row={type:job.type,start:job.start,end:job.end,
            personId:p.id,pairId:job.type+'-'+pos,
            externalPartner:job.type==='guard'&&job.people===1};
          assigned.get(p.id).push(row);rows.push(row);
          if(pick(k+1,idx+1))return true;
          rows.pop();assigned.get(p.id).pop();
          if(visited>maxNodes)return false;
        }
        return false;
      }
      const found=pick(0,0);
      if(!found && !limitReached)failedStates.add(key);
      return found;
    }
    if(!search(0)){
      if(limitReached)searchLimitReached=true;
      return null;
    }
    return rows;
  }

  function generatePlan() {
    readSettingsFromControls();
    const errors = validateBeforeGenerate();
    if (errors.length) { els.generateMessage.textContent = errors[0]; return; }
    els.generateMessage.textContent = '';

    const s = state.settings;
    const lowStaffWarning = understaffedMode() ? 'VARNING: Färre än 9 aktiva soldater. Undantag från ordinarie passregler kan krävas. Förare ska fortfarande få minst 6 timmars sammanhängande vila. ' : '';
    searchLimitReached=false;
    const historical = state.lockedNights > 0 && state.generated?.nights
      ? state.generated.nights.slice(0,state.lockedNights)
      : s.nightCount === 0 && state.generated?.settings?.nightCount === 0 ? state.generated.nights : [];
    const targetNightCount = s.nightCount === 0 ? historical.length + 1 : s.nightCount;
    if (targetNightCount <= historical.length) { els.generateMessage.textContent='Välj fler nätter än de redan låsta.'; return; }
    const fireRaw = parseClock(s.fireStart);
    const fireWindow = makeWindow(s.fireStart, s.fireEnd, fireRaw);
    const patrolWindow = s.patrolEnabled ? makeWindow(s.patrolStart, s.patrolEnd, fireRaw) : null;
    const guardWindow = s.guardEnabled ? makeWindow(s.guardStart, s.guardEnd, fireRaw) : null;
    const bounds = {
      start: Math.min(fireWindow.start, patrolWindow?.start ?? Infinity, guardWindow?.start ?? Infinity),
      end: Math.max(fireWindow.end, patrolWindow?.end ?? -Infinity, guardWindow?.end ?? -Infinity)
    };
    const eligible = state.soldiers.filter(p => canTakeFire(p) || canTakePatrol(p) || canTakeGuard(p));
    if (!s.guardEnabled && s.patrolEnabled && Array.from({length:targetNightCount-historical.length},(_,i)=>i+historical.length).some(i=>dutyEnabledOnNight(s,'patrol',i) && makeSlots(fireWindow,s.fireDuration,'fire').length+makeSlots(patrolWindow,s.patrolDuration,'patrol').length*s.patrolPeople>eligible.length*2)) {
      els.generateMessage.textContent=lowStaffWarning+IMPOSSIBLE_MESSAGE;
      return;
    }
    const fireEligible = state.soldiers.filter(canTakeFire);
    const patrolEligible = state.soldiers.filter(canTakePatrol);
    const guardEligible = state.soldiers.filter(canTakeGuard);
    const historyMinutes = new Map(eligible.map(p => [p.id, 0]));
    let bestPlan = null, bestScore = Infinity;
    for (let trial = 0; trial < (targetNightCount === 1 ? 1 : 90); trial++) {
    const nights = [...historical];
    const historyRest = new Map(eligible.map(p => [p.id, 0]));
    const shortRestCounts = new Map(eligible.map(p => [p.id, 0]));
    const qualityHistory = new Map(eligible.map(p=>[p.id,{bad:0,good:0,lastBad:false}]));
    historyMinutes.forEach((_,id) => historyMinutes.set(id,0));
    for (const previous of historical) {
      for(const p of eligible) {
        const duties=previous.assignments.filter(a=>a.personId===p.id);
        const rest=previous.rest.find(r=>r.personId===p.id);
        if (!rest && duties.length===0) continue; // Nya soldater får ingen påhittad tidigare belastning.
        const quality=qualityHistory.get(p.id);
        const bad=duties.filter(d=>shiftQuality(d,previous.bounds).bad).length;
        quality.bad+=bad; quality.good+=duties.filter(d=>shiftQuality(d,previous.bounds).good).length;
        quality.lastBad=bad>0;
        quality.lastHeavy=bad>=2;
        quality.credit=Math.max(0,quality.credit + bad*2 + (bad>=2?3:0) - duties.filter(d=>shiftQuality(d,previous.bounds).good).length);
        historyMinutes.set(p.id,(historyMinutes.get(p.id)||0)+(rest?.busy||0));
        historyRest.set(p.id,(historyRest.get(p.id)||0)+(previous.bounds.end-previous.bounds.start-(rest?.longestRest||0)));
      }
    }
    for (let nightIndex = historical.length; nightIndex < targetNightCount; nightIndex++) {
      const assignmentsByPerson = new Map(eligible.map(p => [p.id, []]));
      const assignments = [];
      const warnings = [];

      const addInterval = (person, interval) => {
        const row = { ...interval, personId: person.id };
        assignmentsByPerson.get(person.id).push(row); assignments.push(row); return row;
      };

      const fireSlots = makeSlots(fireWindow, s.fireDuration, 'fire');
      const patrolSlots = patrolWindow && dutyEnabledOnNight(s,'patrol',nightIndex) ? makeSlots(patrolWindow, s.patrolDuration, 'patrol') : [];
      const patrolUsed = new Set();
      const selectPerson = (pool, proposed, filter = () => true) => {
        const args = [pool, assignmentsByPerson, () => proposed, bounds,
          historyMinutes, nightIndex, filter, historyRest, trial, shortRestCounts, false, qualityHistory];
        return chooseCandidate(...args) || chooseCandidate(...args.slice(0,-2), true, qualityHistory);
      };
      for (const slot of fireSlots) {
        const linkedSlotIndex = s.patrolMode === 'linked'
          ? patrolSlots.findIndex((p,i) => !patrolUsed.has(i) && p.start === slot.end) : -1;
        const patrol = linkedSlotIndex >= 0 ? patrolSlots[linkedSlotIndex] : null;
        const pick = selectPerson(fireEligible,
          [slot, patrol && { ...patrol, linked: true }].filter(Boolean),
          p => !patrol || canTakePatrol(p));
        if (!pick) { warnings.push(`Ingen möjlig eldpost ${formatRange(slot.start, slot.end)} utan att bryta vila eller överlapp.`); continue; }
        addInterval(pick.person, slot);
        if (patrol) {
          const pairId = `${nightIndex}-${patrol.start}`;
          addInterval(pick.person, { ...patrol, linked: true, outgoing: true, pairId });
          patrolUsed.add(linkedSlotIndex);
          if (s.patrolPeople === 2) {
            const buddy = selectPerson(patrolEligible,[{...patrol, linked: true, buddy: true, pairId}],p=>p.id!==pick.person.id);
            if (buddy) addInterval(buddy.person,{...patrol, linked: true, buddy: true, pairId});
            else warnings.push(`Ingen ledig patrullkamrat ${formatRange(patrol.start, patrol.end)}.`);
          }
        }
      }
      for(let i=0;i<patrolSlots.length;i++){
        if(patrolUsed.has(i))continue;
        const patrol=patrolSlots[i], pairId=`${nightIndex}-${patrol.start}`;
        let firstId=null;
        for(let k=0;k<s.patrolPeople;k++){
          const pick=selectPerson(patrolEligible,[{...patrol,linked:false,pairId}],p=>p.id!==firstId);
          if(!pick){warnings.push(`Ingen tillgänglig patrull ${formatRange(patrol.start,patrol.end)} (person ${k+1}).`);break;}
          firstId ||= pick.person.id;
          addInterval(pick.person,{...patrol,linked:false,buddy:k===1,pairId});
        }
      }

            if (guardWindow && dutyEnabledOnNight(s,'guard',nightIndex)) {
        const guardSlots = makeSlots(guardWindow, s.guardDuration, 'guard');
        for (const slot of guardSlots) {
          const guardArgs = [guardEligible, assignmentsByPerson, () => [slot], bounds, historyMinutes, nightIndex, () => true, historyRest, trial, shortRestCounts, false, qualityHistory];
          const first = chooseCandidate(...guardArgs) || chooseCandidate(...guardArgs.slice(0,-2), true, qualityHistory);
          const secondArgs = [guardEligible, assignmentsByPerson, () => [slot], bounds, historyMinutes, nightIndex, p => p.id !== first?.person.id, historyRest, trial, shortRestCounts, false, qualityHistory];
          const second = s.guardPeople === 2 && first ? (chooseCandidate(...secondArgs) || chooseCandidate(...secondArgs.slice(0,-2), true, qualityHistory)) : null;
          if (first && (s.guardPeople === 1 || second)) {
            const pairId = `guard-${nightIndex}-${slot.start}`;
            addInterval(first.person, { ...slot, pairId, externalPartner: s.guardPeople === 1 });
            if (second) addInterval(second.person, { ...slot, pairId });
          } else warnings.push(`Vaktpost ${formatRange(slot.start, slot.end)} kan inte bemannas med ${s.guardPeople} från tältet.`);
        }
      }

      for (const p of eligible) {
        const prior = qualityHistory.get(p.id);
        const duties = assignmentsByPerson.get(p.id) || [];
        const bad = duties.filter(d=>shiftQuality(d,bounds).bad).length;
        prior.bad += bad;
        prior.good += duties.filter(d=>shiftQuality(d,bounds).good).length;
        prior.lastBad = bad > 0;
        prior.lastHeavy=bad>=2;
        prior.credit=Math.max(0,prior.credit + bad*2 + (bad>=2?3:0) - duties.filter(d=>shiftQuality(d,bounds).good).length);
      }
      const needed=expectedDutySlots(s,nightIndex,fireWindow,patrolWindow,guardWindow);
      if (!fullyStaffed({assignments,bounds},needed,state.soldiers)) {
        const history=new Map(eligible.map(p=>[p.id,{
          bad:qualityHistory.get(p.id)?.bad||0,
          good:qualityHistory.get(p.id)?.good||0,
          load:historyMinutes.get(p.id)||0
        }]));
        const repaired=rescueNight(needed,bounds,state.soldiers,history,trial,true) || rescueNight(needed,bounds,state.soldiers,history,trial,false);
        if (repaired) {
          assignments.length=0;
          assignments.push(...repaired);
          for(const person of eligible) assignmentsByPerson.set(person.id,repaired.filter(a=>a.personId===person.id));
          warnings.length=0;
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

    if (nights.some(n=>!fullyStaffed(n,expectedDutySlots(s,n.nightIndex,fireWindow,patrolWindow,guardWindow),state.soldiers))) continue;
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
    // Straffa 0/2-pass-split per natt och ojämn total tjänstgöring i fristående läge.
    if (s.patrolEnabled && s.patrolMode === 'independent') {
      const totalsWorked = eligible.map(p => nights.reduce((sum,n) => {
        const row=n.rest.find(r=>r.personId===p.id);
        return sum+(row?.busy||0);
      },0));
      const averageWorked=totalsWorked.reduce((sum,v)=>sum+v,0)/Math.max(1,totalsWorked.length);
      score += totalsWorked.reduce((sum,v)=>sum+(v-averageWorked)**2,0)*12;
      for (const n of nights) {
        const worked=n.rest.map(r=>r.busy);
        const zero=worked.filter(x=>x===0).length;
        const doubled=worked.filter(x=>x>Math.max(s.fireDuration,s.patrolDuration)).length;
        score += Math.min(zero,doubled)*1000000;
      }
    }
    const interruptedNights = nights.flatMap(n => eligible.filter(p => {
      const slots=n.assignments.filter(a=>a.personId===p.id).sort((a,b)=>a.start-b.start);
      return slots.length === 2 && slots[0].end !== slots[1].start;
    }));
    score += interruptedNights.length * 500000000;
    const qualityTotals=eligible.map(p=>({
      perNight:nights.map(n=>n.assignments.filter(a=>a.personId===p.id).filter(a=>shiftQuality(a,n.bounds).bad).length),
      bad:nights.reduce((sum,n)=>sum+n.assignments.filter(a=>a.personId===p.id&&shiftQuality(a,n.bounds).bad).length,0),
      good:nights.reduce((sum,n)=>sum+n.assignments.filter(a=>a.personId===p.id&&shiftQuality(a,n.bounds).good).length,0)
    }));
    for (const key of ['bad','good']) {
      const qualityPool=qualityTotals;
      const avg=qualityPool.reduce((sum,p)=>sum+p[key],0)/Math.max(1,qualityPool.length);
      score += qualityPool.reduce((sum,p)=>sum+(p[key]-avg)**2,0)*(key==='bad'?250000:35000);
    }
    for (const p of qualityTotals) {
      for(let i=1;i<p.perNight.length;i++) if(p.perNight[i]&&p.perNight[i-1]) score += 350000;
    }
    const underRestCounts = eligible.map(p => nights.filter(n => n.rest.some(r => r.personId === p.id && r.longestRest < REST_TARGET_MINUTES)).length);
    // Fördela kortvilan över de aktiva soldaterna i stället för att belasta samma person.
    const repeatShortRest = eligible.reduce((sum,p)=> {
      const short=nights.map(n=>n.rest.some(r=>r.personId===p.id && r.longestRest<REST_TARGET_MINUTES));
      return sum+short.slice(1).filter((v,i)=>v&&short[i]).length;
    },0);
    score += repeatShortRest * 10000000000000;
    // Varje deltagare ska om möjligt få åtminstone ett bra pass under övningen.
    // Låsta nätter ingår men får aldrig ändras.
    score += qualityTotals.reduce((sum,q)=>sum+(q.good===0 ? 5000000000 : 0),0);
    // Nattlig återhämtning: dubbla skitpass en natt bör följas av bra pass nästa.
    for(const p of eligible)for(let i=1;i<nights.length;i++) {
      const previous=nights[i-1].assignments.filter(a=>a.personId===p.id && shiftQuality(a,nights[i-1].bounds).bad).length;
      if(previous>=2 && !nights[i].assignments.some(a=>a.personId===p.id && shiftQuality(a,nights[i].bounds).good))score+=4000000000;
    }
    const extraViolations = underRestCounts.reduce((sum,count) => sum + Math.max(0,count-1),0);
    const violations = underRestCounts.reduce((sum,count)=>sum+count,0);
    score += extraViolations * 1000000000000 + violations * 1000000000;
    score += nights.reduce((sum,n)=>sum+n.warnings.filter(w=>!w.includes('sammanhängande vila denna natt')).length*10000000,0);
    if (score < bestScore) {bestScore=score;bestPlan=nights;}
    }
    if (!bestPlan) {
      state.generated = null;
      els.resultSection.classList.add('hidden');
      els.generateMessage.textContent = lowStaffWarning+(searchLimitReached ? SEARCH_LIMIT_MESSAGE : IMPOSSIBLE_MESSAGE);
      saveStateSoon();
      return;
    }
        balanceDifficultShifts(bestPlan,state.soldiers,historical.length);
        const settingsCopy = typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s));
    if (s.guardEnabled) for (const night of bestPlan) {
      for (const person of eligible) {
        const slots=night.assignments.filter(a=>a.personId===person.id).sort((a,b)=>a.start-b.start);
        if (slots.length === 2 && slots[0].end !== slots[1].start) {
          night.warnings.push(`${displayName(person)} har avbruten sömn mellan två pass. Undantag används eftersom vaktpost är aktiv.`);
        }
      }
    }
    if (tripleDutyOverlap(s)) {
      for (const night of bestPlan.filter(n=>dutyEnabledOnNight(s,'patrol',n.nightIndex)&&dutyEnabledOnNight(s,'guard',n.nightIndex))) night.warnings.unshift('Eldpost, patrull och vaktpost överlappar. Upplägget är inte optimalt: kontrollera bemanning och vila extra noga.');
    }
    // Only final, verifiable warnings belong in a published schedule.
    // Preserve historical nights unchanged in incremental mode.
    for (const night of bestPlan.slice(historical.length)) {
      const finalWarnings = [];
      const extraShifts = eligible.map(person=>({
        person, count:night.assignments.filter(a=>a.personId===person.id).length
      })).filter(item=>item.count>2);
      if (extraShifts.length) {
        const names=extraShifts.map(({person,count})=>`${displayName(person)} (${count} pass)`).join(', ');
        finalWarnings.push(`På grund av låg bemanning måste en del soldater ha tre pass per natt eller fler: ${names}. Kontrollera att vilan är tillräcklig.`);
      }
      for (const row of night.rest) {
        if (row.longestRest < REST_TARGET_MINUTES) {
          const person = state.soldiers.find(p=>p.id===row.personId);
          finalWarnings.push(`${displayName(person)} får bara ${formatMinutes(row.longestRest)} sammanhängande vila denna natt (målet är minst 4 h).`);
        }
      }
      if (dutyEnabledOnNight(s,'guard',night.nightIndex)) {
        for (const person of eligible) {
          const duties=night.assignments.filter(a=>a.personId===person.id).sort((a,b)=>a.start-b.start);
          if (duties.length===2 && duties[0].end!==duties[1].start)
            finalWarnings.push(`${displayName(person)} har avbruten sömn mellan två pass. Undantag används eftersom vaktpost är aktiv.`);
        }
      }
      if (tripleDutyOverlap(s) && dutyEnabledOnNight(s,'patrol',night.nightIndex) && dutyEnabledOnNight(s,'guard',night.nightIndex))
        finalWarnings.unshift('Eldpost, patrull och vaktpost överlappar. Upplägget är inte optimalt: kontrollera bemanning och vila extra noga.');
      night.warnings=[...new Set(finalWarnings)];
    }
        state.generated = { createdAt: new Date().toISOString(), nights: bestPlan, settings: settingsCopy };
    if (s.nightCount === 0) { renderDutyNightChoices(); els.generateButton.textContent='Generera nästa natt'; }
    activeNight = 0; totalView = false; selectedTotalNights = null; sharedUrl=''; els.sharePanel.classList.add('hidden'); saveStateSoon(); renderResults();
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
    if (totalView) { renderTotalView(); return; }
    els.resultTitle.textContent = `Natt ${activeNight + 1} · ${formatNightDate(activeNight)}`;
    els.nightTabs.innerHTML = state.generated.nights.map((_, i) => `<button type="button" class="night-tab ${i === activeNight ? 'active' : ''}" data-night="${i}">Natt ${i+1}</button>`).join('') + '<button type="button" class="night-tab" id="totalTab">Totalt</button>';
    els.nightTabs.querySelectorAll('.night-tab').forEach(btn => btn.addEventListener('click', () => { activeNight = Number(btn.dataset.night); totalView = false; renderResults(); }));
    els.nightTabs.querySelector('#totalTab').addEventListener('click', () => { totalView = true; renderResults(); });
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

  function renderTotalView() {
    const nights = state.generated.nights;
    if (!selectedTotalNights || !selectedTotalNights.some(i => i < nights.length)) selectedTotalNights = nights.map((_,i)=>i);
    selectedTotalNights = selectedTotalNights.filter(i => i < nights.length);
    els.resultTitle.textContent = 'Total vila · valda nätter';
    els.nightTabs.innerHTML = nights.map((_,i)=>`<button type="button" class="night-tab" data-night="${i}">Natt ${i+1}</button>`).join('') +
      '<button type="button" class="night-tab active" id="totalTab">Totalt</button>';
    els.nightTabs.querySelectorAll('[data-night]').forEach(btn => btn.addEventListener('click',()=>{
      activeNight=Number(btn.dataset.night);totalView=false;renderResults();
    }));
    const options = nights.map((_,i)=>`<label class="total-night-choice"><input type="checkbox" data-total-night="${i}" ${selectedTotalNights.includes(i)?'checked':''}>Natt ${i+1}</label>`).join('');
    els.scheduleWarnings.innerHTML = '<p class="hint">Välj vilka nätter som ska ingå i sammanställningen. Total vila räknas som nattens tid minus tjänstgöring, även om vilan är uppdelad.</p>';
    els.scheduleTable.innerHTML = '<div class="total-night-picker">'+options+'</div>';
    els.scheduleTable.querySelectorAll('[data-total-night]').forEach(box=>box.addEventListener('change',()=>{
      const i=Number(box.dataset.totalNight);
      if(box.checked) selectedTotalNights=[...new Set([...selectedTotalNights,i])].sort((a,b)=>a-b);
      else selectedTotalNights=selectedTotalNights.filter(n=>n!==i);
      updateTotalSummary();
    }));
    updateTotalSummary();
    renderTentMaps();
  }

  function updateTotalSummary() {
    const nights=state.generated.nights;
    els.restSummary.innerHTML=state.soldiers.map(p=>{
      const details=selectedTotalNights.map(i=>nights[i]).filter(Boolean).map(n=>{
        const row=n.rest.find(r=>r.personId===p.id);
        return {rest: row ? n.bounds.end-n.bounds.start-row.busy : n.bounds.end-n.bounds.start,
          continuous: row ? row.longestRest : n.bounds.end-n.bounds.start, duty:row?.busy || 0};
      });
      const total=details.reduce((a,b)=>a+b.rest,0);
      const duty=details.reduce((a,b)=>a+b.duty,0);
      const worst=details.length?Math.min(...details.map(d=>d.continuous)):0;
      return `<div class="rest-item"><div><div class="rest-name">${escapeHtml(displayName(p))}</div><div class="rest-meta">${formatMinutes(duty)} tjänst · ${details.length} nätter · kortaste längsta vila ${formatMinutes(worst)}</div></div><div class="rest-hours">Total vila<br>${formatMinutes(total)}</div></div>`;
    }).join('');
  }

  function renderScheduleRows(night) {
    const fireAndGuard = night.assignments.filter(a => a.type === 'fire').map(a => ({ start: a.start, end: a.end, type: a.type, personIds: [a.personId] }));
    const guardGroups = new Map();
    for (const a of night.assignments.filter(a=>a.type==='guard')) {
      const key = a.pairId || `${a.start}-${a.end}`;
      if (!guardGroups.has(key)) guardGroups.set(key,{start:a.start,end:a.end,type:'guard',personIds:[],externalPartner:false});
      const group=guardGroups.get(key);
      group.personIds.push(a.personId);
      group.externalPartner ||= !!a.externalPartner;
    }
    const patrolGroups = new Map();
    for (const a of night.assignments.filter(a => a.type === 'patrol')) {
      const key = a.pairId || `${a.start}-${a.end}`;
      if (!patrolGroups.has(key)) patrolGroups.set(key, { start: a.start, end: a.end, type: 'patrol', personIds: [] });
      patrolGroups.get(key).personIds.push(a.personId);
    }
    const items = [...fireAndGuard, ...guardGroups.values(), ...patrolGroups.values()].sort((a,b) => a.start - b.start || dutyOrder(a.type) - dutyOrder(b.type));
    const byRange = new Map();
    for (const item of items) {
      const key = `${item.start}-${item.end}`; if (!byRange.has(key)) byRange.set(key, { start: item.start, end: item.end, items: [] }); byRange.get(key).items.push(item);
    }
    return [...byRange.values()].sort((a,b) => a.start - b.start).map(row => {
      const assignments = row.items.map(item => {
        const label = item.type === 'fire' ? 'Eldpost' : item.type === 'patrol' ? 'Patrull' : 'Vaktpost';
        const people = item.personIds.map(personWithPlace).concat(item.externalPartner ? ['Soldat från annat tält'] : []).join(' + ');
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
    for (const a of night.assignments.filter(a => a.type === 'fire')) items.push({ ...a, personIds:[a.personId] });
    const guards = new Map();
    for (const a of night.assignments.filter(a => a.type === 'guard')) {
      const key = a.pairId || `${a.start}-${a.end}`;
      if (!guards.has(key)) guards.set(key,{...a,personIds:[],externalPartner:false});
      guards.get(key).personIds.push(a.personId);
      guards.get(key).externalPartner ||= !!a.externalPartner;
    }
    items.push(...guards.values());
    const patrols = new Map();
    for (const a of night.assignments.filter(a => a.type === 'patrol')) {
      const key = a.pairId || `${a.start}-${a.end}`; if (!patrols.has(key)) patrols.set(key,{...a,personIds:[]}); patrols.get(key).personIds.push(a.personId);
    }
    items.push(...patrols.values()); items.sort((a,b)=>a.start-b.start || dutyOrder(a.type)-dutyOrder(b.type));
    for (const item of items) {
      const label = item.type === 'fire' ? 'Eldpost' : item.type === 'patrol' ? 'Patrull' : 'Vaktpost';
      lines.push(`${formatRange(item.start,item.end)}  ${label}: ${item.personIds.map(personWithPlace).concat(item.externalPartner ? ['Soldat från annat tält'] : []).join(' + ')}`);
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
          const items=n.assignments.filter(a=>a.type==='fire').map(a=>[a.type,a.start,a.end,[state.soldiers.findIndex(p=>p.id===a.personId)]]);
          const pairs=new Map();
          for(const a of n.assignments.filter(a=>a.type==='patrol'||a.type==='guard')){
            const key=a.type+'-'+(a.pairId || a.start+'-'+a.end);
            if(!pairs.has(key))pairs.set(key,[a.type,a.start,a.end,[],false]);
            pairs.get(key)[3].push(state.soldiers.findIndex(p=>p.id===a.personId));
            pairs.get(key)[4] ||= !!a.externalPartner;
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

  function changeStaffingMidExercise() {
    const count=state.settings.nightCount===0 ? state.generated?.nights?.length||0 : Math.max(state.generated?.nights?.length||0,state.settings.nightCount||0);
    if(count<2) { alert('Generera ett schema med minst två nätter först.'); return; }
    const answer=prompt(`Hur många nätter är GENOMFÖRDA? (1–${count-1})\\nDe låses och sparas. Bara kommande nätter räknas om.`,String(state.lockedNights||1));
    if(answer===null)return;
    if(!/^\\d+$/.test(answer.trim()) || Number(answer)<1 || Number(answer)>=count) {
      alert(`Ange ett heltal mellan 1 och ${count-1}.`);return;
    }
    if(state.lockedNights && Number(answer)<state.lockedNights) { alert('Redan låsta nätter kan inte låsas upp här.'); return; }
    if(Number(answer)>state.generated.nights.length) { alert('Natten behöver först finnas i det genererade schemat.'); return; }
    state.lockedNights=Number(answer);
    state.generated.nights=state.generated.nights.slice(0,state.lockedNights);
    state.generated.settings.nightCount=state.settings.nightCount;
    els.generateMessage.textContent=`Natt 1–${state.lockedNights} är låsta. Markera avgångna som Ej schema, eller öka antal soldater och fyll i nytillkomna. Klicka sedan Generera schema.`;
    els.generateButton.textContent='Räkna om återstående nätter';
    sharedUrl='';els.sharePanel.classList.add('hidden');
    activeNight=Math.max(0,state.lockedNights-1);totalView=false;
    renderResults();saveStateSoon();
  }

    function bindEvents() {
    els.soldierCount.addEventListener('change', () => resizeSoldierList(Number(els.soldierCount.value)));
    els.nightCount.addEventListener('change', () => { renderDutyNightChoices(); readSettingsFromControls(); });
    [els.startDate, els.fireStart, els.fireEnd, els.fireDuration, els.patrolStart, els.patrolEnd, els.patrolDuration, els.patrolMode, els.patrolPeople, els.guardStart, els.guardEnd, els.guardDuration, els.guardPeople].forEach(el => el.addEventListener('change', () => { readSettingsFromControls(); els.resultSection.classList.add('hidden'); }));
    [els.patrolEnabled, els.guardEnabled, els.allowPcFire, els.allowPcPatrol, els.allowStfFire, els.allowStfPatrol].forEach(el => el.addEventListener('change', () => { updateOptionalFields(); readSettingsFromControls(); els.resultSection.classList.add('hidden'); }));
    els.generateButton.addEventListener('click', generatePlan);
    els.changeStaffingButton.addEventListener('click',changeStaffingMidExercise);
    els.nightCount.addEventListener('change',()=>{els.generateButton.textContent=els.nightCount.value==='0'?'Generera nästa natt':'Generera schema';});
    els.copyButton.addEventListener('click', copyCurrentNight);
    els.shareButton.addEventListener('click', makeShareLink);
    els.shareCopyButton.addEventListener('click', copyShareLink);
    els.nativeShareButton.addEventListener('click', shareUsingPhone);
    els.resetButton.addEventListener('click', () => {
      if (!confirm('Nollställa alla namn, tider och sparade scheman på den här telefonen?')) return;
      localStorage.removeItem(STORAGE_KEY); state = makeDefaultState(); activeNight = 0; syncControlsFromState(); renderSoldiers(); renderTentMaps(); els.resultSection.classList.add('hidden'); els.generateMessage.textContent = ''; saveStateSoon();
    });
  }

  initOptions(); syncControlsFromState();
  if(state.lockedNights) els.generateButton.textContent='Räkna om återstående nätter';
  else if(state.settings.nightCount===0) els.generateButton.textContent='Generera nästa natt'; renderSoldiers(); renderTentMaps(); bindEvents();
  if (state.generated?.nights?.length) { els.resultSection.classList.remove('hidden'); renderResults(); }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
})();
