'use strict';
const $ = id => document.getElementById(id);
const money = n => Number(n).toLocaleString('ja-JP') + '円';
const current = new Date();
const currentYear = String(current.getFullYear());
const currentMonth = String(current.getMonth() + 1).padStart(2, '0');
const sum = records => records.reduce((s,r) => ({base:s.base+Number(r.base_salary),fare:s.fare+Number(r.transportation_fee),count:s.count+1}), {base:0,fare:0,count:0});
const total = s => s.base+s.fare;
const yearRows = (records,year,place) => records.filter(r=>r.work_date.slice(0,4)===year && (!place || String(r.workplace_id)===place));
const monthRows = (records,month) => records.filter(r=>!month || r.work_date.slice(5,7)===month);
const option = (value,label) => new Option(label,value);
let ready = false;
function fillFilters(records) {
    const year = $('year').value || currentYear, place = $('place').value;
    const years = [...new Set([currentYear,...records.map(r=>r.work_date.slice(0,4))])].sort().reverse();
    $('year').replaceChildren(...years.map(y=>option(y,y+'年')));
    $('year').value = years.includes(year)?year:currentYear;
    const places = new Map(WorkDB.places().map(p=>[String(p.id),p.name]));
    for(const r of records) if(!places.has(String(r.workplace_id))) places.set(String(r.workplace_id),r.workplace_name_snapshot);
    $('place').replaceChildren(option('','全勤務先'),...[...places].map(([id,name])=>option(id,name)));
    $('place').value = places.has(place)?place:'';
    return places;
}
function putSum(prefix,s) {
    $(prefix+'Base').textContent=money(s.base);
    $(prefix+'Fare').textContent=money(s.fare);
    $(prefix+'Total').textContent=money(total(s));
}
function summaryRow(label,s,action,active) {
    const row=document.createElement('div'); row.className='summaryRow';
    const btn=document.createElement('button'); btn.type='button'; btn.className='summaryLink'; btn.textContent=label; btn.setAttribute('aria-pressed',String(active)); btn.onclick=action;
    const info=document.createElement('div'); info.className='summaryAmount';
    const main=document.createElement('strong'); main.textContent=money(total(s));
    const detail=document.createElement('small'); detail.textContent=`基本給 ${money(s.base)} ＋ 交通費 ${money(s.fare)} / ${s.count}件`;
    info.append(main,detail); row.append(btn,info); return row;
}
function render() {
    if(!ready)return;
    const all=WorkDB.list(), places=fillFilters(all);
    const year=$('year').value, month=$('month').value, place=$('place').value, q=$('search').value.trim().toLowerCase();
    const annual=yearRows(all,year,place), period=monthRows(annual,month);
    const placeName=places.get(place)||'全勤務先';
    $('annualScope').textContent=year+'年 / '+placeName;
    $('periodScope').textContent=year+'年 '+(month?Number(month)+'月':'全月')+' / '+placeName;
    putSum('annual',sum(annual)); putSum('period',sum(period));
    $('periodCount').textContent=period.length+'件（勤務日×勤務先）';
    $('monthlySummary').replaceChildren(...Array.from({length:12},(_,i)=>{
        const m=String(i+1).padStart(2,'0');
        return summaryRow(`${i+1}月`,sum(monthRows(annual,m)),()=>{$('month').value=m;render();},month===m);
    }));
    const groups=new Map();
    for(const r of monthRows(yearRows(all,year,''),month)) {
        const id=String(r.workplace_id); if(!groups.has(id))groups.set(id,[]); groups.get(id).push(r);
    }
    const rows=[...groups].map(([id,rs])=>summaryRow(places.get(id)||rs[0].workplace_name_snapshot,sum(rs),()=>{$('place').value=id;render();},place===id));
    if(!rows.length){const p=document.createElement('p');p.textContent='この期間の勤務記録はありません。';rows.push(p);}
    $('placeSummary').replaceChildren(...rows);
    const filtered=period.filter(r=>`${r.workplace_name_snapshot} ${places.get(String(r.workplace_id))||''} ${r.memo||''}`.toLowerCase().includes(q));
    $('message').textContent=filtered.length+'件 / 表示中の総支給額 '+money(total(sum(filtered)));
    $('records').replaceChildren();
    if(!filtered.length){const p=document.createElement('p');p.textContent='該当する勤務記録はありません。';$('records').append(p);return;}
    for(const r of filtered) renderRecord(r);
}
function renderRecord(r) {
    const a=document.createElement('article'), h=document.createElement('h3');h.textContent=r.work_date+' '+r.workplace_name_snapshot;a.append(h);
    for(const i of WorkDB.items(r.id)){
        const p=document.createElement('p');
        p.textContent=(i.pay_type==='piecework'?'採点・'+i.subject+' / 単価 '+money(i.unit_rate)+' × 合計工数 '+i.effort+' / 計算額 '+i.exact_amount+'円':(i.lesson_code??(i.start_time?i.start_time+'〜'+i.end_time:'直接入力')))+' / '+money(i.amount);a.append(p);
    }
    const p=document.createElement('p');p.textContent='基本給 '+money(r.base_salary)+' / 交通費 '+money(r.transportation_fee)+' / 総支給 '+money(r.base_salary+r.transportation_fee);a.append(p);
    const memo=document.createElement('p');memo.textContent=r.memo;a.append(memo);
    const edit=document.createElement('button');edit.type='button';edit.textContent='交通費・備考を修正';edit.onclick=async()=>{const f=prompt('交通費（円）',r.transportation_fee);if(f===null||!/^\d+$/.test(f)||!Number.isSafeInteger(Number(f)))return;const m=prompt('備考',r.memo);if(m===null)return;try{await WorkDB.edit(r.id,Number(f),m);render();}catch(e){alert(e.message);}};
    const del=document.createElement('button');del.type='button';del.textContent='削除';del.onclick=async()=>{if(confirm('この日の勤務記録と明細を削除しますか？'))try{await WorkDB.remove(r.id);render();}catch(e){alert(e.message);}};
    const actions=document.createElement('div');actions.className='actions';actions.append(edit,del);a.append(actions);$('records').append(a);
}
WorkDB.init(message=>{$('message').textContent=message;}).then(()=>{
    for(let i=1;i<=12;i++)$('month').append(option(String(i).padStart(2,'0'),i+'月'));
    $('month').value=currentMonth;ready=true;
    for(const id of ['year','month','place'])$(id).addEventListener('change',render);
    $('search').addEventListener('input',render);
    $('resetFilters').onclick=()=>{$('year').value=currentYear;$('month').value=currentMonth;$('place').value='';$('search').value='';render();};
    render();
}).catch(e=>{$('message').textContent='SQLite準備失敗: '+e.message;console.error(e);});
