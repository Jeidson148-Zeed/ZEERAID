import { useState, useRef, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import {
  ChevronDown,
  ChevronRight,
  Volume2,
  Hash,
  Mic,
  MicOff,
  LogOut,
  Send,
  Users,
  Compass,
  Settings,
  Plus,
  MessageSquare,
  Headphones,
  Trash,
  Menu
} from 'lucide-react'

interface DashboardProps {
  session: Session
}




export function Dashboard({ session }: DashboardProps) {
  const user = session?.user
  
  // Busca o username de todas as fontes possíveis em ordem de prioridade
  const username = 
    user?.user_metadata?.username ||      // cadastrado com username
    user?.user_metadata?.full_name ||     // OAuth (Google, etc)
    user?.user_metadata?.name ||          // outra chave OAuth
    user?.email?.split('@')[0] ||         // prefixo do email como fallback
    'Membro'
  
  const [channels, setChannels] = useState<any[]>([])
  const [currentTextChannel, setCurrentTextChannel] = useState<any>(null)
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState<any>(null)
  const myRole = (username === 'jeidson148' || user?.email?.includes('jeidson148') || username === 'jeidson147') ? 'owner' : 'member'

  // Busca o username do usuário atual direto da sessão ativa (mais confiável)
  const getActiveUsername = async (): Promise<string> => {
    const { data: { session: s } } = await supabase.auth.getSession()
    const u = s?.user
    return u?.user_metadata?.username 
      || u?.user_metadata?.full_name
      || u?.user_metadata?.name
      || u?.email?.split('@')[0] 
      || username
  }

  // Cache de usernames reativo: { [user_id]: username }
  const [usernameCache, setUsernameCache] = useState<Record<string, string>>({ [user?.id || '']: username })
  const usernameCacheRef = useRef<Record<string, string>>({ [user?.id || '']: username })

  const cacheUsername = (userId: string, name: string) => {
    if (!userId || !name || name === 'Membro') return
    if (usernameCacheRef.current[userId] === name) return
    usernameCacheRef.current[userId] = name
    setUsernameCache(prev => ({ ...prev, [userId]: name }))
  }
  const [userStatus, setUserStatus] = useState({ type: 'online', text: 'Conectado' })
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [voiceUsers, setVoiceUsers] = useState<Record<string, any[]>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [globalOnlineUsers, setGlobalOnlineUsers] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])

  const [inputVal, setInputVal] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Modal de Criação de Canais
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text')

  // WebRTC Refs
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({})
  const localStream = useRef<MediaStream | null>(null)
  const voiceRoomRef = useRef<any>(null)
  const trackTimerRef = useRef<any>(null)
  const isMutedRef = useRef(isMuted)

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  const globalOnlineUsersRef = useRef(globalOnlineUsers)
  useEffect(() => {
    globalOnlineUsersRef.current = globalOnlineUsers
  }, [globalOnlineUsers])

  // Helper to identify voice channels
  const isVoiceChannel = (channel: any) => {
    if (!channel) return false
    return channel.parent_id !== null || channel.name === 'League of Legends' || channel.name === 'Counter-Strike 2'
  }

  // WebRTC Presence connection handlers
  const joinVoiceChannel = async (channel: any) => {
    setCurrentVoiceChannel(channel)
  }

  const leaveVoiceChannel = async () => {
    setCurrentVoiceChannel(null)
  }

  // Lógica de Mutar o Microfone (o envio ao Supabase é feito pelo useEffect debounced)
  const toggleMute = () => {
    const nextMuteState = !isMuted;
    setIsMuted(nextMuteState);
    localStream.current?.getAudioTracks().forEach(track => {
      track.enabled = !nextMuteState;
    });
  }

  // Lógica de Mutar o Áudio Geral
  const toggleDeafen = () => {
    const nextDeafened = !isDeafened
    setIsDeafened(nextDeafened)
    
    // Busca todas as tags audio criadas dinamicamente e altera muted
    document.querySelectorAll('audio').forEach(audioEl => {
      audioEl.muted = nextDeafened
    })
  }

  // Lógica de Desconexão de Sala de Voz
  const handleDisconnectVoice = () => {
    if (!currentVoiceChannel) return

    localStream.current?.getTracks().forEach(track => track.stop())
    localStream.current = null

    Object.values(peerConnections.current).forEach(pc => pc.close())
    peerConnections.current = {}

    // Remover as tags de áudio do DOM
    document.querySelectorAll('audio').forEach(el => {
      if (el.id.startsWith('audio-')) {
        el.remove()
      }
    })

    // Remova o SEU próprio ID da lista daquele canal localmente, mas PRESERVE os outros
    setVoiceUsers(prev => {
      const currentList = prev[currentVoiceChannel.id] || []
      const filteredList = currentList.filter((u: any) => u.user_id !== user?.id)
      return {
        ...prev,
        [currentVoiceChannel.id]: filteredList
      }
    })

    setCurrentVoiceChannel(null)
    setIsMuted(false)
    setIsDeafened(false)
  }

  // WebRTC Peer Connection Helper
  const getOrCreatePeerConnection = (targetUserId: string, voiceRoom: any) => {
    if (peerConnections.current[targetUserId]) {
      return peerConnections.current[targetUserId]
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    // Adiciona faixas locais
    localStream.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStream.current!)
    })

    // Quando chega stream remoto
    pc.ontrack = (event) => {
      let audioEl = document.getElementById(`audio-${targetUserId}`) as HTMLAudioElement;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-${targetUserId}`;
        audioEl.autoplay = true;
        audioEl.controls = false;
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = event.streams[0];
      audioEl.muted = isDeafened;
      audioEl.play().catch(err => console.log("Erro ao forçar play de áudio:", err));
    };

    // ICE Candidate
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        voiceRoom.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            target: targetUserId,
            candidate: event.candidate,
            sender: user?.id
          }
        })
      }
    }

    peerConnections.current[targetUserId] = pc
    return pc
  }

  // Supabase Presence & WebRTC Signaling Integration
  useEffect(() => {
    if (!currentVoiceChannel) return

    let voiceRoom: any
    let audioContext: AudioContext | null = null
    let animationFrameId: number | null = null

    const setupVoiceChannel = async () => {
      // 1. Capturar microfone local
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        })
        // Aplica o estado de mute inicial do microfone
        localStream.current?.getAudioTracks().forEach(track => {
          track.enabled = !isMutedRef.current
        })

        // Web Audio API para detecção de volume (Voice Activation)
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          audioContext = new AudioContextClass()
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          const microphone = audioContext.createMediaStreamSource(localStream.current)
          microphone.connect(analyser)

          const bufferLength = analyser.frequencyBinCount
          const dataArray = new Uint8Array(bufferLength)
          let lastSpeakingTime = 0

          const checkVolume = () => {
            if (!analyser || !audioContext) return
            analyser.getByteTimeDomainData(dataArray)

            // Calcula o RMS (Root Mean Square) do volume
            let sum = 0
            for (let i = 0; i < bufferLength; i++) {
              const value = (dataArray[i] - 128) / 128
              sum += value * value
            }
            const rms = Math.sqrt(sum / bufferLength)
            const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity

            // Voice activation threshold (-55dB) com hangover de 400ms para evitar oscilações
            const now = Date.now()
            const isMicMuted = isMutedRef.current
            
            if (db > -55 && !isMicMuted) {
              lastSpeakingTime = now
              setIsSpeaking(true)
            } else if (now - lastSpeakingTime > 400) {
              setIsSpeaking(false)
            }

            animationFrameId = requestAnimationFrame(checkVolume)
          }

          animationFrameId = requestAnimationFrame(checkVolume)
        } catch (e) {
          console.error('Erro ao inicializar analisador de áudio:', e)
        }
      } catch (err: any) {
        console.error('Falha de permissão ao capturar dispositivo de áudio:', err.message)
        alert('Falha de permissão ao capturar o microfone. Por favor, libere o acesso nas configurações do seu navegador para usar a transmissão de áudio.')
      }

      voiceRoom = supabase.channel(`voice:${currentVoiceChannel.id}`, {
        config: { presence: { key: user?.id || 'anon' }, broadcast: { self: false, ack: false } }
      });
      voiceRoomRef.current = voiceRoom;

      voiceRoom
        // 1. Escutar Oferta de Áudio
        .on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
          if (payload.target !== user?.id) return;
          const pc = getOrCreatePeerConnection(payload.sender, voiceRoom);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          voiceRoom.send({
            type: 'broadcast',
            event: 'answer',
            payload: { target: payload.sender, answer, sender: user?.id }
          });
        })
        // 2. Escutar Resposta de Áudio
        .on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
          if (payload.target !== user?.id) return;
          const pc = peerConnections.current[payload.sender];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          }
        })
        // 3. Escutar Candidatos ICE
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }: any) => {
          if (payload.target !== user?.id) return;
          const pc = peerConnections.current[payload.sender];
          if (pc && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        })
        // 4. Sincronização do Presence
        .on('presence', { event: 'sync' }, () => {
          const state = voiceRoom.presenceState();
          // Usa DIRETAMENTE o username que cada usuário rastreou — sem substituição
          const usersInRoom = (Object.values(state).flat() as any[]).map((u: any) => ({
            ...u,
            // O username já veio do getActiveUsername de cada usuário — confia nele
          }))
          setVoiceUsers(prev => ({ ...prev, [currentVoiceChannel.id]: usersInRoom }));
          
          usersInRoom.forEach(async (remoteUser: any) => {
            if (remoteUser.user_id === user?.id) return;
            if (!peerConnections.current[remoteUser.user_id]) {
              const pc = getOrCreatePeerConnection(remoteUser.user_id, voiceRoom);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              voiceRoom.send({
                type: 'broadcast',
                event: 'offer',
                payload: { target: remoteUser.user_id, offer, sender: user?.id }
              });
            }
          });
        });

      // Agora sim dispara o subscribe após amarrar todos os eventos
      voiceRoom.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          const activeUsername = await getActiveUsername()
          await voiceRoom.track({ 
            user_id: user?.id, 
            username: activeUsername, 
            isMuted: isMutedRef.current, 
            isSpeaking: false 
          });
        }
      });
    }

    setupVoiceChannel()

    return () => {
      if (voiceRoom) {
        supabase.removeChannel(voiceRoom)
      }
      voiceRoomRef.current = null
      if (trackTimerRef.current) {
        clearTimeout(trackTimerRef.current)
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close()
      }
      
      localStream.current?.getTracks().forEach(track => track.stop())
      localStream.current = null

      Object.keys(peerConnections.current).forEach(key => {
        peerConnections.current[key].close()
        const el = document.getElementById(`audio-${key}`)
        if (el) el.remove()
      })
      peerConnections.current = {}

      setVoiceUsers(prev => {
        const currentList = prev[currentVoiceChannel.id] || []
        const filteredList = currentList.filter((u: any) => u.user_id !== user?.id)
        return {
          ...prev,
          [currentVoiceChannel.id]: filteredList
        }
      })
      setIsSpeaking(false)
    }
  }, [currentVoiceChannel])

  // Envia atualização de fala/mute para o Supabase Presence em tempo real de forma debounced
  useEffect(() => {
    if (!currentVoiceChannel) return

    if (trackTimerRef.current) {
      clearTimeout(trackTimerRef.current)
    }

    trackTimerRef.current = setTimeout(async () => {
      if (currentVoiceChannel && voiceRoomRef.current) {
        try {
          const activeUsername = await getActiveUsername()
          await voiceRoomRef.current.track({
            user_id: user?.id,
            username: activeUsername,
            isMuted: isMuted,
            isSpeaking: isSpeaking
          })
        } catch (err) {
          console.error("Erro ao trackear Presence:", err)
        }
      }
    }, 400) // 400ms debounce
  }, [isSpeaking, isMuted, currentVoiceChannel])

  // Canal de Presence Global para Membros Online
  useEffect(() => {
    if (!user) return

    const globalChannel = supabase.channel('global-online')

    globalChannel
      .on('presence', { event: 'sync' }, () => {
        const state = globalChannel.presenceState()
        const users = Object.values(state).flat() as any[]
        // Popula o cache de usernames com todos os usuários online
        users.forEach((u: any) => {
          if (u.user_id && u.username) cacheUsername(u.user_id, u.username)
        })
        // remove duplicatas por user_id
        const unique = Array.from(new Map(users.map(u => [u.user_id, u])).values())
        setGlobalOnlineUsers(unique)
      })

    globalChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        const activeUsername = await getActiveUsername()
        await globalChannel.track({
          user_id: user?.id,
          username: activeUsername,
          role: myRole,
          status_type: userStatus.type,
          status_text: userStatus.text
        })
      }
    })

    return () => {
      supabase.removeChannel(globalChannel)
    }
  }, [user, username, userStatus, myRole])

  // Escuta Presence de todos os canais de voz para listar na barra lateral
  useEffect(() => {
    if (channels.length === 0) return

    const voiceChannels = channels.filter(c => isVoiceChannel(c))
    const subs: any[] = []

    voiceChannels.forEach(chan => {
      // Se for o canal atual conectado, a outra lógica já lida com ele
      if (currentVoiceChannel && chan.id === currentVoiceChannel.id) return

      const room = supabase.channel(`voice:${chan.id}`)
      room
        .on('presence', { event: 'sync' }, () => {
          const state = room.presenceState()
          // Usa diretamente o username rastreado por cada usuário
          const usersInRoom = (Object.values(state).flat() as any[])
          setVoiceUsers(prev => ({ ...prev, [chan.id]: usersInRoom }))
        })
        .subscribe()
      
      subs.push(room)
    })

    return () => {
      subs.forEach(room => supabase.removeChannel(room))
    }
  }, [channels, currentVoiceChannel])

  // Fetch channels from database
  const fetchChannels = async (setInitialChannel = false) => {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .order('position', { ascending: true })

    if (error) {
      console.error('Error fetching channels:', error.message)
      return
    }

    if (data) {
      setChannels(data)
      if (setInitialChannel && data.length > 0) {
        const primeiroCanal = data.find((c: any) => !isVoiceChannel(c)) || data[0]
        setCurrentTextChannel(primeiroCanal)
      }
    }
  }

  // Lógica de inserção de canais no banco
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim()) return

    const gamingRoom = channels.find(c => c.name === 'Gaming Room')

    const { error } = await supabase
      .from('channels')
      .insert({
        name: newChannelName.trim(),
        parent_id: newChannelType === 'voice' ? (gamingRoom?.id || null) : null,
        position: channels.length + 1
      })

    if (error) {
      console.error('Erro ao criar canal:', error.message)
      alert('Erro ao criar canal: ' + error.message)
    } else {
      setIsModalOpen(false)
      setNewChannelName('')
      setNewChannelType('text')
      fetchChannels()
    }
  }

  useEffect(() => {
    // Uma única query — busca canais e define o canal inicial
    fetchChannels(true)

    // Pré-carrega o próprio username no cache
    if (user?.id && username) {
      usernameCacheRef.current[user.id] = username
      setUsernameCache(prev => ({ ...prev, [user.id]: username }))
    }

    // Realtime channel list subscription
    const channelsSub = supabase
      .channel('realtime:channels')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels' },
        () => { fetchChannels(false) }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channelsSub)
    }
  }, [])

  // Fetch messages and subscribe to Realtime
  useEffect(() => {
    if (!currentTextChannel) return

    setMessages([]) // Limpa o estado de mensagens ao trocar de canal

    const fetchMessages = async () => {
      if (!currentTextChannel) return
      // Busca mensagens sem join com profiles — username vem do cache/presence
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, content, created_at, user_id')
        .eq('channel_id', currentTextChannel.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error.message)
        return
      }

      if (data) {
        setMessages(data)
      }
    }

    fetchMessages()

    // Realtime channel subscription
    const channelSub = supabase
      .channel(`chat:${currentTextChannel.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${currentTextChannel?.id}`,
        },
        async (payload) => {
          // Username vem do cache populado pelo presence — sem query extra
          const newMessage = {
            ...payload.new,
            profiles: { username: usernameCache[payload.new.user_id] || usernameCacheRef.current[payload.new.user_id] || 'Membro' }
          }
          setMessages((prev) => [...prev, newMessage])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages'
        },
        (payload) => {
          setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channelSub)
    }
  }, [currentTextChannel?.id])

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || !currentTextChannel) return

    // Busca o usuário logado de forma direta e segura
    const { data: { session: activeSession } } = await supabase.auth.getSession()
    if (!activeSession?.user) return

    const { error } = await supabase.from('chat_messages').insert({
      channel_id: currentTextChannel.id,
      user_id: activeSession.user.id,
      content: inputVal.trim()
    })

    if (error) {
      console.error('Erro ao enviar mensagem:', error.message)
    } else {
      setInputVal('') // Limpa o campo apenas se der sucesso
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId)

      if (error) {
        console.error('Erro ao deletar mensagem:', error.message)
      }
    } catch (err) {
      console.error('Erro ao deletar mensagem:', err)
    }
  }



  const handleSignOut = async () => {
    await leaveVoiceChannel()
    await supabase.auth.signOut()
  }

  // Ordene os membros online para que Donos, Moderadores e Membros fiquem em ordem
  const sortedOnlineUsers = [...globalOnlineUsers].sort((a, b) => {
    const roleOrder: Record<string, number> = { owner: 1, moderator: 2, member: 3 }
    const orderA = roleOrder[a.role] || 3
    const orderB = roleOrder[b.role] || 3
    return orderA - orderB
  })

  return (
    <div className="h-screen flex bg-zinc-950 text-zinc-100 font-sans overflow-hidden relative">
      {/* Overlay (Fundo escuro compartilhado) */}
      {(isLeftSidebarOpen || isRightSidebarOpen) && (
        <div
          onClick={() => {
            setIsLeftSidebarOpen(false)
            setIsRightSidebarOpen(false)
          }}
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
        />
      )}
      
      {/* Sidebar Esquerda (Canais) */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between select-none transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
        isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div>
          {/* Header Servidor */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-purple-600/10">
                ZR
              </div>
              <span className="font-bold text-sm tracking-wide text-zinc-100">ZeeRAID Oficial</span>
            </div>
            <Settings className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer transition-colors" />
          </div>

          {/* Lista de Canais */}
          <div className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-140px)]">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Canais & Salas</span>
              <Plus onClick={() => setIsModalOpen(true)} className="w-3.5 h-3.5 text-zinc-500 hover:text-white cursor-pointer transition-colors" />
            </div>

            {channels.length === 0 && (
              <span className="text-zinc-500 text-xs px-4">Carregando canais...</span>
            )}

            <div className="space-y-1">
              {channels.filter(c => !c.parent_id).map(parent => {
                const subChannels = channels.filter(c => c.parent_id === parent.id)
                const isGroup = subChannels.length > 0
                const isCollapsed = collapsedGroups[parent.id]
                const isActive = currentTextChannel?.id === parent.id

                return (
                  <div key={parent.id} className="space-y-0.5">
                    {/* Canal Principal / Grupo */}
                    <div
                      onClick={() => {
                        if (isGroup) {
                          toggleGroup(parent.id)
                        } else {
                          if (isVoiceChannel(parent)) {
                            joinVoiceChannel(parent)
                            setCurrentTextChannel(parent)
                          } else {
                            setCurrentTextChannel(parent)
                          }
                        }
                      }}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {isGroup ? (
                          isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          isVoiceChannel(parent) ? <Volume2 className="w-4 h-4 text-zinc-500" /> : <Hash className="w-4 h-4 text-zinc-500" />
                        )}
                        <span>{parent.name}</span>
                      </div>
                    </div>

                    {/* Usuários na voz (Sem subcanais) */}
                    {!isGroup && isVoiceChannel(parent) && Array.from(
                       new Map((voiceUsers[parent.id] || []).filter((u: any) => u && u.user_id).map((u: any) => [u.user_id, u])).values()
                     ).map((vUser: any) => {
                      // username vem direto do Presence rastreado pelo próprio usuário
                      const displayName = vUser.username || 'Membro'

                      return (
                        <div key={vUser.user_id} className={`pl-10 text-xs flex items-center gap-1 py-0.5 transition-all ${
                          vUser.isSpeaking 
                            ? 'text-emerald-300 font-bold drop-shadow-[0_0_6px_#34d399]' 
                            : 'text-zinc-400 font-medium'
                        }`}>
                          <span>{vUser.isMuted ? '🔇' : (vUser.isSpeaking ? '🔊' : '🎤')}</span>
                          <span>{displayName}</span>
                          {vUser.isSpeaking && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping ml-1"></span>}
                        </div>
                      );
                    })}

                    {/* Subcanais */}
                    {isGroup && !isCollapsed && (
                      <div className="pl-6 space-y-0.5 border-l border-zinc-800/80 ml-4 mt-0.5">
                        {subChannels.map(sub => {
                          const isSubActive = currentTextChannel?.id === sub.id
                          return (
                            <div key={sub.id} className="space-y-0.5">
                              <div
                                onClick={() => {
                                  if (isVoiceChannel(sub)) {
                                    joinVoiceChannel(sub)
                                    setCurrentTextChannel(sub)
                                  } else {
                                    setCurrentTextChannel(sub)
                                  }
                                }}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-medium transition-colors ${
                                  isSubActive
                                    ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20'
                                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                                }`}
                              >
                                {isVoiceChannel(sub) ? <Volume2 className="w-3.5 h-3.5 text-zinc-500" /> : <Hash className="w-3.5 h-3.5 text-zinc-500" />}
                                <span>{sub.name}</span>
                              </div>

                              {/* Usuários na voz (Subcanais) */}
                              {isVoiceChannel(sub) && Array.from(
                                 new Map((voiceUsers[sub.id] || []).filter((u: any) => u && u.user_id).map((u: any) => [u.user_id, u])).values()
                               ).map((vUser: any) => {
                                // username vem direto do Presence rastreado pelo próprio usuário
                                const displayName = vUser.username || 'Membro'

                                return (
                                  <div key={vUser.user_id} className={`pl-10 text-xs flex items-center gap-1 py-0.5 transition-all ${
                                    vUser.isSpeaking 
                                      ? 'text-emerald-300 font-bold drop-shadow-[0_0_6px_#34d399]' 
                                      : 'text-zinc-400 font-medium'
                                  }`}>
                                     <span>{vUser.isMuted ? '🔇' : (vUser.isSpeaking ? '🔊' : '🎤')}</span>
                                     <span>{displayName}</span>
                                     {vUser.isSpeaking && <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping ml-1"></span>}
                                  </div>
                                );
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Rodapé Usuário */}
        <div className="relative p-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
          {isStatusMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-16 left-4 bg-zinc-900 border border-zinc-800 rounded-lg p-2 shadow-xl z-50 flex flex-col gap-1 w-48 text-xs"
            >
              <button
                onClick={() => {
                  setUserStatus({ type: 'online', text: 'Conectado' })
                  setIsStatusMenuOpen(false)
                }}
                className="flex items-center gap-2 p-1.5 hover:bg-zinc-800 rounded text-left w-full text-zinc-200 transition-colors"
              >
                <span>🟢</span>
                <span>Online</span>
              </button>
              <button
                onClick={() => {
                  setUserStatus({ type: 'ausente', text: 'Ausente' })
                  setIsStatusMenuOpen(false)
                }}
                className="flex items-center gap-2 p-1.5 hover:bg-zinc-800 rounded text-left w-full text-zinc-200 transition-colors"
              >
                <span>🟡</span>
                <span>Ausente</span>
              </button>
              <button
                onClick={() => {
                  setUserStatus({ type: 'ocupado', text: 'Não Perturbe' })
                  setIsStatusMenuOpen(false)
                }}
                className="flex items-center gap-2 p-1.5 hover:bg-zinc-800 rounded text-left w-full text-zinc-200 transition-colors"
              >
                <span>🔴</span>
                <span>Ocupado</span>
              </button>
              
              <div className="border-t border-zinc-800 my-1 pt-1.5 px-1.5">
                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider block mb-1">Status Customizado</span>
                <input
                  type="text"
                  placeholder="O que você está fazendo?"
                  defaultValue={userStatus.text}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim()
                      setUserStatus({ type: userStatus.type, text: val || 'Conectado' })
                      setIsStatusMenuOpen(false)
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          )}

          <div
            onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-90"
          >
            <div className="relative">
              <div className="w-9 h-9 bg-purple-600/20 rounded-full flex items-center justify-center font-bold text-xs text-purple-400 border border-purple-500/25">
                {username.substring(0, 2).toUpperCase()}
              </div>
              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${userStatus.type === 'ausente' ? 'bg-amber-500' : userStatus.type === 'ocupado' ? 'bg-red-500' : 'bg-emerald-500'} border-2 border-zinc-900 rounded-full`}></span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-zinc-100 truncate">{username}</span>
              {currentVoiceChannel ? (
                <span className="text-[10px] text-emerald-400 font-bold tracking-wide truncate">
                  🟢 No circuito: {currentVoiceChannel.name}
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500 font-medium tracking-wide">{userStatus.text}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 text-zinc-400">
            <button
              onClick={toggleMute}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-zinc-100 cursor-pointer transition-colors"
              title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            >
              {isMuted ? <MicOff className="w-4 h-4 text-red-500" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleDeafen}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-zinc-100 cursor-pointer transition-colors"
              title={isDeafened ? 'Desmutar Áudio' : 'Mutar Áudio Geral'}
            >
              <Headphones className={`w-4 h-4 ${isDeafened ? 'text-red-500' : ''}`} />
            </button>
            {currentVoiceChannel && (
              <button
                onClick={handleDisconnectVoice}
                className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-red-400 cursor-pointer transition-colors"
                title="Desconectar do Canal de Voz"
              >
                <LogOut className="w-4 h-4 text-red-400" />
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="p-1.5 hover:bg-zinc-800 rounded-lg hover:text-red-500 cursor-pointer transition-colors"
              title="Sair da Conta"
            >
              <LogOut className="w-4 h-4 opacity-50 hover:opacity-100" />
            </button>
          </div>
        </div>
      </aside>

      {/* Área Central (Chat) */}
      <main className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
        {/* Cabeçalho Canal Ativo */}
        <header className="h-14 border-b border-zinc-800 px-4 md:px-6 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              className="p-1 text-zinc-400 hover:text-white md:hidden cursor-pointer mr-1"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-zinc-100">
              {currentTextChannel ? `# ${currentTextChannel.name}` : 'Carregando...'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-zinc-400 text-sm">
            <Compass className="w-4 h-4 hover:text-white cursor-pointer transition-colors" />
            <MessageSquare className="w-4 h-4 hover:text-white cursor-pointer transition-colors" />
            <button
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className="p-1 text-zinc-400 hover:text-white md:hidden cursor-pointer"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Mensagens */}
        <section className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map(msg => {
            const senderName = msg.profiles?.username 
              || usernameCache[msg.user_id]
              || (msg.user_id === session.user.id ? username : 'Membro')
            const formattedTime = new Date(msg.created_at || msg.timestamp).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit'
            })

            const isSystem = msg.is_system || msg.profiles?.username === 'Sistema' || msg.profiles?.username === 'ZeeRAID' || msg.content?.startsWith('[SYSTEM]')
            const cleanContent = msg.content?.startsWith('[SYSTEM] ') ? msg.content.substring(9) : msg.content

            if (isSystem) {
              return (
                <div key={msg.id} className="w-full text-center my-2">
                  <span className="text-zinc-500 text-xs italic">
                    {cleanContent}
                  </span>
                </div>
              )
            }

            return (
              <div key={msg.id} className="flex flex-col items-start group relative w-full">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-bold text-zinc-400">{senderName}</span>
                  <span className="text-[10px] text-zinc-600">{formattedTime}</span>
                </div>
                <div className="relative max-w-lg px-4 py-2.5 bg-purple-600 text-white rounded-2xl rounded-tl-none text-sm leading-relaxed pr-8">
                  <span>{cleanContent}</span>
                  {(msg.user_id === user?.id || myRole === 'owner') && (
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="absolute top-2 right-2 text-purple-200 hover:text-white hidden group-hover:block transition-colors cursor-pointer"
                      title="Apagar mensagem"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </section>

        {/* Chat Input */}
        <footer className="p-4 bg-zinc-950 border-t border-zinc-800">
          <form onSubmit={sendMessage} className="relative flex items-center">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={"Enviar mensagem para #" + (currentTextChannel?.name || '')}
              disabled={!currentTextChannel}
              className="w-full pl-4 pr-12 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-purple-500 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none transition-colors text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!currentTextChannel}
              className="absolute right-3 p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg cursor-pointer transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </footer>
      </main>

      {/* Sidebar Direita (Membros) */}
      <aside className={`fixed inset-y-0 right-0 z-40 w-60 bg-zinc-900 border-l border-zinc-800 p-4 select-none flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
        isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="flex items-center gap-2 text-zinc-400 font-semibold text-xs tracking-wider uppercase mb-4">
          <Users className="w-4 h-4" />
          <span>Online — {sortedOnlineUsers.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {sortedOnlineUsers.map((u, idx) => {
            const dispName = u.username || 'Membro'
            let nameColor = 'text-zinc-200'
            let roleText = 'Membro'
            
            if (u.role === 'owner') {
              nameColor = 'text-amber-400 font-bold'
              roleText = '👑 Dono'
            } else if (u.role === 'moderator') {
              nameColor = 'text-cyan-400 font-semibold'
              roleText = '🛡️ Mod'
            }

            let statusColor = 'bg-emerald-500'
            if (u.status_type === 'ausente') statusColor = 'bg-amber-500'
            if (u.status_type === 'ocupado') statusColor = 'bg-red-500'

            return (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/40 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative">
                    <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center font-bold text-xs text-zinc-400 border border-zinc-700/50">
                      {dispName.substring(0, 2).toUpperCase()}
                    </div>
                    <span className={`absolute bottom-0 right-0 w-2 h-2 ${statusColor} border-2 border-zinc-900 rounded-full`}></span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-xs truncate ${nameColor}`}>{dispName}</span>
                    <span className="text-[9px] text-zinc-500 font-medium tracking-wide truncate max-w-[140px]" title={`${roleText}${u.status_text ? ` - ${u.status_text}` : ''}`}>
                      {roleText}
                      {u.status_text && (
                        <span className="text-[9px] text-zinc-400 font-normal">
                          {` - ${u.status_text}`}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Modal de Criação de Canais */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-lg text-zinc-100">Criar Novo Canal</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 text-sm font-semibold transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Nome do Canal
                </label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Ex: League of Legends 2"
                  autoFocus
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none transition-colors text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Tipo de Canal
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewChannelType('text')}
                    className={`px-4 py-3 rounded-xl border flex flex-col items-center gap-1 transition-all text-xs font-semibold ${
                      newChannelType === 'text'
                        ? 'bg-purple-600/10 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/5'
                        : 'border-zinc-800 hover:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span>💬</span>
                    <span>Canal de Texto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewChannelType('voice')}
                    className={`px-4 py-3 rounded-xl border flex flex-col items-center gap-1 transition-all text-xs font-semibold ${
                      newChannelType === 'voice'
                        ? 'bg-purple-600/10 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/5'
                        : 'border-zinc-800 hover:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <span>🔊</span>
                    <span>Canal de Voz</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newChannelName.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Criar Canal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
