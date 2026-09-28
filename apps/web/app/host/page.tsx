'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ensureUser } from '../../lib/auth';

type Clue={prompt:string;answer:string;value:number};
type Cat={name:string;clues:Clue[]};
const values=[200,400,600,800,1000];
const blankClues=()=>values.map(value=>({prompt:'',answer:'',value}));
const starter:Cat[]=[
 {name:'General Knowledge',clues:blankClues()},
 {name:'Sports',clues:blankClues()},
 {name:'Movies & TV',clues:blankClues()},
 {name:'Science',clues:blankClues()},
 {name:'History',clues:blankClues()}
];
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
function slugify(v:string){return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Math.random().toString(36).slice(2,7)}

export default function Host(){
 const router=useRouter(); const [name,setName]=useState('Friday Night Trivia'); const [cats,setCats]=useState<Cat[]>(starter); const [sourceSetId,setSourceSetId]=useState<string|null>(null); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const clueCount=useMemo(()=>cats.reduce((n,c)=>n+c.clues.filter(q=>q.prompt.trim()&&q.answer.trim()).length,0),[cats]);

 useEffect(()=>{ void loadQuestionSetFromUrl(); },[]);

 async function loadQuestionSetFromUrl(){
  const setId=new URLSearchParams(window.location.search).get('set');
  if(!setId) return;
  const {data:set,error:setErr}=await supabase.from('question_sets').select('id,title,source_set_id').eq('id',setId).single();
  if(setErr||!set){setError(setErr?.message||'Question set not found.');return;}
  const {data:rows,error:qErr}=await supabase.from('question_set_questions')
    .select('category_name,category_order,prompt,answer,value,question_order')
    .eq('set_id',setId).order('category_order').order('question_order');
  if(qErr){setError(qErr.message);return;}
  const grouped=new Map<number,Cat>();
  (rows||[]).forEach((row:any)=>{
    if(!grouped.has(row.category_order)) grouped.set(row.category_order,{name:row.category_name,clues:[]});
    grouped.get(row.category_order)!.clues.push({prompt:row.prompt,answer:row.answer,value:row.value});
  });
  const loaded=Array.from(grouped.entries()).sort((a,b)=>a[0]-b[0]).map(([,cat])=>cat);
  if(loaded.length){setCats(loaded);setName(set.title);setSourceSetId(set.source_set_id||set.id);}
 }
 const updateCat=(i:number,patch:Partial<Cat>)=>setCats(cats.map((c,x)=>x===i?{...c,...patch}:c));
 const updateClue=(ci:number,qi:number,key:'prompt'|'answer',value:string)=>setCats(cats.map((c,x)=>x!==ci?c:{...c,clues:c.clues.map((q,y)=>y===qi?{...q,[key]:value}:q)}));
 async function createGame(){
  setError(''); setSaving(true);
  try{
   const user=await ensureUser(); const code=roomCode();
   const {data:game,error:gErr}=await supabase.from('games').insert({host_id:user.id,name:name.trim()||'Trivia Night',code,status:'lobby',source_question_set_id:sourceSetId}).select().single();
   if(gErr||!game) throw gErr||new Error('Could not create game');
   for(let ci=0;ci<cats.length;ci++){
    const cat=cats[ci]; if(!cat.name.trim()) continue;
    const {data:catalogCat,error:catErr}=await supabase.from('categories').insert({name:cat.name.trim(),slug:slugify(cat.name),created_by:user.id}).select().single();
    if(catErr) throw catErr;
    const {data:gameCat,error:gcErr}=await supabase.from('game_categories').insert({game_id:game.id,category_id:catalogCat?.id??null,name:cat.name.trim(),sort_order:ci}).select().single();
    if(gcErr||!gameCat) throw gcErr||new Error('Could not create category');
    const authored=cat.clues.map((q,sort_order)=>({...q,sort_order})).filter(q=>q.prompt.trim()&&q.answer.trim());
    if(authored.length){
      const rows=authored.map(q=>({game_id:game.id,game_category_id:gameCat.id,prompt:q.prompt.trim(),value:q.value,sort_order:q.sort_order}));
      const {data:created,error:qErr}=await supabase.from('game_questions').insert(rows).select('id,sort_order');
      if(qErr||!created) throw qErr||new Error('Could not create clues');
      const answers=created.map(q=>({question_id:q.id,game_id:game.id,answer:authored.find(a=>a.sort_order===q.sort_order)!.answer.trim()}));
      const {error:aErr}=await supabase.from('game_question_answers').insert(answers);
      if(aErr) throw aErr;
    }
   }
   router.push(`/host/${code}`);
  }catch(e:any){setError(e?.message||'Could not create game.');setSaving(false);}
 }
 return <main className="shell"><div className="eyebrow">Host studio</div><div className="pageTitle"><div><h1>Build your board.</h1><p className="muted">Categories are flexible. Fill only the clues you want to use.</p></div><div className="statChip">{clueCount} ready clues</div></div>
  <section className="panel"><label className="label">Game name</label><input className="input" value={name} onChange={e=>setName(e.target.value)}/></section>
  <div className="builderGrid">{cats.map((cat,ci)=><section className="categoryEditor" key={ci}><div className="categoryEditorHead"><input className="categoryName" value={cat.name} onChange={e=>updateCat(ci,{name:e.target.value})}/><button className="iconBtn danger" onClick={()=>setCats(cats.filter((_,x)=>x!==ci))} title="Remove category">×</button></div>{cat.clues.map((q,qi)=><div className="clueEditor" key={q.value}><div className="valueBadge">{q.value}</div><input placeholder="Clue / question" value={q.prompt} onChange={e=>updateClue(ci,qi,'prompt',e.target.value)}/><input placeholder="Correct answer" value={q.answer} onChange={e=>updateClue(ci,qi,'answer',e.target.value)}/></div>)}</section>)}</div>
  <div className="actions"><button className="btn secondary" onClick={()=>setCats([...cats,{name:`Category ${cats.length+1}`,clues:blankClues()}])}>+ Add category</button><button className="btn" disabled={saving||cats.length===0||clueCount===0} onClick={createGame}>{saving?'Creating room…':'Create live room'}</button></div>{error&&<div className="errorBox">{error}</div>}
 </main>
}
