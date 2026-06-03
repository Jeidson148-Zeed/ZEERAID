import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import { Auth } from './components/Auth'
import { Dashboard } from './components/Dashboard'
import './App.css'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error || !session) {
        // Sessão inválida ou inexistente — limpa tudo e vai para login
        await supabase.auth.signOut()
        setSession(null)
      } else {
        // Verifica se o usuário ainda existe no Supabase
        const { error: userError } = await supabase.auth.getUser()
        if (userError) {
          // Usuário foi deletado — limpa sessão local
          await supabase.auth.signOut()
          setSession(null)
        } else {
          setSession(session)
        }
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 text-sm font-medium">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  return <Dashboard session={session} />
}

export default App
