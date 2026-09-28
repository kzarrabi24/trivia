'use client';
import { useEffect,useRef,useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { ensureUser } from '../../../lib/auth';
import type { Game,GamePlayer,GameQuestion } from '@buzzboard/shared';

type Winner={player_id:string;question_id:string;buzz_round:number};
type LobbyGame={id:string;name:string;code:string;status:string};

export default function PlayerRoom(){
 const {code}=useParams<{code:string}>();
 const [lobby,setLobby]=useState<LobbyGame|null>(null);
 const [game,setGame]=useState<Game|null>(null);
 const [question,setQuestion]=useState<GameQuestion|null>(null);
 const [players,setPlayers]=useState<GamePlayer[]>([]);
 const [me,setMe]=useState<GamePlayer|null>(null);
 const meRef=useRef<GamePlayer|null>(null);
 const [display,setDisplay]=useState('');
 const [winner,setWinner]=useState<Winner|null>(null);
 const [message,setMessage]=useState('Waiting for the host');
 const [error,setError]=useState('');
 const [submittedQuestion,setSubmittedQuestion]=useState<string|null>(null);
 const [numberValue,setNumberValue]=useState('');
 const [voiceTranscript,setVoiceTranscript]=useState('');
 const [voiceResult,setVoiceResult]=useState<'correct'|'incorrect'|null>(null);
 const [now,setNow]=useState(Date.now());
 const recognitionRef=useRef<any>(null);
 const voiceSubmittedRef=useRef<string|null>(null);

 useEffect(()=>{meRef.current=me},[me]);

 const sorted=[...players].sort((a,b)=>b.score-a.score);
 const winnerName=players.find(p=>p.id===winner?.player_id)?.display_name;
 const canBuzz=!!me&&game?.game_type==='jeopardy'&&!!game?.buzzer_open&&!!game.active_question_id&&!winner;
 const canRespond=!!me&&!!game?.active_question_id&&game.game_type!=='jeopardy'&&submittedQuestion!==game.active_question_id;
 const voiceActive=!!me&&game?.game_type==='jeopardy'&&game.voice_answer_player_id===me.id&&!!game.active_question_id;
 const secondsLeft=game?.voice_answer_deadline?Math.max(0,(new Date(game.voice_answer_deadline).getTime()-now)/1000):0;

 useEffect(()=>{
  if(!game?.voice_answer_deadline)return;
  const id=setInterval(()=>setNow(Date.now()),100);
  return()=>clearInterval(id);
 },[game?.voice_answer_deadline]);

 useEffect(()=>{
  let mounted=true;
  void(async()=>{
   try{
    await ensureUser();
    const {data,error}=await supabase.rpc('lookup_game_by_code',{p_code:String(code).toUpperCase()});
    if(error)throw error;
    const g=Array.isArray(data)?data[0]:data;
    if(!g)throw new Error('Room not found');
    if(mounted)setLobby(g as LobbyGame);
   }catch(e:any){setError(e?.message||'Could not find room')}
  })();
  return()=>{mounted=false};
 },[code]);

 useEffect(()=>{
  if(!me||!lobby)return;
  let channel:any;
  void(async()=>{
   await loadGame(lobby.id);
   await loadPlayers(lobby.id);
   channel=supabase.channel('player:'+lobby.id)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'games',filter:'id=eq.'+lobby.id},async payload=>{
      const ng=payload.new as Game;
      setGame(prev=>{
        if(ng.active_question_id!==prev?.active_question_id){
          setSubmittedQuestion(null);
          setNumberValue('');
          setVoiceTranscript('');
          setVoiceResult(null);
          voiceSubmittedRef.current=null;
        }
        return ng;
      });
      setWinner(null);
      if(ng.game_type==='jeopardy'){
        if(ng.voice_answer_player_id===meRef.current?.id)setMessage('You are up — answer now!');
        else setMessage(ng.buzzer_open?'Buzzer is live!':'Waiting for the host');
      }else{
        setMessage(ng.active_question_id?'Answer on your device':'Waiting for the host');
      }
      if(ng.active_question_id)await loadQuestion(ng.active_question_id);else setQuestion(null);
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'game_players',filter:'game_id=eq.'+lobby.id},()=>loadPlayers(lobby.id))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'buzz_winners',filter:'game_id=eq.'+lobby.id},payload=>{
      const w=payload.new as Winner;
      setWinner(w);
      setMessage(w.player_id===meRef.current?.id?'YOU WERE FASTEST! Wait for the host to call on you.':'Buzz locked');
    })
    .subscribe();
  })();
  return()=>{if(channel)supabase.removeChannel(channel)};
 },[me?.id,lobby?.id]);

 useEffect(()=>{
  if(!voiceActive||!me?.voice_ready||!game?.active_question_id||!game.voice_answer_deadline)return;
  if(voiceSubmittedRef.current===game.active_question_id)return;
  startVoiceRecognition();
  return()=>{try{recognitionRef.current?.stop()}catch{}};
 },[voiceActive,me?.voice_ready,game?.active_question_id,game?.voice_answer_deadline]);

 async function loadGame(gameId:string){
  const {data,error}=await supabase.from('games').select('*').eq('id',gameId).single();
  if(error)throw error;
  setGame(data as Game);
  if(data.active_question_id)await loadQuestion(data.active_question_id);
 }
 async function loadPlayers(gameId:string){
  const {data}=await supabase.from('game_players').select('*').eq('game_id',gameId);
  setPlayers((data||[]) as GamePlayer[]);
  const current=meRef.current;
  if(current){
   const mine=(data||[]).find((p:any)=>p.id===current.id);
   if(mine)setMe(mine as GamePlayer);
  }
 }
 async function loadQuestion(id:string){
  const {data}=await supabase.from('game_questions').select('*').eq('id',id).single();
  setQuestion(data as GameQuestion);
 }
 async function join(){
  try{
   await ensureUser(display);
   const name=display.trim()||'Player';
   const {data,error}=await supabase.rpc('join_game',{p_code:String(code).toUpperCase(),p_display_name:name});
   if(error)throw error;
   setMe(data as GamePlayer);
   meRef.current=data as GamePlayer;
  }catch(e:any){setError(e?.message||'Could not join')}
 }
 async function enableVoice(){
  if(!me)return;
  setError('');
  try{
   const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
   if(!SR)throw new Error('Voice recognition is not supported by this browser. Chrome or Edge is recommended.');
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access is not supported by this browser.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   stream.getTracks().forEach(track=>track.stop());
   const {error}=await supabase.rpc('set_voice_ready',{p_player_id:me.id,p_ready:true});
   if(error)throw error;
   setMe({...me,voice_ready:true});
   meRef.current={...me,voice_ready:true};
   setMessage('Microphone ready. Audio is not stored by BuzzBoard.');
  }catch(e:any){setError(e?.message||'Could not enable microphone')}
 }
 async function buzz(){
  if(!canBuzz||!game||!me)return;
  setMessage('Sending buzz…');
  const {data,error}=await supabase.rpc('claim_buzz',{p_game_id:game.id,p_question_id:game.active_question_id,p_player_id:me.id});
  if(error)setMessage(error.message);else setMessage(data?.won?'YOU WERE FASTEST! Wait for the host to call on you.':'Someone beat you to it');
 }
 async function submit(choice?:string){
  if(!canRespond||!game||!me||!game.active_question_id)return;
  setMessage('Submitting…');
  const args:any={p_game_id:game.id,p_question_id:game.active_question_id,p_player_id:me.id,p_choice:null,p_number:null};
  if(game.game_type==='multiple_choice')args.p_choice=choice;
  else{
   const n=Number(numberValue);
   if(!Number.isFinite(n)){setMessage('Enter a valid number');return}
   args.p_number=n;
  }
  const {error}=await supabase.rpc('submit_question_response',args);
  if(error)setMessage(error.message);else{setSubmittedQuestion(game.active_question_id);setMessage('Answer locked in!')}
 }

 function startVoiceRecognition(){
  if(!game||!me||!game.active_question_id||!game.voice_answer_deadline)return;
  const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
  if(!SR){setError('Voice recognition is not supported by this browser.');return}

  const questionId=game.active_question_id;
  const recognition=new SR();
  recognition.continuous=false;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  recognition.lang='en-US';
  recognitionRef.current=recognition;
  let latest='';

  recognition.onresult=(event:any)=>{
   let text='';
   for(let i=event.resultIndex;i<event.results.length;i++)text+=event.results[i][0]?.transcript||'';
   latest=text.trim();
   setVoiceTranscript(latest);
  };
  recognition.onerror=(event:any)=>{
   if(event.error!=='no-speech')setMessage('Microphone error: '+event.error);
  };
  recognition.onend=()=>{
   recognitionRef.current=null;
   if(voiceSubmittedRef.current!==questionId)void submitVoiceTranscript(questionId,latest);
  };

  try{
   recognition.start();
   setMessage('Listening… say your answer now.');
   const remaining=Math.max(0,new Date(game.voice_answer_deadline).getTime()-Date.now());
   window.setTimeout(()=>{try{recognition.stop()}catch{}},remaining);
  }catch(e:any){
   setError(e?.message||'Could not start voice recognition');
  }
 }

 async function submitVoiceTranscript(questionId:string,transcript:string){
  if(!game||!me||voiceSubmittedRef.current===questionId)return;
  voiceSubmittedRef.current=questionId;
  setMessage(transcript?'Checking “'+transcript+'”…':'No answer detected.');
  const {data,error}=await supabase.rpc('submit_voice_answer',{
   p_game_id:game.id,
   p_question_id:questionId,
   p_player_id:me.id,
   p_transcript:transcript
  });
  if(error){
   setMessage(error.message);
   return;
  }
  const correct=!!data?.correct;
  setVoiceResult(correct?'correct':'incorrect');
  setMessage(correct?'Correct!':'Incorrect.');
  await loadPlayers(game.id);
 }

 if(error&&!lobby)return <main className="shell narrow"><div className="errorBox">{error}</div></main>;

 return <main className="shell playerShell">
  <div className="playerHeader"><div><div className="eyebrow">Room {String(code).toUpperCase()}</div><h1>{game?.name||lobby?.name||'Joining…'}</h1></div>{me&&<div className="scoreBubble"><span>Your score</span><strong>{me.score}</strong></div>}</div>
  {!me?<section className="panel joinCard"><h2>Choose your player name</h2><input className="input" maxLength={24} value={display} onChange={e=>setDisplay(e.target.value)} placeholder="Kian"/><button className="btn wide" onClick={join} disabled={!lobby}>Enter lobby</button></section>:
  <div className="playerLayout"><section className="buzzerPanel">
   {game?.game_type==='jeopardy'&&!me.voice_ready&&<div className="voiceSetup"><strong>Enable voice answers before buzzing</strong><p>BuzzBoard will request microphone permission so it can recognize your spoken answer if the host calls on you. The app does not store microphone audio.</p><button className="btn" onClick={enableVoice}>Enable microphone</button></div>}
   {question?.media_url&&<div className="questionMedia">{question.media_type==='image'?<img src={question.media_url} alt="Question visual"/>:<audio controls src={question.media_url}/>}</div>}
   <div className="clueMini">{question?question.prompt:'Waiting for the next question…'}</div>

   {game?.game_type==='jeopardy'&&voiceActive?<div className={'voiceAnswerPanel '+(voiceResult||'')}>
     <div className="voiceCountdown">{secondsLeft.toFixed(1)}</div>
     <strong>{voiceResult?voiceResult==='correct'?'Correct!':'Incorrect':'Speak your answer now'}</strong>
     <div className="voiceWave">🎙️</div>
     <div className="voiceTranscript">{voiceTranscript||'Listening…'}</div>
     <small>Audio is not stored by BuzzBoard.</small>
    </div>:game?.game_type==='jeopardy'&&<button onClick={buzz} disabled={!canBuzz||!me.voice_ready} className={'megaBuzz '+(canBuzz&&me.voice_ready?'ready':'')}><span>{canBuzz&&me.voice_ready?'BUZZ':'WAIT'}</span></button>}

   {game?.game_type==='multiple_choice'&&question&&<div className="playerChoices">{(question.choices||[]).map((choice,i)=><button key={i} className="choiceButton" disabled={!canRespond} onClick={()=>submit(choice)}><span>{String.fromCharCode(65+i)}</span>{choice}</button>)}</div>}
   {game?.game_type==='closest_number'&&question&&<div className="numberAnswer"><input className="input numberInput" type="number" step="any" placeholder="Enter your number" value={numberValue} disabled={!canRespond} onChange={e=>setNumberValue(e.target.value)}/><button className="btn wide" disabled={!canRespond||!numberValue.trim()} onClick={()=>submit()}>Lock in number</button></div>}

   <div className={'buzzMessage '+(winner?.player_id===me.id?'won':'')}>{game?.game_type==='jeopardy'&&winnerName&&!voiceActive?(winner?.player_id===me.id?'You were fastest! Wait for the host to call your name.':winnerName+' was fastest'):message}</div>
   {error&&<div className="errorBox">{error}</div>}
  </section>
  <aside className="panel"><h3>Leaderboard</h3>{sorted.map((p,i)=><div className={'scoreRow '+(p.id===me.id?'meRow':'')} key={p.id}><span className="rank">{i+1}</span><span>{p.display_name}</span><strong>{p.score}</strong></div>)}</aside></div>}
 </main>
}
