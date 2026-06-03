import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'

export function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username || email.split('@')[0],
          },
        },
      })
      if (error) {
        setErrorMsg(error.message)
      } else {
        // Insere o username na tabela profiles para garantir consistência
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username || email.split('@')[0],
          })
        }
        setSuccessMsg('Cadastro realizado! Verifique seu e-mail ou tente fazer o login.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setErrorMsg(error.message)
      }
    }
    setLoading(false)
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-zinc-950 text-white font-sans">
      {/* Card container */}
      <div className="w-full max-w-md p-8 bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-zinc-800 focus-within:border-purple-500 transition-colors shadow-[0_0_50px_-12px_rgba(147,51,234,0.2)] flex flex-col space-y-6 animate-fade-in">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-purple-600/10 rounded-xl border border-purple-500/20 mb-1">
            <span className="text-3xl">🎙️</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {isSignUp ? 'Criar Conta' : 'Iniciar Sessão'}
          </h2>
          <p className="text-zinc-400 text-xs">
            Entre no circuito. A voz do seu squad em tempo real.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Username</label>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 transition-colors group-focus-within:text-purple-400" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Player1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">E-mail</label>
            <div className="relative group">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 transition-colors group-focus-within:text-purple-400" />
              <input
                type="email"
                required
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400">Senha</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 transition-colors group-focus-within:text-purple-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Feedback */}
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs text-center">
              ⚠️ {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs text-center">
              ✨ {successMsg}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-purple-900/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : isSignUp ? (
              'Criar Conta'
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        {/* Toggle */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setErrorMsg(null)
              setSuccessMsg(null)
            }}
            className="text-xs text-zinc-400 hover:text-purple-400 transition-colors cursor-pointer"
          >
            {isSignUp
              ? 'Já tem uma conta? Conecte-se'
              : 'Novo no ZeeRAID? Crie uma conta'}
          </button>
        </div>

      </div>
    </div>
  )
}
