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
 const [lobby,setLobby]=useState<LobbyGame|null>(null);const [game,setGame]=useState<Game|null>(null);const [question,setQuestion]=useState<GameQuestion|null>(null);
 const [players,setPlayers]=useState<GamePlayer[]>([]);const [me,setMe]=useState<GamePlayer|null>(null);const meRef=useRef<GamePlayer|null>(null);
 const [display,setDisplay]=useState('');const [winner,setWinner]=useState<Winner|null>(null);const [message,setMessage]=useState('Waiting for the host');const [error,setError]=useState('');
 const [submittedQuestion,setSubmittedQuestion]=useState<string|null>(null);const [numberValue,setNumberValue]=useState('');
 useEffect(()=>{meRef.current=me},[me]);
 const sorted=[...players].sort((a,b)=>b.score-a.score);const winnerName=players.find(p=>p.id===winner?.player_id)?.display_name;
 const canBuzz=!!me&&game?.game_type==='jeopardy'&&!!game?.buzzer_open&&!!game.active_question_id&&!winner;
 const canRespond=!!me&&!!game?.active_question_id&&game.game_type!=='jeopardy'&&submittedQuestion!==game.active_question_id;

 useEffect(()=>{let mounted=true;void(async()=>{try{await ensureUser();const {data,error}=await supabase.rpc('lookup_game_by_code',{p_code:String(code).toUpperCase()});if(error)throw error;const g=Array.isArray(data)?data[0]:data;if(!g)throw new Error('Room not found');if(mounted)setLobby(g as LobbyGame)}catch(e:any){setError(e?.message||'Could not find room')}})();return()=>{mounted=false}},[code]);

 useEffect(()=>{if(!me||!lobby)return;let channel:any;void(async()=>{await loadGame(lobby.id);await loadPlayers(lobby.id);channel=supabase.channel('player:'+lobby.id)
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'games',filter:'id=eq.'+lobby.id},async payload=>{const ng=payload.new as Game;const old=game?.active_question_id;setGame(ng);setWinner(null);if(ng.active_question_id!==old){setSubmittedQuestion(null);setNumberValue('')}setMessage(ng.game_type==='jeopardy'?(ng.buzzer_open?'Buzzer is live!':'Waiting for the host'):(ng.active_question_id?'Answer on your device':'Waiting for the host'));if(ng.active_question_id)await loadQuestion(ng.active_question_id);else setQuestion(null)})
  .on('postgres_changes',{event:'*',schema:'public',table:'game_players',filter:'game_id=eq.'+lobby.id},()=>loadPlayers(lobby.id))
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'buzz_winners',filter:'game_id=eq.'+lobby.id},payload=>{const w=payload.new as Winner;setWinner(w);setMessage(w.player_id===meRef.current?.id?'YOU GOT IT!':'Buzz locked')})
  .subscribe()})();return()=>{if(channel)supabase.removeChannel(channel)}},[me?.id,lobby?.id]);

 async function loadGame(gameId:string){const {data,error}=await supabase.from('games').select('*').eq('id',gameId).single();if(error)throw error;setGame(data as Game);if(data.active_question_id)await loadQuestion(data.active_question_id)}
 async function loadPlayers(gameId:string){const {data}=await supabase.from('game_players').select('*').eq('game_id',gameId);setPlayers((data||[]) as GamePlayer[]);const current=meRef.current;if(current){const mine=(data||[]).find((p:any)=>p.id===current.id);if(mine)setMe(mine as GamePlayer)}}
 async function loadQuestion(id:string){const {data}=await supabase.from('game_questions').select('*').eq('id',id).single();setQuestion(data as GameQuestion)}
 async function join(){try{await ensureUser(display);const name=display.trim()||'Player';const {data,error}=await supabase.rpc('join_game',{p_code:String(code).toUpperCase(),p_display_name:name});if(error)throw error;setMe(data as GamePlayer);meRef.current=data as GamePlayer}catch(e:any){setError(e?.message||'Could not join')}}
 async function buzz(){if(!canBuzz||!game||!me)return;setMessage('Sending buzz…');const {data,error}=await supabase.rpc('claim_buzz',{p_game_id:game.id,p_question_id:game.active_question_id,p_player_id:me.id});if(error)setMessage(error.message);else setMessage(data?.won?'YOU GOT IT!':'Someone beat you to it')}
 async function submit(choice?:string){
  if(!canRespond||!game||!me||!game.active_question_id)return;
  setMessage('Submitting…');
  const args:any={p_game_id:game.id,p_question_id:game.active_question_id,p_player_id:me.id,p_choice:null,p_number:null};
  if(game.game_type==='multiple_choice')args.p_choice=choice;
  else{const n=Number(numberValue);if(!Number.isFinite(n)){setMessage('Enter a valid number');return}args.p_number=n}
  const {error}=await supabase.rpc('submit_question_response',args);
  if(error)setMessage(error.message);else{setSubmittedQuestion(game.active_question_id);setMessage('Answer locked in!')}
 }

 if(error&&!lobby)return <main className="shell narrow"><div className="errorBox">{error}</div></main>;
 return <main className="shell playerShell"><div className="playerHeader"><div><div className="eyebrow">Room {String(code).toUpperCase()}</div><h1>{game?.name||lobby?.name||'Joining…'}</h1></div>{me&&<div className="scoreBubble"><span>Your score</span><strong>{me.score}</strong></div>}</div>
 {!me?<section className="panel joinCard"><h2>Choose your player name</h2><input className="input" maxLength={24} value={display} onChange={e=>setDisplay(e.target.value)} placeholder="Kian"/><button className="btn wide" onClick={join} disabled={!lobby}>Enter lobby</button></section>:
 <div className="playerLayout"><section className="buzzerPanel">
  {question?.media_url&&<div className="questionMedia">{question.media_type==='image'?<img src={question.media_url} alt="Question visual"/>:<audio controls src={question.media_url}/>}</div>}
  <div className="clueMini">{question?question.prompt:'Waiting for the next question…'}</div>
  {game?.game_type==='jeopardy'&&<button onClick={buzz} disabled={!canBuzz} className={'megaBuzz '+(canBuzz?'ready':'')}><span>{canBuzz?'BUZZ':'WAIT'}</span></button>}
  {game?.game_type==='multiple_choice'&&question&&<div className="playerChoices">{(question.choices||[]).map((choice,i)=><button key={i} className="choiceButton" disabled={!canRespond} onClick={()=>submit(choice)}><span>{String.fromCharCode(65+i)}</span>{choice}</button>)}</div>}
  {game?.game_type==='closest_number'&&question&&<div className="numberAnswer"><input className="input numberInput" type="number" step="any" placeholder="Enter your number" value={numberValue} disabled={!canRespond} onChange={e=>setNumberValue(e.target.value)}/><button className="btn wide" disabled={!canRespond||!numberValue.trim()} onClick={()=>submit()}>Lock in number</button></div>}
  <div className={'buzzMessage '+(winner?.player_id===me.id?'won':'')}>{game?.game_type==='jeopardy'&&winnerName?(winner?.player_id===me.id?'You buzzed first!':winnerName+' buzzed first'):message}</div>
 </section><aside className="panel"><h3>Leaderboard</h3>{sorted.map((p,i)=><div className={'scoreRow '+(p.id===me.id?'meRow':'')} key={p.id}><span className="rank">{i+1}</span><span>{p.display_name}</span><strong>{p.score}</strong></div>)}</aside></div>}
 </main>
}
