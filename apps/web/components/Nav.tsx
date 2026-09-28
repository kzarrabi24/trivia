import Link from 'next/link';
export function Nav(){
  return <header className="nav"><Link className="brand" href="/"><span className="brandDot">B</span> BuzzBoard</Link><nav><Link href="/host">Host</Link><Link href="/join">Join</Link><Link href="/profile">My stats</Link></nav></header>
}
