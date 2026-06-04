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
    // onAuthStateChange é a fonte de verdade — não usa getSession separado
    // para evitar race condition que causava logout indevido
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const user = session.user
        try {
          // 1. Busca na tabela de perfis
          let { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()

          // 2. Se o perfil NÃO existir, faz o insert imediatamente
          if (!profile) {
            const newProfile = {
              id: user.id,
              username: user.user_metadata?.username || user.email?.split('@')[0] || 'Usuario'
            }
            const { data: insertedProfile } = await supabase
              .from('profiles')
              .insert(newProfile)
              .select()
              .single()

            profile = insertedProfile || newProfile
          }

          // 3. Substitui o estado de 'user' pelo perfil preenchido
          const sessionWithProfile = {
            ...session,
            user: {
              ...session.user,
              user_metadata: {
                ...session.user.user_metadata,
                username: profile.username,
                avatar_url: profile.avatar_url
              }
            }
          }
          setSession(sessionWithProfile)
        } catch (error) {
          console.error('Erro ao verificar/criar perfil:', error)
          setSession(session)
        }
      } else {
        setSession(null)
      }
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
