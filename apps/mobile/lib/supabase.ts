import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const storage = {
  getItem: (key:string) => SecureStore.getItemAsync(key),
  setItem: (key:string,value:string) => SecureStore.setItemAsync(key,value),
  removeItem: (key:string) => SecureStore.deleteItemAsync(key),
};

export const supabase=createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}
);

export async function ensureUser(displayName?:string){
  let {data:{user}}=await supabase.auth.getUser();
  if(!user){const r=await supabase.auth.signInAnonymously();if(r.error)throw r.error;user=r.data.user;}
  if(!user)throw new Error('Could not create session');
  await supabase.rpc('ensure_profile',{p_display_name:displayName??null});
  return user;
}
