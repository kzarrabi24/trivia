'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

type CsvQuestion={category:string;prompt:string;answer:string;value:number;valid:boolean;error?:string};

function parseCsv(text:string):string[][]{
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){cell+='"';i++} else quoted=!quoted;
    }else if(ch===',' && !quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r') && !quoted){
      if(ch==='\r'&&text[i+1]==='\n') i++;
      row.push(cell);cell='';
      if(row.some(v=>v.trim()!=='')) rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);
  if(row.some(v=>v.trim()!=='')) rows.push(row);
  return rows;
}

export default function ImportQuestionSet(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const [ready,setReady]=useState(false);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [published,setPublished]=useState(true);
  const [rows,setRows]=useState<CsvQuestion[]>([]);
  const [fileName,setFileName]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);

  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();setUser(user||null);setReady(true)})()},[]);

  const validRows=useMemo(()=>rows.filter(r=>r.valid),[rows]);
  const invalidRows=useMemo(()=>rows.filter(r=>!r.valid),[rows]);
  const categories=useMemo(()=>new Set(validRows.map(r=>r.category)).size,[validRows]);

  async function loadFile(e:ChangeEvent<HTMLInputElement>){
    setError('');
    const file=e.target.files?.[0];
    if(!file) return;
    setFileName(file.name);
    const parsed=parseCsv(await file.text());
    if(!parsed.length){setRows([]);setError('The CSV is empty.');return;}
    const headers=parsed[0].map(h=>h.trim().toLowerCase());
    const find=(...names:string[])=>headers.findIndex(h=>names.includes(h));
    const catIdx=find('category','category_name');
    const promptIdx=find('prompt','question','clue');
    const answerIdx=find('answer','correct_answer');
    const valueIdx=find('value','points','point_value');
    if(catIdx<0||promptIdx<0||answerIdx<0){setRows([]);setError('Required headers are category, prompt, and answer. Value is optional.');return;}

    const body=parsed.slice(1).map(cols=>{
      const category=(cols[catIdx]||'').trim();
      const prompt=(cols[promptIdx]||'').trim();
      const answer=(cols[answerIdx]||'').trim();
      const rawValue=valueIdx>=0?(cols[valueIdx]||'').trim():'';
      const value=rawValue?Number(rawValue):200;
      const problems:string[]=[];
      if(!category) problems.push('Missing category');
      if(!prompt) problems.push('Missing prompt');
      if(!answer) problems.push('Missing answer');
      if(!Number.isFinite(value)||value<=0) problems.push('Value must be a positive number');
      if(prompt.length>1000) problems.push('Prompt is over 1000 characters');
      if(answer.length>500) problems.push('Answer is over 500 characters');
      if(category.length>80) problems.push('Category is over 80 characters');
      return {category,prompt,answer,value,valid:problems.length===0,error:problems.join('; ')||undefined};
    });
    if(body.length>200) setError('This file has '+body.length+' question rows. A question set can contain at most 200.');
    setRows(body);
  }

  async function save(){
    if(!user||user.is_anonymous){setError('A permanent account is required to import question sets.');return;}
    if(!title.trim()){setError('Enter a title for the question set.');return;}
    if(rows.length===0){setError('Choose a CSV file first.');return;}
    if(rows.length>200){setError('Question sets may contain at most 200 questions.');return;}
    if(invalidRows.length){setError('Fix the invalid CSV rows before saving.');return;}
    setSaving(true);setError('');
    try{
      const {data:set,error:setErr}=await supabase.from('question_sets').insert({owner_id:user.id,title:title.trim(),description:description.trim(),is_published:published}).select('id').single();
      if(setErr||!set) throw setErr||new Error('Could not create question set.');

      const categoryOrder=new Map<string,number>();
      const questionOrder=new Map<string,number>();
      const data=validRows.map(q=>{
        if(!categoryOrder.has(q.category)) categoryOrder.set(q.category,categoryOrder.size);
        const current=questionOrder.get(q.category)||0;
        questionOrder.set(q.category,current+1);
        return {set_id:set.id,category_name:q.category,category_order:categoryOrder.get(q.category)!,prompt:q.prompt,answer:q.answer,value:q.value,question_order:current};
      });
      const {error:qErr}=await supabase.from('question_set_questions').insert(data);
      if(qErr) throw qErr;
      router.push('/library/'+set.id);
    }catch(e:any){setError(e?.message||'Could not import the question set.');setSaving(false);}
  }

  if(!ready) return <main className="shell"><div className="panel">Loading…</div></main>;
  if(!user||user.is_anonymous) return <main className="shell narrow"><div className="eyebrow">CSV importer</div><h1>Import questions</h1><div className="panel"><p className="muted">CSV imports require a permanent BuzzBoard account.</p><Link className="btn" href="/account">Sign in or create account</Link></div></main>;

  const example='category,prompt,answer,value\nLakers,"Who scored 81 points in a 2006 game?",Kobe Bryant,200\nLakers,"How many NBA titles did the Lakers win in the 1980s?",5,400\nNBA,"Which team drafted Kobe Bryant?",Charlotte Hornets,200';

  return <main className="shell">
    <div className="pageTitle"><div><div className="eyebrow">CSV question importer</div><h1>Import up to 200 questions.</h1><p className="muted">Upload a question bank, review every row, then publish it only after the preview looks right.</p></div><div className="metricPills"><div className="statChip">{validRows.length} valid</div><div className="statChip">{categories} categories</div></div></div>

    <section className="panel csvHelp">
      <div className="sectionTitle"><h2>CSV format</h2><span className="muted">UTF-8 .csv recommended</span></div>
      <p className="muted">The first row must contain headers. <strong>category</strong>, <strong>prompt</strong>, and <strong>answer</strong> are required. <strong>value</strong> is optional and defaults to 200. If text contains commas, wrap that cell in double quotes.</p>
      <code>{example}</code>
      <p className="muted">A category can contain far more than five questions. When the set is used in a game, BuzzBoard randomly selects up to five questions from each category and assigns 200/400/600/800/1000 values for that board.</p>
    </section>

    <section className="panel formStack">
      <div><label className="label">Question set title</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Los Angeles Lakers Question Bank" /></div>
      <div><label className="label">Description</label><textarea className="input textarea" value={description} onChange={e=>setDescription(e.target.value)} placeholder="A large Lakers trivia bank for randomized games." /></div>
      <label className="checkRow"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)} /><span><strong>Publish after import</strong><small>The set is not published until you review the preview and click the final import button.</small></span></label>
    </section>

    <label className="csvDrop"><strong>Select CSV file</strong><span className="muted">{fileName||'No file selected yet'}</span><input type="file" accept=".csv,text/csv" onChange={loadFile}/></label>
    {error&&<div className="errorBox">{error}</div>}

    {rows.length>0&&<section className="librarySection">
      <div className="sectionTitle"><h2>Import preview</h2><span className={invalidRows.length?'csvBadText':'csvGood'}>{invalidRows.length?invalidRows.length+' rows need attention':'Ready to import'}</span></div>
      <div className="csvPreviewWrap"><table className="csvPreview"><thead><tr><th>#</th><th>Category</th><th>Prompt</th><th>Answer</th><th>Value</th><th>Status</th></tr></thead><tbody>
        {rows.map((r,i)=><tr className={r.valid?'':'csvBad'} key={i}><td>{i+1}</td><td>{r.category}</td><td>{r.prompt}</td><td>{r.answer}</td><td>{r.value}</td><td className={r.valid?'csvGood':'csvBadText'}>{r.valid?'Valid':r.error}</td></tr>)}
      </tbody></table></div>
      <div className="actions"><Link className="btn secondary" href="/library/new">Use manual creator</Link><button className="btn" disabled={saving||!title.trim()||rows.length===0||rows.length>200||invalidRows.length>0} onClick={save}>{saving?'Importing…':published?'Import & publish':'Import as private set'}</button></div>
    </section>}
  </main>
}
