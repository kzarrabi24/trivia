'use client';

import { useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { uploadQuestionMedia } from '../../../lib/questionMedia';
import type { GameType,MediaType } from '@buzzboard/shared';

type Clue={prompt:string;answer:string;value:number;choices:string[];correctIndex:number;media_url:string|null;media_type:MediaType|null};
type Cat={name:string;clues:Clue[]};
const values=[200,400,600,800,1000];
const blank=(value=200):Clue=>({prompt:'',answer:'',value,choices:['','','',''],correctIndex:0,media_url:null,media_type:null});
const blankClues=()=>values.map(v=>blank(v));

export default function NewQuestionSet(){
 const router=useRouter();
 const [user,setUser]=useState<any>(null); const [ready,setReady]=useState(false);
 const [title,setTitle]=useState(''); const [description,setDescription]=useState('');
 const [published,setPublished]=useState(true); const [gameType,setGameType]=useState<GameType>('jeopardy');
 const [cats,setCats]=useState<Cat[]>([{name:'Category 1',clues:blankClues()}]);
 const [saving,setSaving]=useState(false); const [uploading,setUploading]=useState(''); const [error,setError]=useState('');
 const clueCount=useMemo(()=>cats.reduce((n,c)=>n+c.clues.filter(q=>q.prompt.trim()&&resolvedAnswer(q).trim()).length,0),[cats,gameType]);

 useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();setUser(user||null);setReady(true)})()},[]);
 function resolvedAnswer(q:Clue){return gameType==='multiple_choice'?(q.choices[q.correctIndex]||''):q.answer}
 function patchClue(ci:number,qi:number,patch:Partial<Clue>){setCats(v=>v.map((c,x)=>x!==ci?c:{...c,clues:c.clues.map((q,y)=>y===qi?{...q,...patch}:q)}))}
 function patchChoice(ci:number,qi:number,index:number,value:string){setCats(v=>v.map((c,x)=>x!==ci?c:{...c,clues:c.clues.map((q,y)=>y!==qi?q:{...q,choices:q.choices.map((z,j)=>j===index?value:z)})}))}
 async function media(ci:number,qi:number,file?:File){if(!file||!user)return;setUploading(ci+'-'+qi);setError('');try{patchClue(ci,qi,await uploadQuestionMedia(file,user.id))}catch(e:any){setError(e?.message||'Upload failed')}finally{setUploading('')}}
 function addQuestion(ci:number){if(clueCount>=200)return;setCats(v=>v.map((c,x)=>x!==ci?c:{...c,clues:[...c.clues,blank(values[c.clues.length%5])]}))}
 function removeQuestion(ci:number,qi:number){setCats(v=>v.map((c,x)=>x!==ci?c:{...c,clues:c.clues.filter((_,y)=>y!==qi)}))}

 async function save(){
  if(!user||user.is_anonymous){setError('A permanent account is required.');return}
  if(clueCount===0||clueCount>200){setError('Add between 1 and 200 complete questions.');return}
  setSaving(true);setError('');
  try{
   const {data:set,error:setErr}=await supabase.from('question_sets').insert({owner_id:user.id,title:title.trim(),description:description.trim(),is_published:published,game_type:gameType}).select('id').single();
   if(setErr||!set)throw setErr||new Error('Could not create set');
   const rows:any[]=[];
   cats.forEach((cat,category_order)=>cat.clues.forEach((q,question_order)=>{
    const answer=resolvedAnswer(q).trim();
    if(cat.name.trim()&&q.prompt.trim()&&answer)rows.push({
     set_id:set.id,category_name:cat.name.trim(),category_order,prompt:q.prompt.trim(),answer,value:q.value,question_order,
     choices:gameType==='multiple_choice'?q.choices.map(x=>x.trim()).filter(Boolean):[],
     media_url:q.media_url,media_type:q.media_type
    });
   }));
   if(rows.length>200)throw new Error('Question sets may contain at most 200 questions.');
   const {error:qErr}=await supabase.from('question_set_questions').insert(rows);if(qErr)throw qErr;
   router.push('/library/'+set.id);
  }catch(e:any){setError(e?.message||'Could not save question set.');setSaving(false)}
 }

 if(!ready)return <main className="shell"><div className="panel">Loading…</div></main>;
 if(!user||user.is_anonymous)return <main className="shell narrow"><div className="eyebrow">Creator access</div><h1>Create question sets</h1><div className="panel"><p className="muted">A permanent account is required.</p><Link className="btn" href="/account">Sign in</Link></div></main>;

 return <main className="shell">
  <div className="pageTitle"><div><div className="eyebrow">Question set creator</div><h1>Build your game.</h1><p className="muted">Choose a format, add up to 200 questions, and optionally attach an image or sound to any question.</p></div><div className="metricPills"><div className="statChip">{clueCount}/200</div><Link className="btn secondary" href="/library/import">Import CSV</Link></div></div>
  <section className="panel formStack">
   <div><label className="label">Set title</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Los Angeles Lakers"/></div>
   <div><label className="label">Description</label><textarea className="input textarea" value={description} onChange={e=>setDescription(e.target.value)}/></div>
   <div><label className="label">Game type</label><div className="gameTypeGrid">
    <button className={gameType==='jeopardy'?'gameTypeCard active':'gameTypeCard'} onClick={()=>setGameType('jeopardy')}><strong>Jeopardy / Buzzer</strong><span>Players buzz first, then answer aloud.</span></button>
    <button className={gameType==='multiple_choice'?'gameTypeCard active':'gameTypeCard'} onClick={()=>setGameType('multiple_choice')}><strong>Multiple Choice</strong><span>Players answer directly on their device.</span></button>
    <button className={gameType==='closest_number'?'gameTypeCard active':'gameTypeCard'} onClick={()=>setGameType('closest_number')}><strong>Closest Number</strong><span>Players enter a number; closest wins the points.</span></button>
   </div></div>
   <label className="checkRow"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)}/><span><strong>Publish to community</strong><small>Other users can browse and save a copy.</small></span></label>
  </section>

  <div className="builderGrid">{cats.map((cat,ci)=><section className="categoryEditor" key={ci}>
   <div className="categoryEditorHead"><input className="categoryName" value={cat.name} onChange={e=>setCats(v=>v.map((c,x)=>x===ci?{...c,name:e.target.value}:c))}/><button className="iconBtn danger" onClick={()=>setCats(v=>v.filter((_,x)=>x!==ci))}>×</button></div>
   {cat.clues.map((q,qi)=><div className="questionEditor" key={qi}>
    <div className="questionEditorTop"><span className="valueBadge compact">{q.value}</span><input className="input" placeholder="Question / clue" value={q.prompt} onChange={e=>patchClue(ci,qi,{prompt:e.target.value})}/><button className="miniDelete" onClick={()=>removeQuestion(ci,qi)}>×</button></div>
    {gameType==='jeopardy'&&<input className="input" placeholder="Correct answer" value={q.answer} onChange={e=>patchClue(ci,qi,{answer:e.target.value})}/>}
    {gameType==='closest_number'&&<input className="input" type="number" step="any" placeholder="Target number" value={q.answer} onChange={e=>patchClue(ci,qi,{answer:e.target.value})}/>}
    {gameType==='multiple_choice'&&<div className="choiceEditor">{q.choices.map((choice,i)=><label className="choiceEdit" key={i}><input type="radio" name={'correct-'+ci+'-'+qi} checked={q.correctIndex===i} onChange={()=>patchClue(ci,qi,{correctIndex:i})}/><input className="input" placeholder={'Choice '+String.fromCharCode(65+i)} value={choice} onChange={e=>patchChoice(ci,qi,i,e.target.value)}/></label>)}</div>}
    <div className="mediaEditor"><label className="btn secondary mediaUploadBtn">{uploading===ci+'-'+qi?'Uploading…':q.media_url?'Replace media':'Add image or sound'}<input hidden type="file" accept="image/*,audio/*" onChange={e=>void media(ci,qi,e.target.files?.[0])}/></label>{q.media_url&&<div className="mediaPreview">{q.media_type==='image'?<img src={q.media_url} alt="Question media"/>:<audio controls src={q.media_url}/>}<button className="miniDelete" onClick={()=>patchClue(ci,qi,{media_url:null,media_type:null})}>×</button></div>}</div>
   </div>)}
   <button className="addQuestionBtn" disabled={clueCount>=200} onClick={()=>addQuestion(ci)}>+ Add question</button>
  </section>)}</div>
  <div className="actions"><button className="btn secondary" onClick={()=>setCats(v=>[...v,{name:'Category '+(v.length+1),clues:blankClues()}])}>+ Add category</button><button className="btn" disabled={saving||!title.trim()||clueCount===0||clueCount>200} onClick={save}>{saving?'Saving…':published?'Publish question set':'Save private set'}</button></div>
  {error&&<div className="errorBox">{error}</div>}
 </main>
}
