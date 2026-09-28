'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import type { GameType, MediaType } from '@buzzboard/shared';

type CsvQuestion={
  category:string;
  prompt:string;
  answer:string;
  value:number;
  choices:string[];
  media_url:string|null;
  media_type:MediaType|null;
  valid:boolean;
  error?:string;
};

function parseCsv(text:string):string[][]{
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){cell+='"';i++} else quoted=!quoted;
    }else if(ch===',' && !quoted){
      row.push(cell);cell='';
    }else if((ch==='\n'||ch==='\r') && !quoted){
      if(ch==='\r'&&text[i+1]==='\n') i++;
      row.push(cell);cell='';
      if(row.some(v=>v.trim()!=='')) rows.push(row);
      row=[];
    }else{
      cell+=ch;
    }
  }
  row.push(cell);
  if(row.some(v=>v.trim()!=='')) rows.push(row);
  return rows;
}

const modeInfo:Record<GameType,{
  label:string;
  description:string;
  required:string;
  optional:string;
  example:string;
}> = {
  jeopardy:{
    label:'Jeopardy / Buzzer',
    description:'Players buzz in, then answer aloud. The CSV stores the correct free-response answer for the host.',
    required:'category, prompt, answer',
    optional:'value, media_url, media_type',
    example:'category,prompt,answer,value,media_url,media_type\nLakers,"Who scored 81 points in a 2006 game?",Kobe Bryant,200,,\nNBA,"Which team drafted Kobe Bryant?",Charlotte Hornets,400,https://example.com/kobe.jpg,image'
  },
  multiple_choice:{
    label:'Multiple Choice',
    description:'Players see answer choices on their device. Supply four choices and identify the correct one with A, B, C, or D.',
    required:'category, prompt, choice_a, choice_b, choice_c, choice_d, correct_choice',
    optional:'value, media_url, media_type',
    example:'category,prompt,choice_a,choice_b,choice_c,choice_d,correct_choice,value,media_url,media_type\nLakers,"Who scored 81 points in a 2006 game?",Kobe Bryant,Shaquille O\'Neal,LeBron James,Magic Johnson,A,200,,\nNBA,"Which team drafted Kobe Bryant?",Lakers,Hornets,Bulls,76ers,B,400,https://example.com/kobe.jpg,image'
  },
  closest_number:{
    label:'Closest Number',
    description:'Players type a number on their device. The player closest to the target number wins the points.',
    required:'category, prompt, target_number',
    optional:'value, media_url, media_type',
    example:'category,prompt,target_number,value,media_url,media_type\nLakers,"How many points did Kobe score in his highest-scoring NBA game?",81,200,,\nLakers,"How many career regular-season points did Kobe Bryant score?",33643,400,https://example.com/kobe.mp3,audio'
  }
};

export default function ImportQuestionSet(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const [ready,setReady]=useState(false);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [published,setPublished]=useState(true);
  const [gameType,setGameType]=useState<GameType>('jeopardy');
  const [rows,setRows]=useState<CsvQuestion[]>([]);
  const [fileName,setFileName]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);

  useEffect(()=>{(async()=>{const {data:{user}}=await supabase.auth.getUser();setUser(user||null);setReady(true)})()},[]);

  const validRows=useMemo(()=>rows.filter(r=>r.valid),[rows]);
  const invalidRows=useMemo(()=>rows.filter(r=>!r.valid),[rows]);
  const categories=useMemo(()=>new Set(validRows.map(r=>r.category)).size,[validRows]);

  function changeGameType(next:GameType){
    setGameType(next);
    setRows([]);
    setFileName('');
    setError('');
  }

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
    const valueIdx=find('value','points','point_value');
    const mediaUrlIdx=find('media_url','media','image_url','audio_url');
    const mediaTypeIdx=find('media_type');

    const answerIdx=find('answer','correct_answer');
    const targetIdx=find('target_number','target','number_answer');
    const aIdx=find('choice_a','option_a','answer_a');
    const bIdx=find('choice_b','option_b','answer_b');
    const cIdx=find('choice_c','option_c','answer_c');
    const dIdx=find('choice_d','option_d','answer_d');
    const correctIdx=find('correct_choice','correct_option','correct');

    const missing:string[]=[];
    if(catIdx<0) missing.push('category');
    if(promptIdx<0) missing.push('prompt');
    if(gameType==='jeopardy' && answerIdx<0) missing.push('answer');
    if(gameType==='closest_number' && targetIdx<0) missing.push('target_number');
    if(gameType==='multiple_choice'){
      if(aIdx<0) missing.push('choice_a');
      if(bIdx<0) missing.push('choice_b');
      if(cIdx<0) missing.push('choice_c');
      if(dIdx<0) missing.push('choice_d');
      if(correctIdx<0) missing.push('correct_choice');
    }
    if(missing.length){
      setRows([]);
      setError('Missing required CSV headers for '+modeInfo[gameType].label+': '+missing.join(', '));
      return;
    }

    const body:CsvQuestion[]=parsed.slice(1).map(cols=>{
      const category=(cols[catIdx]||'').trim();
      const prompt=(cols[promptIdx]||'').trim();
      const rawValue=valueIdx>=0?(cols[valueIdx]||'').trim():'';
      const value=rawValue?Number(rawValue):200;
      const media_url=mediaUrlIdx>=0?(cols[mediaUrlIdx]||'').trim()||null:null;
      const rawMediaType=mediaTypeIdx>=0?(cols[mediaTypeIdx]||'').trim().toLowerCase():'';
      const media_type:MediaType|null=rawMediaType==='image'||rawMediaType==='audio'?rawMediaType:null;

      let answer='';
      let choices:string[]=[];
      const problems:string[]=[];

      if(!category) problems.push('Missing category');
      if(!prompt) problems.push('Missing prompt');
      if(!Number.isFinite(value)||value<=0) problems.push('Value must be a positive number');
      if(prompt.length>1000) problems.push('Prompt is over 1000 characters');
      if(category.length>80) problems.push('Category is over 80 characters');

      if(media_url && !media_type) problems.push('media_type must be image or audio when media_url is supplied');
      if(media_type && !media_url) problems.push('media_url is required when media_type is supplied');

      if(gameType==='jeopardy'){
        answer=(cols[answerIdx]||'').trim();
        if(!answer) problems.push('Missing answer');
      }

      if(gameType==='closest_number'){
        answer=(cols[targetIdx]||'').trim();
        if(!answer) problems.push('Missing target number');
        else if(!Number.isFinite(Number(answer))) problems.push('Target number must be numeric');
      }

      if(gameType==='multiple_choice'){
        choices=[aIdx,bIdx,cIdx,dIdx].map(i=>(cols[i]||'').trim());
        choices.forEach((choice,i)=>{if(!choice)problems.push('Missing choice '+String.fromCharCode(65+i))});
        const correct=(cols[correctIdx]||'').trim().toUpperCase();
        const choiceMap:Record<string,number>={A:0,B:1,C:2,D:3};
        if(!(correct in choiceMap)) problems.push('correct_choice must be A, B, C, or D');
        else answer=choices[choiceMap[correct]]||'';
      }

      if(answer.length>500) problems.push('Answer is over 500 characters');

      return {category,prompt,answer,value,choices,media_url,media_type,valid:problems.length===0,error:problems.join('; ')||undefined};
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
      const {data:set,error:setErr}=await supabase.from('question_sets').insert({
        owner_id:user.id,
        title:title.trim(),
        description:description.trim(),
        is_published:published,
        game_type:gameType
      }).select('id').single();
      if(setErr||!set) throw setErr||new Error('Could not create question set.');

      const categoryOrder=new Map<string,number>();
      const questionOrder=new Map<string,number>();
      const data=validRows.map(q=>{
        if(!categoryOrder.has(q.category)) categoryOrder.set(q.category,categoryOrder.size);
        const current=questionOrder.get(q.category)||0;
        questionOrder.set(q.category,current+1);
        return {
          set_id:set.id,
          category_name:q.category,
          category_order:categoryOrder.get(q.category)!,
          prompt:q.prompt,
          answer:q.answer,
          value:q.value,
          question_order:current,
          choices:gameType==='multiple_choice'?q.choices:[],
          media_url:q.media_url,
          media_type:q.media_type
        };
      });

      const {error:qErr}=await supabase.from('question_set_questions').insert(data);
      if(qErr) throw qErr;
      router.push('/library/'+set.id);
    }catch(e:any){
      setError(e?.message||'Could not import the question set.');
      setSaving(false);
    }
  }

  if(!ready) return <main className="shell"><div className="panel">Loading…</div></main>;
  if(!user||user.is_anonymous) return <main className="shell narrow"><div className="eyebrow">CSV importer</div><h1>Import questions</h1><div className="panel"><p className="muted">CSV imports require a permanent BuzzBoard account.</p><Link className="btn" href="/account">Sign in or create account</Link></div></main>;

  const info=modeInfo[gameType];

  return <main className="shell">
    <div className="pageTitle"><div><div className="eyebrow">CSV question importer</div><h1>Import up to 200 questions.</h1><p className="muted">Choose the game format first. BuzzBoard will validate the CSV against that format and show a preview before anything is saved or published.</p></div><div className="metricPills"><div className="statChip">{validRows.length} valid</div><div className="statChip">{categories} categories</div></div></div>

    <section className="panel formStack">
      <div><label className="label">Game type</label><div className="gameTypeGrid">
        {([
          ['jeopardy','Jeopardy / Buzzer','Free-response clues with a live buzzer.'],
          ['multiple_choice','Multiple Choice','Four choices shown on each player device.'],
          ['closest_number','Closest Number','Players submit a number; closest answer wins.']
        ] as [GameType,string,string][]).map(([value,label,description])=>
          <button type="button" key={value} className={gameType===value?'gameTypeCard active':'gameTypeCard'} onClick={()=>changeGameType(value)}>
            <strong>{label}</strong><span>{description}</span>
          </button>
        )}
      </div></div>
      <div><label className="label">Question set title</label><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Los Angeles Lakers Question Bank" /></div>
      <div><label className="label">Description</label><textarea className="input textarea" value={description} onChange={e=>setDescription(e.target.value)} placeholder="A reusable trivia question bank." /></div>
      <label className="checkRow"><input type="checkbox" checked={published} onChange={e=>setPublished(e.target.checked)} /><span><strong>Publish after import</strong><small>The set is not published until the CSV passes validation, you review the preview, and you click the final import button.</small></span></label>
    </section>

    <section className="panel csvHelp">
      <div className="sectionTitle"><h2>{info.label} CSV format</h2><span className="muted">UTF-8 .csv recommended</span></div>
      <p className="muted">{info.description}</p>
      <div className="csvRequirementGrid">
        <div><strong>Required columns</strong><span>{info.required}</span></div>
        <div><strong>Optional columns</strong><span>{info.optional}</span></div>
      </div>
      <code>{info.example}</code>
      <p className="muted"><strong>Media:</strong> use a publicly reachable file URL in <code className="inlineCode">media_url</code> and set <code className="inlineCode">media_type</code> to <strong>image</strong> or <strong>audio</strong>. You can also add or replace uploaded media later in the manual editor.</p>
      <p className="muted"><strong>Large categories:</strong> a category can contain more than five questions. When the set is used in a game, BuzzBoard randomly selects up to five questions from each category for that board.</p>
    </section>

    <label className="csvDrop"><strong>Select {info.label} CSV file</strong><span className="muted">{fileName||'No file selected yet'}</span><input key={gameType} type="file" accept=".csv,text/csv" onChange={loadFile}/></label>
    {error&&<div className="errorBox">{error}</div>}

    {rows.length>0&&<section className="librarySection">
      <div className="sectionTitle"><h2>Import preview</h2><span className={invalidRows.length?'csvBadText':'csvGood'}>{invalidRows.length?invalidRows.length+' rows need attention':'Ready to import'}</span></div>
      <div className="csvPreviewWrap"><table className="csvPreview"><thead><tr>
        <th>#</th><th>Category</th><th>Prompt</th>
        {gameType==='multiple_choice'?<><th>Choices</th><th>Correct</th></>:<th>{gameType==='closest_number'?'Target':'Answer'}</th>}
        <th>Value</th><th>Media</th><th>Status</th>
      </tr></thead><tbody>
        {rows.map((r,i)=><tr className={r.valid?'':'csvBad'} key={i}>
          <td>{i+1}</td><td>{r.category}</td><td>{r.prompt}</td>
          {gameType==='multiple_choice'?<><td>{r.choices.join(' · ')}</td><td>{r.answer}</td></>:<td>{r.answer}</td>}
          <td>{r.value}</td><td>{r.media_url?(r.media_type||'Invalid'):'—'}</td>
          <td className={r.valid?'csvGood':'csvBadText'}>{r.valid?'Valid':r.error}</td>
        </tr>)}
      </tbody></table></div>
      <div className="actions"><Link className="btn secondary" href="/library/new">Use manual creator</Link><button className="btn" disabled={saving||!title.trim()||rows.length===0||rows.length>200||invalidRows.length>0} onClick={save}>{saving?'Importing…':published?'Import & publish '+info.label:'Import private '+info.label+' set'}</button></div>
    </section>}
  </main>
}
