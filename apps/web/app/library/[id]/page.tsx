'use client';

import { useEffect,useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

type SetRow={id:string;owner_id:string;title:string;description:string;is_published:boolean;source_set_id:string|null};
type Question={id:string;category_name:string;category_order:number;prompt:string;answer:string;value:number;question_order:number};

export default function QuestionSetDetail(){
  const params=useParams<{id:string}>();
  const [set,setSet]=useState<SetRow|null>(null);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [user,setUser]=useState<any>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  useEffect(()=>{void load()},[params.id]);
  async function load(){
    const {data:{user}}=await supabase.auth.getUser();setUser(user||null);
    const {data:s,error:sErr}=await supabase.from('question_sets').select('*').eq('id',params.id).single();
    if(sErr){setError(sErr.message);return;} setSet(s as SetRow);
    const {data:q,error:qErr}=await supabase.from('question_set_questions').select('*').eq('set_id',params.id).order('category_order').order('question_order');
    if(qErr){setError(qErr.message);return;} setQuestions((q||[]) as Question[]);
  }
  async function saveCopy(){
    setError('');setMessage('');
    if(!user||user.is_anonymous){setError('Create or sign into an account to save this set.');return;}
    const {error}=await supabase.rpc('clone_question_set',{p_set_id:params.id});
    if(error){setError(error.message);return;}setMessage('Saved a private copy to your library.');
  }
  const grouped=questions.reduce<Record<string,Question[]>>((acc,q)=>{(acc[q.category_name]??=[]).push(q);return acc},{});
  if(error&&!set) return <main className="shell narrow"><div className="errorBox">{error}</div><Link className="btn secondary" href="/library">Back to library</Link></main>;
  if(!set) return <main className="shell"><div className="panel">Loading set…</div></main>;
  return <main className="shell">
    <div className="pageTitle"><div><div className="eyebrow">{set.is_published?'Published question set':'Private question set'}</div><h1>{set.title}</h1><p className="muted">{set.description||'No description.'}</p></div><div className="statChip">{questions.length} questions</div></div>
    <div className="actions">
      <Link className="btn" href={`/host?set=${set.id}`}>Use this set in a game</Link>
      {set.is_published&&user?.id!==set.owner_id&&<button className="btn secondary" onClick={saveCopy}>Save a private copy</button>}
      <Link className="btn secondary" href="/library">Back to library</Link>
    </div>
    {message&&<div className="successBox">{message}</div>}{error&&<div className="errorBox">{error}</div>}
    <div className="previewGrid">{Object.entries(grouped).map(([name,qs])=><section className="panel previewCategory" key={name}><h2>{name}</h2>{qs.map(q=><div className="previewQuestion" key={q.id}><span className="valueBadge mini">{q.value}</span><div><strong>{q.prompt}</strong><details><summary>Show answer</summary><p>{q.answer}</p></details></div></div>)}</section>)}</div>
  </main>
}
