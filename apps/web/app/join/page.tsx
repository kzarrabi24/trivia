'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cleanCode } from '../../lib/auth';
export default function Join(){
 const [code,setCode]=useState(''); const r=useRouter();
 return <main className="shell narrow"><div className="eyebrow">Player join</div><h1>Enter the room.</h1><div className="panel"><label className="label">Room code</label><input autoFocus autoCapitalize="characters" maxLength={6} className="codeInput" placeholder="ABC123" value={code} onChange={e=>setCode(cleanCode(e.target.value))}/><button className="btn wide" onClick={()=>r.push(`/play/${code}`)} disabled={code.length!==6}>Join game</button><p className="muted center">No account setup is required for the MVP. Your device gets a persistent anonymous player identity.</p></div></main>
}
