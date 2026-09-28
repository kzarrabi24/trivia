'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

type Clue={prompt:string;answer:string;value:number};
type Cat={name:string;clues:Clue[]};
const values=[200,400,600,800,1000];
const blankClues=()=>values.map(value=>({prompt:'',answer:'',value}));
const starter:Cat[]=[{name:'Category 1',clues:blankClues()}];

export default function NewQuestionSet(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const [ready,setReady]=useState(false);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [published,setPublished]=useState(true);
  const [cats,setCats]=useState<Cat[]>(starter);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const clueCount=useMemo(()=>cats.reduce((n,c)=>n+c.clues.filter(q=>q.prompt.trim()&&q.answer.trim()).length,0),[cats]);

  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();setUser(user||null);setReady(true)})()},[]);
  const updateCat=(i:number,patch:Partial<Cat>)=>setCats(cats.map((c,x)=>x===i?{...c,...patch}:c));
  const updateClue=(ci:number,qi:number,key:'prompt'|'answer',value:string)=>setCats(cats.map((c,x)=>x!==ci?c:{...c,clues:c.clues.map((q,y)=>y===qi?{...q,[key]:value}:q)}));

  async function save(){
    if(!user || user.is_anonymous){setError('A permanent account is required to publish or save question sets.');return;}
    setSaving(true);setError('');
    try{
      const {data:set,error:setErr}=await supabase.from('question_sets').insert({
        owner_id:user.id,title:title.trim(),description:description.trim(),is_published:published
      }).select('id').single();
      if(setErr||!set) throw setErr||new Error('Could not create question set.');
      const rows:any[]=[];
      cats.forEach((cat,category_order)=>cat.clues.forEach((q,question_order)=>{
        if(cat.name.trim()&&q.prompt.trim()&&q.answer.trim()) rows.push({
          set_id:set.id,category_name:cat.name.trim(),category_order,
          prompt:q.prompt.trim(),answer:q.answer.trim(),value:q.value,question_order
        });
      }));
      const {error:qErr}=await supabase.from('question_set_questions').insert(rows);
      if(qErr) throw qErr;
      router.push(`/library/${set.id}`);
    }catch(e:any){setError(e?.message||'Could not save question set.');setSaving(false);}
  }

  if(!ready) return <main className="shell"><div className="panel">Loading…</div></main>;
  if(!user || user.is_anonymous) return <main className="shell narrow"><div className="eyebrow">Creator access</div><h1>Create question sets</h1><div className="panel"><p className="muted">Publishing and personal question libraries require a permanent BuzzBoard account.</p><Link className="btn" href="/account">Create or sign into an account</Link></div></main>;

  return <main className="shell">
    <div className="pageTitle"><div><div className="eyebrow">Question set creator</div><h1>Build a reusable set.</h1><p className="muted">Create a Lakers pack, movie night board, office trivia collection, or anything else you want to reuse.</p></div><div className="statChip">{clueCount} questions</div></div>
    <section className="panel formStack">
      <div><label className="label">Set title</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Los Angeles Lakers" /></div>
      <div><label className="label">Description</label><textarea className="input textarea" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Questions covering Lakers history, stars, championships and memorable moments." /></div>
      <label className="checkRow"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)} /><span><strong>Publish to the community</strong><small>Anyone can browse and use it. Only signed-in permanent accounts can publish.</small></span></label>
    </section>
    <div className="builderGrid">{cats.map((cat,ci)=><section className="categoryEditor" key={ci}>
      <div className="categoryEditorHead"><input className="categoryName" value={cat.name} onChange={e=>updateCat(ci,{name:e.target.value})}/><button className="iconBtn danger" onClick={()=>setCats(cats.filter((_,x)=>x!==ci))} title="Remove category">×</button></div>
      {cat.clues.map((q,qi)=><div className="clueEditor" key={q.value}><div className="valueBadge">{q.value}</div><input placeholder="Clue / question" value={q.prompt} onChange={e=>updateClue(ci,qi,'prompt',e.target.value)}/><input placeholder="Correct answer" value={q.answer} onChange={e=>updateClue(ci,qi,'answer',e.target.value)}/></div>)}
    </section>)}</div>
    <div className="actions"><button className="btn secondary" onClick={()=>setCats([...cats,{name:`Category ${cats.length+1}`,clues:blankClues()}])}>+ Add category</button><button className="btn" disabled={saving||!title.trim()||clueCount===0} onClick={save}>{saving?'Saving…':published?'Publish question set':'Save private set'}</button></div>
    {error&&<div className="errorBox">{error}</div>}
  </main>
}
