'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function AccountPage() {
  const [user, setUser] = useState<any>(null);
  const [mode, setMode] = useState<'signin'|'create'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadUser();
    const { data } = supabase.auth.onAuthStateChange(() => void loadUser());
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user ?? null);
    if (user && !user.is_anonymous) {
      const preferred = user.user_metadata?.full_name || user.user_metadata?.name || '';
      await supabase.rpc('ensure_profile', { p_display_name: preferred || null });
    }
  }

  async function clearAnonymousSession() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.is_anonymous) await supabase.auth.signOut();
  }

  async function submit() {
    setBusy(true); setError(''); setMessage('');
    try {
      await clearAnonymousSession();
      if (mode === 'create') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || 'Player' } }
        });
        if (error) throw error;
        if (data.session && data.user) {
          await supabase.rpc('ensure_profile', { p_display_name: displayName.trim() || null });
          setMessage('Account created. You are signed in.');
          await loadUser();
        } else {
          setMessage('Account created. Check your email to confirm your address, then sign in.');
          setMode('signin');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
        const preferred = data.user?.user_metadata?.display_name || data.user?.user_metadata?.full_name || null;
        await supabase.rpc('ensure_profile', { p_display_name: preferred });
        setMessage('Signed in.');
        await loadUser();
      }
    } catch (e:any) {
      setError(e?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true); setError(''); setMessage('');
    try {
      await clearAnonymousSession();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.hostname === 'localhost' ? 'https://trivia-ten-sepia.vercel.app' : window.location.origin}/account` }
      });
      if (error) throw error;
    } catch (e:any) {
      setError(e?.message || 'Google sign-in could not start.');
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setMessage('Signed out.');
  }

  const permanent = user && !user.is_anonymous;

  return <main className="shell narrow">
    <div className="eyebrow">BuzzBoard account</div>
    <h1>{permanent ? 'Your account' : 'Sign in or create an account'}</h1>

    {permanent ? <section className="panel accountCard">
      <div className="accountIdentity">
        <div className="avatarCircle">{(user.email || 'B')[0].toUpperCase()}</div>
        <div><strong>{user.email}</strong><span>Permanent account</span></div>
      </div>
      <p className="muted">Your account can publish community question sets, save copies of other creators&apos; sets, and keep a reusable personal library.</p>
      <div className="actions">
        <Link className="btn" href="/library">Browse question sets</Link>
        <Link className="btn secondary" href="/library/new">Create a question set</Link><Link className="btn secondary" href="/creator">Creator analytics</Link>
        <button className="btn secondary" onClick={signOut}>Sign out</button>
      </div>
    </section> : <>
      {user?.is_anonymous && <div className="infoBox">You currently have a temporary gameplay session. Creating or signing into an account will replace that temporary session.</div>}
      <section className="panel authPanel">
        <div className="tabRow">
          <button className={mode==='signin'?'tab active':'tab'} onClick={()=>setMode('signin')}>Sign in</button>
          <button className={mode==='create'?'tab active':'tab'} onClick={()=>setMode('create')}>Create account</button>
        </div>
        {mode === 'create' && <>
          <label className="label">Display name</label>
          <input className="input" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Kian" />
        </>}
        <label className="label">Email</label>
        <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
        <label className="label">Password</label>
        <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
        <button className="btn wide" disabled={busy || !email.trim() || password.length < 6} onClick={submit}>
          {busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}
        </button>
        <div className="orDivider"><span>or</span></div>
        <button className="btn googleBtn wide" disabled={busy} onClick={google}>Continue with Google</button>
      </section>
    </>}

    {message && <div className="successBox">{message}</div>}
    {error && <div className="errorBox">{error}</div>}
  </main>
}
