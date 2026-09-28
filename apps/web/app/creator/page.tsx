'use client';

import { useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type SetRow={id:string;title:string;description:string;is_published:boolean;created_at:string};
type Metric={set_id:string;save_count:number;game_use_count:number};

export default function CreatorPage(){
  const [user,setUser]=useState<any>(null);
  const [name,setName]=useState('Creator');
  const [sets,setSets]=useState<SetRow[]>([]);
  const [metrics,setMetrics]=useState<Record<string,Metric>>({});
  const [questionCounts,setQuestionCounts]=useState<Record<string,number>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{void load()},[]);

  async function load(){
    const {data:{user}}=await supabase.auth.getUser();
    setUser(user||null);
    if(!user||user.is_anonymous){setLoading(false);return;}
    const {data:p}=await supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle();
    setName(p?.display_name||user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split('@')[0]||'Creator');
    const {data:s,error:sErr}=await supabase.from('question_sets')
      .select('id,title,description,is_published,created_at')
      .eq('owner_id',user.id).is('source_set_id',null).order('created_at',{ascending:false});
    if(sErr){setError(sErr.message);setLoading(false);return;}
    const owned=(s||[]) as SetRow[];setSets(owned);
    const ids=owned.map(x=>x.id);
    if(ids.length){
      const [{data:m},{data:q}]=await Promise.all([
        supabase.from('question_set_metrics').select('set_id,save_count,game_use_count').in('set_id',ids),
        supabase.from('question_set_questions').select('set_id').in('set_id',ids)
      ]);
      const mm:Record<string,Metric>={};(m||[]).forEach((row:any)=>mm[row.set_id]=row);setMetrics(mm);
      const qc:Record<string,number>={};(q||[]).forEach((row:any)=>qc[row.set_id]=(qc[row.set_id]||0)+1);setQuestionCounts(qc);
    }
    setLoading(false);
  }

  const published=sets.filter(s=>s.is_published);
  const totals=useMemo(()=>published.reduce((a,s)=>({
    saves:a.saves+(metrics[s.id]?.save_count||0),
    games:a.games+(metrics[s.id]?.game_use_count||0),
    questions:a.questions+(questionCounts[s.id]||0)
  }),{saves:0,games:0,questions:0}),[published,metrics,questionCounts]);
  const topSet=useMemo(()=>published.slice().sort((a,b)=>((metrics[b.id]?.save_count||0)+(metrics[b.id]?.game_use_count||0))-((metrics[a.id]?.save_count||0)+(metrics[a.id]?.game_use_count||0)))[0],[published,metrics]);

  if(loading) return <main className="shell"><div className="panel">Loading creator analytics…</div></main>;
  if(!user||user.is_anonymous) return <main className="shell narrow"><div className="eyebrow">Creator profile</div><h1>Creator analytics</h1><div className="panel"><p className="muted">Create or sign into a permanent BuzzBoard account to publish question sets and track their performance.</p><Link className="btn" href="/account">Sign in or create account</Link></div></main>;

  return <main className="shell">
    <div className="pageTitle"><div><div className="eyebrow">Creator profile</div><h1>{name}</h1><p className="muted">Performance across the question sets you create and publish.</p></div><Link className="btn" href="/library/new">Create a new set</Link></div>
    {error&&<div className="errorBox">{error}</div>}
    <div className="metricGrid creatorMetrics">
      <div className="metric"><span>Published sets</span><strong>{published.length}</strong></div>
      <div className="metric"><span>Questions published</span><strong>{totals.questions}</strong></div>
      <div className="metric"><span>Library saves</span><strong>{totals.saves}</strong></div>
      <div className="metric"><span>Games using your sets</span><strong>{totals.games}</strong></div>
    </div>
    {topSet&&<section className="panel creatorHighlight"><div><span className="eyebrow">Most engaged set</span><h2>{topSet.title}</h2></div><div className="metricPills"><span className="statChip">♡ {metrics[topSet.id]?.save_count||0} saves</span><span className="statChip">▶ {metrics[topSet.id]?.game_use_count||0} games</span></div></section>}
    <section className="librarySection">
      <div className="sectionTitle"><h2>Your question sets</h2><span className="muted">{sets.length} created</span></div>
      {sets.length?<div className="creatorTable">
        <div className="creatorTableHead"><span>Question set</span><span>Status</span><span>Questions</span><span>Saves</span><span>Game uses</span></div>
        {sets.map(s=><Link className="creatorTableRow" href={`/library/${s.id}`} key={s.id}>
          <span><strong>{s.title}</strong><small>{s.description||'No description'}</small></span>
          <span>{s.is_published?'Published':'Private'}</span>
          <span>{questionCounts[s.id]||0}</span>
          <span>{metrics[s.id]?.save_count||0}</span>
          <span>{metrics[s.id]?.game_use_count||0}</span>
        </Link>)}
      </div>:<div className="emptyState panel">You have not created any question sets yet.</div>}
    </section>
  </main>
}
