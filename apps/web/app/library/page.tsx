'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type SetRow = {
  id:string; owner_id:string; title:string; description:string; is_published:boolean;
  source_set_id:string|null; created_at:string;
};

export default function LibraryPage() {
  const [publicSets,setPublicSets]=useState<SetRow[]>([]);
  const [mySets,setMySets]=useState<SetRow[]>([]);
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [user,setUser]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{ void load(); },[]);

  async function load() {
    setLoading(true);
    const { data:{user} } = await supabase.auth.getUser();
    setUser(user ?? null);

    const {data:pub,error:pubErr}=await supabase.from('question_sets')
      .select('id,owner_id,title,description,is_published,source_set_id,created_at')
      .eq('is_published',true).order('created_at',{ascending:false});
    if(pubErr){setError(pubErr.message);setLoading(false);return;}
    setPublicSets((pub||[]) as SetRow[]);

    let mine:SetRow[]=[];
    if(user && !user.is_anonymous){
      const {data}=await supabase.from('question_sets')
        .select('id,owner_id,title,description,is_published,source_set_id,created_at')
        .eq('owner_id',user.id).order('created_at',{ascending:false});
      mine=(data||[]) as SetRow[];
      setMySets(mine);
    }

    const ids=Array.from(new Set([...(pub||[]).map((s:any)=>s.id),...mine.map(s=>s.id)]));
    if(ids.length){
      const {data:q}=await supabase.from('question_set_questions').select('set_id').in('set_id',ids);
      const c:Record<string,number>={};
      (q||[]).forEach((row:any)=>c[row.set_id]=(c[row.set_id]||0)+1);
      setCounts(c);
    }
    setLoading(false);
  }

  async function saveCopy(id:string) {
    setMessage('');setError('');
    if(!user || user.is_anonymous){setError('Create or sign into an account to save question sets.');return;}
    const {data,error}=await supabase.rpc('clone_question_set',{p_set_id:id});
    if(error){setError(error.message);return;}
    setMessage('Saved a private copy to your library.');
    await load();
    if(data) setTimeout(()=>document.getElementById('my-library')?.scrollIntoView({behavior:'smooth'}),100);
  }

  return <main className="shell">
    <div className="pageTitle"><div><div className="eyebrow">Community library</div><h1>Question sets</h1><p className="muted">Browse published trivia packs, save a private copy to your account, or launch one directly into the host builder.</p></div>
      <Link className="btn" href="/library/new">Create a set</Link></div>
    {message&&<div className="successBox">{message}</div>}{error&&<div className="errorBox">{error}</div>}

    {user && !user.is_anonymous && <section id="my-library" className="librarySection">
      <div className="sectionTitle"><h2>My library</h2><span className="muted">{mySets.length} sets</span></div>
      {mySets.length?<div className="setGrid">{mySets.map(s=><article className="setCard" key={s.id}>
        <div className="setMeta"><span>{s.is_published?'Published':'Private'}</span><span>{counts[s.id]||0} questions</span></div>
        <h3>{s.title}</h3><p>{s.description||'No description yet.'}</p>
        <div className="actions"><Link className="btn" href={`/host?set=${s.id}`}>Use in game</Link><Link className="btn secondary" href={`/library/${s.id}`}>View</Link></div>
      </article>)}</div>:<div className="emptyState panel">You have not saved or created any question sets yet.</div>}
    </section>}

    <section className="librarySection">
      <div className="sectionTitle"><h2>Published by the community</h2><span className="muted">{publicSets.length} sets</span></div>
      {loading?<div className="panel">Loading question sets…</div>:publicSets.length?<div className="setGrid">{publicSets.map(s=><article className="setCard" key={s.id}>
        <div className="setMeta"><span>Community</span><span>{counts[s.id]||0} questions</span></div>
        <h3>{s.title}</h3><p>{s.description||'No description yet.'}</p>
        <div className="actions">
          <Link className="btn" href={`/host?set=${s.id}`}>Use now</Link>
          <Link className="btn secondary" href={`/library/${s.id}`}>Preview</Link>
          {user?.id!==s.owner_id && <button className="btn secondary" onClick={()=>saveCopy(s.id)}>Save copy</button>}
        </div>
      </article>)}</div>:<div className="emptyState panel">No published question sets yet. Be the first to create one.</div>}
    </section>
  </main>
}
