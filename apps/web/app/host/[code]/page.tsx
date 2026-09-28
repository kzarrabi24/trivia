'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { ensureUser } from '../../../lib/auth';
import type { Game,GameCategory,GamePlayer,GameQuestion } from '@buzzboard/shared';

type BuzzWinner={player_id:string;question_id:string;buzz_round:number};
export default function HostRoom(){
 const {code}=useParams<{code:string}>();
 const [game,setGame]=useState<Game|null>(null); const [cats,setCats]=useState<GameCategory[]>([]); const [questions,setQuestions]=useState<GameQuestion[]>([]); const [players,setPlayers]=useState<GamePlayer[]>([]); const [winner,setWinner]=useState<BuzzWinner|null>(null); const [error,setError]=useState('');
 const active=questions.find(q=>q.id===game?.active_question_id)||null;
 const winnerPlayer=players.find(p=>p.id===winner?.player_id)||null;
 const sortedPlayers=[...players].sort((a,b)=>b.score-a.score);
 const available=useMemo(()=>questions.filter(q=>q.state==='available').length,[questions]);
 useEffect(()=>{let mounted=true;let channel:any; void (async()=>{try{const user=await ensureUser();const {data:g,error}=await supabase.from('games').select('*').eq('code',String(code).toUpperCase()).single();if(error||!g)throw error||new Error('Room not found');if(g.host_id!==user.id)throw new Error('This room belongs to a different host session.');if(!mounted)return;setGame(g);await refresh(g.id);channel=supabase.channel(`host:${g.id}`).on('postgres_changes',{event:'*',schema:'public',table:'game_players',filter:`game_id=eq.${g.id}`},()=>refreshPlayers(g.id)).on('postgres_changes',{event:'*',schema:'public',table:'games',filter:`id=eq.${g.id}`},payload=>setGame(payload.new as Game)).on('postgres_changes',{event:'*',schema:'public',table:'game_questions',filter:`game_id=eq.${g.id}`},()=>refreshQuestions(g.id)).on('postgres_changes',{event:'INSERT',schema:'public',table:'buzz_winners',filter:`game_id=eq.${g.id}`},payload=>setWinner(payload.new as BuzzWinner)).subscribe();}catch(e:any){setError(e?.message||'Could not load room')}})();return()=>{mounted=false;if(channel)supabase.removeChannel(channel)}},[code]);
 async function refresh(gameId:string){await Promise.all([refreshPlayers(gameId),refreshQuestions(gameId),refreshCats(gameId)]);}
 async function refreshPlayers(gameId:string){const {data}=await supabase.from('game_players').select('*').eq('game_id',gameId);setPlayers((data||[]) as GamePlayer[])}
 async function refreshQuestions(gameId:string){const {data}=await supabase.from('game_questions').select('*').eq('game_id',gameId).order('sort_order');setQuestions((data||[]) as GameQuestion[])}
 async function refreshCats(gameId:string){const {data}=await supabase.from('game_categories').select('*').eq('game_id',gameId).order('sort_order');setCats((data||[]) as GameCategory[])}
 async function call(fn:string,args:any){setError('');const {error}=await supabase.rpc(fn,args);if(error)setError(error.message);}
 async function activate(id:string){setWinner(null);await call('activate_question',{p_game_id:game!.id,p_question_id:id});}
 async function setOpen(open:boolean){if(open)setWinner(null);await call('set_buzzer_open',{p_game_id:game!.id,p_open:open});}
 async function judge(correct:boolean){if(!active||!winnerPlayer)return;await call('judge_answer',{p_game_id:game!.id,p_question_id:active.id,p_player_id:winnerPlayer.id,p_correct:correct});setWinner(null);await refreshPlayers(game!.id);await refreshQuestions(game!.id)}
 async function reopen(){setWinner(null);await call('reopen_buzzer',{p_game_id:game!.id})}
 if(error&&!game)return <main className="shell"><div className="errorBox">{error}</div></main>;
 if(!game)return <main className="shell"><div className="panel">Loading host room…</div></main>;
 return <main className="shell wideShell"><div className="roomTop"><div><div className="eyebrow">Host control room</div><h1>{game.name}</h1><div className="roomCode">Room code <strong>{game.code}</strong></div></div><div className="roomStats"><span>{players.length} players</span><span>{available} clues left</span><span className={game.buzzer_open?'livePill':'idlePill'}>{game.buzzer_open?'BUZZER OPEN':'BUZZER CLOSED'}</span></div></div>
  {error&&<div className="errorBox">{error}</div>}
  <div className="hostLayout"><section>
   <div className="board" style={{gridTemplateColumns:`repeat(${Math.max(cats.length,1)},minmax(150px,1fr))`}}>{cats.map(c=><div className="boardColumn" key={c.id}><div className="categoryTile">{c.name}</div>{questions.filter(q=>q.game_category_id===c.id).sort((a,b)=>a.value-b.value).map(q=><button disabled={q.state!=='available'||!!game.active_question_id} onClick={()=>activate(q.id)} className={`tile ${q.state}`} key={q.id}>{q.state==='used'?'✓':q.value}</button>)}</div>)}</div>
  </section><aside className="hostSide"><section className="panel"><div className="sectionTitle"><h3>Live clue</h3><span className="muted">Round {game.buzz_round}</span></div>{active?<><div className="clueValue">{active.value} pts</div><div className="liveClue">{active.prompt}</div><details><summary>Show answer</summary><div className="answerReveal">{active.answer}</div></details><div className="actions stackActions">{!game.buzzer_open&&!winner&&<button className="btn green" onClick={()=>setOpen(true)}>Open buzzer</button>}{game.buzzer_open&&!winner&&<button className="btn secondary" onClick={()=>setOpen(false)}>Close buzzer</button>}{winnerPlayer&&<div className="winnerBox"><div className="eyebrow">First buzz</div><strong>{winnerPlayer.display_name}</strong><div className="judgeRow"><button className="btn green" onClick={()=>judge(true)}>✓ Correct</button><button className="btn dangerBtn" onClick={()=>judge(false)}>✕ Incorrect</button></div></div>}{!game.buzzer_open&&!winner&&active&&<button className="btn secondary" onClick={reopen}>Reopen for remaining players</button>}</div></>:<div className="emptyState">Select an unused clue from the board.</div>}</section>
   <section className="panel"><div className="sectionTitle"><h3>Leaderboard</h3><span className="muted">Live</span></div>{sortedPlayers.length?sortedPlayers.map((p,i)=><div className="scoreRow" key={p.id}><span className="rank">{i+1}</span><span>{p.display_name}</span><strong>{p.score}</strong></div>):<div className="emptyState">Players appear here as they join.</div>}</section>
   <section className="panel"><button className="btn secondary wide" onClick={()=>navigator.clipboard.writeText(`${location.origin}/play/${game.code}`)}>Copy player join link</button></section>
  </aside></div>
 </main>
}
