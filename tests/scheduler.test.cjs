// Eldpost regression tests. Run with: node --test tests/scheduler.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function scheduler() {
  let code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  code = code.replace('    readSettingsFromControls();\n    const errors = validateBeforeGenerate();', '    const errors = validateBeforeGenerate();');
  code = code.replace("    activeNight = 0; totalView = false; selectedTotalNights = null; sharedUrl=''; els.sharePanel.classList.add('hidden'); saveStateSoon(); renderResults();", "    activeNight = 0;");
  code = code.replace("    els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });", '');
  code = code.replace("if (s.nightCount === 0) { renderDutyNightChoices(); els.generateButton.textContent='Generera nästa natt'; }", "if (s.nightCount === 0) { els.generateButton.textContent='Generera nästa natt'; }");
  const marker = '  initOptions(); syncControlsFromState();';
  assert.ok(code.includes(marker), 'Scheduler initialization marker changed; update test harness');
  code = code.slice(0, code.indexOf(marker)) + 'globalThis.runSchedule=st=>{state=st;generatePlan();return {plan:state.generated,error:els.generateMessage.textContent}};})();';
  const elements = new Map();
  const element = () => ({ classList: {add(){},remove(){},toggle(){}}, textContent:'',value:'',checked:false });
  const context = {document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}},
    localStorage:{getItem(){return null},setItem(){}}, crypto:{randomUUID(){return 'test'}},navigator:{}, window:{},Date,Math,structuredClone,clearTimeout(){},setTimeout(){return 1}};
  vm.runInNewContext(code,context,{filename:'app.js'});
  return context.runSchedule;
}

function state({size=10,nights=3,patrolPeople=1,mode='independent',unknown=false,guardPeople=0,duration=60}={}) {
  return {version:1,settings:{
    startDate:'2026-10-21',nightCount:unknown?0:nights,
    fireStart:'22:00',fireEnd:'06:00',fireDuration:duration,
    patrolEnabled:true,patrolNights:Array.from({length:Math.max(nights,3)},(_,i)=>i),
    patrolStart:'22:00',patrolEnd:'06:00',patrolDuration:duration,patrolMode:mode,patrolPeople,
    guardEnabled:guardPeople>0,guardNights:Array.from({length:Math.max(nights,3)},(_,i)=>i),
    guardStart:'22:00',guardEnd:'06:00',guardDuration:duration,guardPeople:guardPeople||1,
    allowPcFire:true,allowPcPatrol:false,allowStfFire:false,allowStfPatrol:false
  },soldiers:Array.from({length:size},(_,i)=>({
    id:'s'+i,name:i===0?'Plutonchef':'Soldat '+i,sleepPlace:i+1,
    driver:i===1||i===2,pc:i===0,stf:false,excluded:false
  })),generated:null};
}
function assertSafe(plan, st) {
  assert.ok(plan && plan.nights, 'Expected a generated schedule');
  for(const night of plan.nights) {
    const fire = night.assignments.filter(a=>a.type==='fire');
    const patrol = night.assignments.filter(a=>a.type==='patrol');
    assert.equal(fire.length,480/st.settings.fireDuration,'Full fire coverage');
    assert.equal(patrol.length,480/st.settings.patrolDuration*st.settings.patrolPeople,'Full patrol coverage');
    for(const p of st.soldiers) {
      const shifts = night.assignments.filter(a=>a.personId===p.id);
      for(let i=0;i<shifts.length;i++) for(let j=i+1;j<shifts.length;j++)
        assert.ok(shifts[i].end<=shifts[j].start||shifts[j].end<=shifts[i].start,'No simultaneous duties');
      if(p.pc) assert.ok(shifts.every(a=>a.type==='fire'),'Platoon leader cannot patrol or guard');
      if(p.driver) {
        const rest=night.rest.find(r=>r.personId===p.id);
        assert.ok(rest && rest.longestRest>=360,'Driver must have six continuous hours of rest');
      }
    }
  }
}
const run=scheduler();
for(const size of [6,8,10,12,16]) for(const nights of [1,3]) for(const patrolPeople of [1,2])
  for(const mode of ['independent','linked'])
    test(`normal: ${size} people, ${nights} nights, ${patrolPeople} patrol, ${mode}`,()=>{
      const st=state({size,nights,patrolPeople,mode});
      const {plan,error}=run(st);
      assert.ok(plan,error);
      assertSafe(plan,st);
      const counts=st.soldiers.filter(p=>!p.driver).map(p=>plan.nights.reduce((n,night)=>
        n+night.assignments.filter(a=>a.personId===p.id && (a.start%1440)>=120 && (a.start%1440)<300).length,0));
      assert.ok(Math.max(...counts)-Math.min(...counts)<=2,'Difficult shifts should be shared');
    });

for(const mode of ['independent','linked']) for(const size of [8,10,12])
  test(`unknown mode preserves earlier nights: ${mode}, ${size} people`,()=>{
    const st=state({size,unknown:true,mode});
    for(let i=0;i<3;i++){
      const existing=st.generated?.nights.map(n=>JSON.stringify(n))||[];
      const {plan,error}=run(st);
      assert.ok(plan,error);
      assert.equal(plan.nights.length,i+1);
      existing.forEach((value,j)=>assert.equal(JSON.stringify(plan.nights[j]),value,'Previous night must be immutable'));
      assertSafe(plan,st);
      st.generated=plan;
    }
  });

test('impossible small team does not publish incomplete schedule',()=>{
  const st=state({size:4,patrolPeople:2,nights:1});
  const {plan,error}=run(st);
  assert.equal(plan,null);
  assert.ok(error.length>0);
});

test('heavy patrol coverage never gives more than three shifts per person',()=>{
  const st=state({size:10,nights:3,patrolPeople:2});
  const {plan,error}=run(st);
  assert.ok(plan,error);
  assertSafe(plan,st);
  for(const night of plan.nights) for(const p of st.soldiers) {
    const shifts=night.assignments.filter(a=>a.personId===p.id);
    assert.ok(shifts.length<=3,'No soldier may receive four or more shifts in one night');
    for(const type of ['fire','patrol','guard'])
      assert.ok(shifts.filter(a=>a.type===type).length<=2,'At most two shifts of the same kind');
  }
});

test('warns when low staffing requires more than two shifts',()=>{
  const st=state({size:10,nights:3,patrolPeople:2});
  const {plan,error}=run(st);
  assert.ok(plan,error);
  assertSafe(plan,st);
  for(const night of plan.nights){
    const overloaded=st.soldiers.filter(p=>night.assignments.filter(a=>a.personId===p.id).length>2);
    assert.ok(overloaded.length>0,'This scenario requires more than two shifts per person');
    assert.ok(night.warnings.some(w=>w.includes('På grund av låg bemanning måste en del soldater ha tre pass per natt')),
      'Must display the staffing exception warning');
  }
});

test('normal ten-person fire and single patrol fits two-shift limit fairly',()=>{
  const st=state({size:10,nights:3,patrolPeople:1});
  const {plan,error}=run(st);
  assert.ok(plan,error);
  assertSafe(plan,st);
  for(const night of plan.nights) for(const p of st.soldiers)
    assert.ok(night.assignments.filter(a=>a.personId===p.id).length<=2,
      'Ten-person standard patrol must not require a third shift');
  const counts=st.soldiers.filter(p=>!p.driver).map(p=>plan.nights.reduce((sum,night)=>
    sum+night.assignments.filter(a=>a.personId===p.id && a.start%1440>=120 && a.start%1440<300).length,0));
  assert.ok(Math.max(...counts)-Math.min(...counts)<=1,'Bad shifts must be shared as equally as possible');
});

test('short rest rotates rather than repeating on consecutive nights in heavy standard setup',()=>{
  const st=state({size:10,nights:3,patrolPeople:2});
  const {plan,error}=run(st);
  assert.ok(plan,error);
  assertSafe(plan,st);
  for(const p of st.soldiers.filter(p=>!p.driver)) {
    const short=plan.nights.map(n=>n.rest.find(r=>r.personId===p.id).longestRest<240);
    for(let i=1;i<short.length;i++)
      assert.ok(!(short[i] && short[i-1]),'The same soldier should not get short rest on consecutive nights in this scenario');
  }
});

test('drivers may receive difficult shifts but always retain six consecutive hours of rest',()=>{
  const st=state({size:10,nights:3,patrolPeople:1});
  const {plan,error}=run(st);
  assert.ok(plan,error);
  assertSafe(plan,st);
  const drivers=st.soldiers.filter(p=>p.driver);
  const difficult=drivers.reduce((sum,p)=>sum+plan.nights.reduce((n,night)=>
    n+night.assignments.filter(a=>a.personId===p.id && a.start%1440>=120 && a.start%1440<300).length,0),0);
  assert.ok(difficult>0,'Drivers should be eligible for difficult shifts when rest allows it');
  for(const night of plan.nights) for(const p of drivers)
    assert.ok(night.rest.find(r=>r.personId===p.id).longestRest>=360);
});
