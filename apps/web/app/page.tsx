import Link from 'next/link';
export default function Home(){
 return <main className="shell">
  <section className="hero">
   <div className="eyebrow">One trivia platform · web + iOS + Android</div>
   <h1>Buzz first.<br/><span className="accent">Know more.</span></h1>
   <p>Run Jeopardy-style games with a synchronized buzzer, host-controlled scoring, flexible categories, and player profiles that reveal exactly where everyone performs best.</p>
   <div className="actions"><Link className="btn" href="/host">Create a game</Link><Link className="btn secondary" href="/join">Join with a code</Link></div>
  </section>
  <section className="featureGrid">
   <article className="feature"><span>⚡</span><h3>Server-timed buzzes</h3><p>Every device asks the same backend to claim the buzz. One winner, one timestamp, no client deciding for itself.</p></article>
   <article className="feature"><span>🧠</span><h3>Category intelligence</h3><p>Accuracy, attempts, points won and net points build automatically from every judged answer.</p></article>
   <article className="feature"><span>🎛️</span><h3>Host control room</h3><p>Reveal clues, open the buzzer, judge answers, reopen after misses and watch the leaderboard update live.</p></article>
  </section>
  <section className="split"><div><div className="eyebrow">How it works</div><h2>A TV can show the board. Every phone becomes a buzzer.</h2></div><ol className="steps"><li><b>1</b><span>Host creates categories and clues.</span></li><li><b>2</b><span>Players join with the six-character room code.</span></li><li><b>3</b><span>Host reveals a clue and opens buzzing.</span></li><li><b>4</b><span>Fastest valid buzz locks; score and stats update together.</span></li></ol></section>
 </main>
}
