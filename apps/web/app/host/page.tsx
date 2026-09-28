'use client';
import { useEffect,useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { ensureUser } from '../../lib/auth';
import { uploadQuestionMedia } from '../../lib/questionMedia';
import type { GameType,MediaType } from '@buzzboard/shared';

type Clue={prompt:string;answer:string;value:number;choices:string[];correctIndex:number;media_url:string|null;media_type:MediaType|null};
type Cat={name:string;clues:Clue[]};
const values=[200,400,600,800,1000];
const blank=(value=200):Clue=>({prompt:'',answer:'',value,choices:['','','',''],correctIndex:0,media_url:null,media_type:null});
const blankClues=()=>values.map(v=>blank(v));
const starter:Cat[]=[{name:'General Knowledge',clues:blankClues()},{name:'Sports',clues:blankClues()},{name:'Movies & TV',clues:blankClues()},{name:'Science',clues:blankClues()},{name:'History',clues:blankClues()}];
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}
function slugify(v:string){return v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Math.random().toString(36).slice(2,7)}
function shuffle<T>(items:T[]){const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy}

export default function Host(){
 const router=useRouter();
 const [name,setName]=useState('Friday Night Trivia'); const [gameType,setGameType]=useState<GameType>('jeopardy');
 const [cats,setCats]=useState<Cat[]>(starter); const [sourceSetId,setSourceSetId]=useState<string|null>(null);
 const [saving,setSaving]=useState(false); const [uploading,setUploading]=useState(''); const [error,setError]=useState('');
 const answerFor=(q:Clue)=>gameType==='multiple_choice'?(q.choices[q.correctIndex]||''):q.answer;
 const clueCount=useMemo(()=>cats.reduce((n,c)=>n+c.clues.filter(q=>q.prompt.trim()&&answerFor(q).trim()).length,0),[cats,gameType]);

 useEffect(()=>{void loadSet()},[]);
 async function loadSet(){
  const setId=new URLSearchParams(window.location.search).get('set');if(!setId)return;
  const {data:set,error:setErr}=await supabase.from('question_sets').select('id,title,source_set_id,game_type').eq('id',setId).single();
  if(setErr||!set){setError(setErr?.message||'Question set not found.');return}
  const {data:rows,error:qErr}=await supabase.from('question_set_questions').select('category_name,category_order,prompt,answer,value,question_order,choices,media_url,media_type').eq('set_id',setId).order('category_order').order('question_order');
  if(qErr){setError(qErr.message);return}
  const gt=(set.game_type||'jeopardy') as GameType;setGameType(gt);
  const grouped=new Map<number,Cat>();
  (rows||[]).forEach((r:any)=>{
   if(!grouped.has(r.category_order))grouped.set(r.category_order,{name:r.category_name,clues:[]});
   const choices=Array.isArray(r.choices)?r.choices:['','','',''];
   grouped.get(r.category_order)!.clues.push({prompt:r.prompt,answer:r.answer,value:r.value,choices:[...choices,'','','',''].slice(0,4),correctIndex:Math.max(0,choices.findIndex((x:string)=>x===r.answer)),media_url:r.media_url,media_type:r.media_type});
  });
  const loaded=Array.from(grouped.entries()).sort((a,b)=>a[0]-b[0]).map(([,cat])=>({...cat,clues:shuffle(cat.clues).slice(0,5).map((q,i)=>({...q,value:values[i]}))}));
  if(loaded.length){setCats(loaded);setName(set.title);setSourceSetId(set.source_set_id||set.id)}
 }
 function patchClue(ci:number,qi:number,patch:Partial<Clue>){setCats(v=>v.map((c,x)=>x!==ci?c:{...c,clues:c.clues.map((q,y)=>y===qi?{...q,...patch}:q)}))}
 function patchChoice(ci:number,qi:number,index:number,value:string){setCats(v=>v.map((c,x)=>x!==ci?c:{...c,clues:c.clues.map((q,y)=>y!==qi?q:{...q,choices:q.choices.map((z,j)=>j===index?value:z)})}))}
 async function media(ci:number,qi:number,file?:File){if(!file)return;setUploading(ci+'-'+qi);setError('');try{const user=await ensureUser();patchClue(ci,qi,await uploadQuestionMedia(file,user.id))}catch(e:any){setError(e?.message||'Upload failed')}finally{setUploading('')}}

 async function createGame(){
  setError('');setSaving(true);
  try{
   const user=await ensureUser();const code=roomCode();
   const {data:game,error:gErr}=await supabase.from('games').insert({host_id:user.id,name:name.trim()||'Trivia Night',code,status:'lobby',source_question_set_id:sourceSetId,game_type:gameType}).select().single();
   if(gErr||!game)throw gErr||new Error('Could not create game');
   for(let ci=0;ci<cats.length;ci++){
    const cat=cats[ci];if(!cat.name.trim())continue;
    const {data:catalog,error:catErr}=await supabase.from('categories').insert({name:cat.name.trim(),slug:slugify(cat.name),created_by:user.id}).select().single();if(catErr)throw catErr;
    const {data:gc,error:gcErr}=await supabase.from('game_categories').insert({game_id:game.id,category_id:catalog?.id??null,name:cat.name.trim(),sort_order:ci}).select().single();if(gcErr||!gc)throw gcErr||new Error('Could not create category');
    const authored=cat.clues.map((q,sort_order)=>({...q,sort_order,finalAnswer:answerFor(q).trim()})).filter(q=>q.prompt.trim()&&q.finalAnswer);
    if(authored.length){
     const qrows=authored.map(q=>({game_id:game.id,game_category_id:gc.id,prompt:q.prompt.trim(),value:q.value,sort_order:q.sort_order,choices:gameType==='multiple_choice'?q.choices.map(x=>x.trim()).filter(Boolean):[],media_url:q.media_url,media_type:q.media_type}));
     const {data:created,error:qErr}=await supabase.from('game_questions').insert(qrows).select('id,sort_order');if(qErr||!created)throw qErr||new Error('Could not create questions');
     const answers=created.map(q=>({question_id:q.id,game_id:game.id,answer:authored.find(a=>a.sort_order===q.sort_order)!.finalAnswer}));
     const {error:aErr}=await supabase.from('game_question_answers').insert(answers);if(aErr)throw aErr;
    }
   }
   router.push('/host/'+code);
  }catch(e:any){setError(e?.message||'Could not create game.');setSaving(false)}
 }

 return <main className="shell"><div className="eyebrow">Host studio</div><div className="pageTitle"><div><h1>Build your game.</h1><p className="muted">Pick a format, create the questions, then invite players on their phones.</p></div><div className="statChip">{clueCount} ready</div></div>
  <section className="panel formStack"><div><label className="label">Game name</label><input className="input" value={name} onChange={e=>setName(e.target.value)}/></div>
   <div><label className="label">Game type</label><div className="gameTypeGrid">
    {([['jeopardy','Jeopardy / Buzzer'],['multiple_choice','Multiple Choice'],['closest_number','Closest Number']] as [GameType,string][]).map(([v,label])=><button key={v} disabled={!!sourceSetId} className={gameType===v?'gameTypeCard active':'gameTypeCard'} onClick={()=>setGameType(v)}><strong>{label}</strong></button>)}
   </div>{sourceSetId&&<small className="muted">This format comes from the selected question set.</small>}</div>
  </section>
  <div className="builderGrid">{cats.map((cat,ci)=><section className="categoryEditor" key={ci}><div className="categoryEditorHead"><input className="categoryName" value={cat.name} onChange={e=>setCats(v=>v.map((c,x)=>x===ci?{...c,name:e.target.value}:c))}/><button className="iconBtn danger" onClick={()=>setCats(v=>v.filter((_,x)=>x!==ci))}>×</button></div>
   {cat.clues.map((q,qi)=><div className="questionEditor compactEditor" key={qi}><div className="questionEditorTop"><span className="valueBadge compact">{q.value}</span><input className="input" placeholder="Question / clue" value={q.prompt} onChange={e=>patchClue(ci,qi,{prompt:e.target.value})}/></div>
    {gameType==='jeopardy'&&<input className="input" placeholder="Correct answer" value={q.answer} onChange={e=>patchClue(ci,qi,{answer:e.target.value})}/>}
    {gameType==='closest_number'&&<input className="input" type="number" step="any" placeholder="Target number" value={q.answer} onChange={e=>patchClue(ci,qi,{answer:e.target.value})}/>}
    {gameType==='multiple_choice'&&<div className="choiceEditor">{q.choices.map((choice,i)=><label className="choiceEdit" key={i}><input type="radio" name={'h-'+ci+'-'+qi} checked={q.correctIndex===i} onChange={()=>patchClue(ci,qi,{correctIndex:i})}/><input className="input" placeholder={'Choice '+String.fromCharCode(65+i)} value={choice} onChange={e=>patchChoice(ci,qi,i,e.target.value)}/></label>)}</div>}
    <div className="mediaEditor"><label className="btn secondary mediaUploadBtn">{uploading===ci+'-'+qi?'Uploading…':q.media_url?'Replace media':'Add image/sound'}<input hidden type="file" accept="image/*,audio/*" onChange={e=>void media(ci,qi,e.target.files?.[0])}/></label>{q.media_url&&<div className="mediaPreview mini">{q.media_type==='image'?<img src={q.media_url} alt="Question media"/>:<audio controls src={q.media_url}/>}</div>}</div>
   </div>)}
  </section>)}</div>
  <div className="actions"><button className="btn secondary" onClick={()=>setCats(v=>[...v,{name:'Category '+(v.length+1),clues:blankClues()}])}>+ Add category</button><button className="btn" disabled={saving||clueCount===0} onClick={createGame}>{saving?'Creating room…':'Create live room'}</button></div>
  {error&&<div className="errorBox">{error}</div>}
 </main>
}
