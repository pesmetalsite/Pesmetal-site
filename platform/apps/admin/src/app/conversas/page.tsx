'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/AppShell'
import { api, getToken, getUser, API_URL } from '@/lib/api'
import { MessageSquarePlus, Pencil, RefreshCw, Search, Send, FileText, Paperclip } from 'lucide-react'

const PAGE = 50

const displayName = (conversation: any) =>
  conversation?.custom_name || conversation?.contact_name || conversation?.contact_phone || 'Conversa'

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'human', label: 'Em atendimento' },
  { id: 'active', label: 'Automação' },
  { id: 'mine', label: 'Minhas' },
]

const STATUS_LABEL: Record<string, string> = {
  active: 'Automação ativa',
  paused: 'Pausada',
  human: 'Atendimento humano',
  closed: 'Encerrada',
}

function byTime(a: any, b: any) {
  return (a.created_at || '').localeCompare(b.created_at || '') ||
    String(a.id || '').localeCompare(String(b.id || ''))
}

function hm(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function msgAuthor(m: any) {
  if (m.direction !== 'outgoing') return 'Cliente'
  if (m.sent_by_user_id) return 'Você'
  return '🤖 Automação'
}

/** Converte path relativo de mídia em URL absoluta (mídia fica no backend). */
function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/uploads/')) return `${API_URL}${url}`
  return url
}
}

function resolveActive(prev: any, list: any[], openIdRef: { current: string | null }): any {
  if (prev && prev._fromLink) return prev
  if (prev && list.some((c: any) => c.id === prev.id)) return prev
  if (openIdRef.current) {
    const id = openIdRef.current
    const found = list.find((c: any) => c.id === id)
    if (found) { openIdRef.current = null; return found }
    openIdRef.current = null
    return { id, contact_name: 'Conversa', contact_phone: '', _fromLink: true }
  }
  const un = list.find((c: any) => c.unread_count > 0)
  return un || list[0] || null
}

export default function ConversasPage() {
  const router = useRouter()
  // --- lista ------------------------------------------------------------
  const [convs, setConvs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // --- chat -------------------------------------------------------------
  const [active, setActive] = useState<any>(null)
  const [msgs, setMsgs] = useState<any[]>([])
  const [olderBase, setOlderBase] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [reply, setReply] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<any>(null)  // {url, mime, file_name, media_type}
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- utilidades ---------------------------------------------------------
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [showNewConv, setShowNewConv] = useState(false)
  const [newConvForm, setNewConvForm] = useState({ phone: '', name: '' })
  const [newConvError, setNewConvError] = useState('')
  const [creatingConv, setCreatingConv] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editNameVal, setEditNameVal] = useState('')

  const chatRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const busyRef = useRef(false)
  const msgsRef = useRef<any[]>([])
  const convsRef = useRef<any[]>([])
  const olderBaseRef = useRef(0)
  const openIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const loadedOnceRef = useRef(false)
  const filterRef = useRef(filter)
  const searchRef = useRef(search)
  const loadMoreRef = useRef<() => void>(() => {})

  useEffect(() => { msgsRef.current = msgs }, [msgs])
  useEffect(() => { convsRef.current = convs }, [convs])
  useEffect(() => { olderBaseRef.current = olderBase }, [olderBase])
  useEffect(() => { filterRef.current = filter }, [filter])
  useEffect(() => { searchRef.current = search }, [search])
  useEffect(() => { loadMoreRef.current = loadMore })

  function commitMsgs(merged: any[]) {
    msgsRef.current = merged
    setMsgs(merged)
  }

  function loadListUrl(offset: number) {
    const f = filterRef.current
    const s = searchRef.current
    const params = new URLSearchParams()
    params.set('limit', String(PAGE))
    params.set('offset', String(offset))
    if (s.trim()) params.set('search', s.trim())
    if (f === 'unread') params.set('unread', '1')
    else if (f === 'human') params.set('status', 'human')
    else if (f === 'active') params.set('status', 'active')
    else if (f === 'mine' && userIdRef.current) params.set('assigned_user_id', userIdRef.current)
    return `/whatsapp/conversations?${params.toString()}`
  }

  function scrollBottom() {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }
  function isPinned() {
    const el = chatRef.current
    return !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  // leitura do deep-link ?conversation=<id>
  useEffect(() => {
    const u = getUser()
    userIdRef.current = u?.id || null
    try {
      const id = new URLSearchParams(window.location.search).get('conversation')
      if (id) openIdRef.current = id
    } catch { /* noop */ }
  }, [])

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // carregar primeira página sempre que filtro/busca muda
  useEffect(() => {
    let alive = true
    const run = async () => {
      busyRef.current = true
      setLoadingList(true)
      try {
        const r = await api(loadListUrl(0), {}, getToken()!)
        if (!alive) return
        const list = r.conversations || []
        setConvs(list)
        setTotal(r.total || 0)
        setHasMore(!!r.has_more)
        setActive((prev: any) => resolveActive(prev, list, openIdRef))
      } catch { /* mantém estado */ }
      finally {
        if (alive) {
          busyRef.current = false
          loadedOnceRef.current = true
          setLoadingList(false)
        }
      }
    }
    run()
    return () => { alive = false }
  }, [filter, search])

  // deep-link fora da 1ª página: busca a conversa real por id
  useEffect(() => {
    if (!active?._fromLink || !active?.id) return
    api(`/whatsapp/conversations/${active.id}`, {}, getToken()!)
      .then((r) => {
        const conv = r.conversation
        if (!conv) return
        setConvs((prev: any[]) => prev.some((c: any) => c.id === conv.id) ? prev : [conv, ...prev])
        setActive((prev: any) => prev?._fromLink && prev.id === conv.id ? { ...conv } : prev)
      })
      .catch(() => { /* noop */ })
  }, [active?._fromLink, active?.id])

  // paginação incremental da lista (sentinel)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loadingList) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMoreRef.current()
    }, { root: listRef.current, rootMargin: '140px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadingList, filter, search])

  // polling da lista (reordena por last_message_at)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (!loadedOnceRef.current || document.hidden) return
      if (convsRef.current.length > PAGE) return
      if (busyRef.current) return
      try {
        const r = await api(loadListUrl(0), {}, getToken()!)
        if (!alive) return
        const list = r.conversations || []
        setConvs(list)
        setTotal(r.total || 0)
        setHasMore(!!r.has_more)
        setActive((prev: any) => resolveActive(prev, list, openIdRef))
      } catch { /* noop */ }
    }
    const iv = setInterval(tick, 8000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  // chat: seed + polling de mensagens da conversa ativa
  useEffect(() => {
    const convId = active?.id
    if (!convId) return
    let alive = true
    setMsgs([])
    setOlderBase(0)
    const el = chatRef.current
    if (el) el.scrollTop = 0

    const mergeLatest = async () => {
      const r = await api(`/whatsapp/conversations/${convId}/messages?limit=${PAGE}&offset=0&oldest_first=0`, {}, getToken()!)
      if (!alive) return
      setOlderBase(Math.max(0, (r.total || 0) - PAGE))
      const asc = (r.messages || []).slice().reverse()
      const map = new Map(msgsRef.current.map((m: any) => [m.id, m]))
      asc.forEach((m: any) => map.set(m.id, m))
      commitMsgs(Array.from(map.values()).sort(byTime))
      return asc
    }

    mergeLatest().then(() => {
      setConvs((prev: any[]) => prev.map((c: any) => c.id === convId ? { ...c, unread_count: 0 } : c))
      requestAnimationFrame(scrollBottom)
    }).catch(() => {})

    const iv = setInterval(async () => {
      if (document.hidden || !alive) return
      try {
        const wasPinned = isPinned()
        const beforeLen = msgsRef.current.length
        await mergeLatest()
        if (alive && msgsRef.current.length !== beforeLen && wasPinned) requestAnimationFrame(scrollBottom)
      } catch { /* noop */ }
    }, 5000)

    return () => { alive = false; clearInterval(iv) }
  }, [active?.id])

  async function loadMore() {
    if (busyRef.current || !hasMore) return
    busyRef.current = true
    setLoadingMore(true)
    try {
      const off = convsRef.current.length
      const r = await api(loadListUrl(off), {}, getToken()!)
      const list = convsRef.current.concat(r.conversations || [])
      setConvs(list)
      setTotal(r.total || 0)
      setHasMore(!!r.has_more)
    } catch { /* noop */ }
    finally {
      busyRef.current = false
      setLoadingMore(false)
    }
  }

  async function loadOlder() {
    const convId = active?.id
    const el = chatRef.current
    const base = olderBaseRef.current
    if (!convId || base <= 0 || loadingOlder || busyRef.current) return
    busyRef.current = true
    setLoadingOlder(true)
    const prevH = el ? el.scrollHeight : 0
    const prevT = el ? el.scrollTop : 0
    const off = Math.max(0, base - PAGE)
    try {
      const r = await api(`/whatsapp/conversations/${convId}/messages?limit=${PAGE}&offset=${off}&oldest_first=1`, {}, getToken()!)
      const older = r.messages || []
      const map = new Map(msgsRef.current.map((m: any) => [m.id, m]))
      older.forEach((m: any) => map.set(m.id, m))
      commitMsgs(Array.from(map.values()).sort(byTime))
      setOlderBase(Math.max(0, off))
    } catch { /* noop */ }
    finally {
      busyRef.current = false
      setLoadingOlder(false)
      requestAnimationFrame(() => {
        if (el) el.scrollTop = prevT + (el.scrollHeight - prevH)
      })
    }
  }

  function onChatScroll() {
    const el = chatRef.current
    if (!el || loadingOlder) return
    if (el.scrollTop < 60 && olderBaseRef.current > 0) loadOlder()
  }

  function openConversation(c: any) {
    setConvs((prev: any[]) => prev.map((x: any) => x.id === c.id ? { ...x, unread_count: 0 } : x))
    setActive(c)
  }

  async function send() {
    const text = reply.trim()
    const hasMedia = !!pendingAttachment
    if ((!text && !hasMedia) || !active?.id || sending) return
    setSending(true)

    // Gera client_id para reconciliação
    const client_id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // === ENVIO OTIMISTA: cria mensagem local IMEDIATAMENTE ===
    const optimisticMsg = {
      id: client_id,
      client_id,
      conversation_id: active.id,
      direction: 'outgoing',
      type: hasMedia ? pendingAttachment.media_type : 'text',
      content: text || '',
      media_url: hasMedia ? pendingAttachment.url : null,
      media_mime: hasMedia ? pendingAttachment.mime : null,
      file_name: hasMedia ? pendingAttachment.file_name : null,
      status: 'pending',
      sent_by_user_id: getUser()?.id,
      created_at: new Date().toISOString(),
      _optimistic: true,
    }
    const wasPinned = isPinned()
    commitMsgs([...msgsRef.current, optimisticMsg])
    setReply('')
    setPendingAttachment(null)
    requestAnimationFrame(scrollBottom)

    try {
      const body: any = { client_id }
      if (text) body.text = text
      if (hasMedia) {
        body.media_url = pendingAttachment.url
        body.media_mime = pendingAttachment.mime
        body.media_type = pendingAttachment.media_type
        body.file_name = pendingAttachment.file_name
      }
      const res: any = await api(`/whatsapp/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify(body) }, getToken()!)

      // === Reconciliação: substitui mensagem otimista pela real ===
      const realId = res.id || res.client_id
      const merged = msgsRef.current.map((m: any) =>
        m.client_id === client_id ? { ...m, id: realId, status: 'sent', _optimistic: false } : m
      )
      // Se a resposta veio com deduplicated (já existia), apenas atualiza
      if (res.deduplicated) {
        commitMsgs(merged)
      } else {
        commitMsgs(merged)
      }

      const now = new Date().toISOString()
      setConvs((prev: any[]) => {
        const others = prev.filter((c: any) => c.id !== active.id)
        return [{ ...active, last_message_at: now, unread_count: 0 }, ...others]
      })
      setActive((a: any) => a ? { ...a, last_message_at: now, unread_count: 0 } : a)
    } catch (e: any) {
      // Marca como failed (não some)
      const merged = msgsRef.current.map((m: any) =>
        m.client_id === client_id ? { ...m, status: 'failed', error: e.message } : m
      )
      commitMsgs(merged)
    } finally {
      setSending(false)
      requestAnimationFrame(scrollBottom)
    }
  }

  /** Reenvia mensagem que falhou. */
  async function retryMessage(msg: any) {
    if (!msg.client_id || !active?.id) return
    // Marca como pending de novo
    const merged = msgsRef.current.map((m: any) =>
      m.client_id === msg.client_id ? { ...m, status: 'pending', error: undefined } : m
    )
    commitMsgs(merged)
    try {
      const body: any = { client_id: msg.client_id }
      if (msg.content) body.text = msg.content
      if (msg.media_url) {
        body.media_url = msg.media_url
        body.media_mime = msg.media_mime
        body.media_type = msg.type
        body.file_name = msg.file_name
      }
      const res: any = await api(`/whatsapp/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify(body) }, getToken()!)
      const realId = res.id || res.client_id
      const merged2 = msgsRef.current.map((m: any) =>
        m.client_id === msg.client_id ? { ...m, id: realId, status: 'sent', error: undefined } : m
      )
      commitMsgs(merged2)
    } catch (e: any) {
      const merged = msgsRef.current.map((m: any) =>
        m.client_id === msg.client_id ? { ...m, status: 'failed', error: e.message } : m
      )
      commitMsgs(merged)
    }
  }

  async function handleFileAttach(file: File) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res: any = await fetch(`${API_URL}/upload/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro no upload')
      const mt = (data.mime || '').toLowerCase()
      let media_type: 'image' | 'audio' | 'video' | 'document' = 'document'
      if (mt.startsWith('image/')) media_type = 'image'
      else if (mt.startsWith('audio/')) media_type = 'audio'
      else if (mt.startsWith('video/')) media_type = 'video'
      setPendingAttachment({ url: data.url, mime: data.mime, file_name: data.filename, media_type })
    } catch (e: any) {
      alert(e.message || 'Erro no upload')
    }
  }

  async function takeover() {
    if (!active?.id) return
    try {
      await api(`/whatsapp/conversations/${active.id}/takeover`, { method: 'POST' }, getToken()!)
      const patch = { status: 'human', automation_status: 'transferred' }
      setConvs((prev: any[]) => prev.map((c: any) => c.id === active.id ? { ...c, ...patch } : c))
      setActive((a: any) => a ? { ...a, ...patch } : a)
    } catch (e: any) {
      alert(e.message || 'Falha ao assumir')
    }
  }

  async function finalizar() {
    if (!active?.id) return
    if (!confirm('Finalizar atendimento? Uma mensagem de encerramento será enviada.')) return
    try {
      await api(`/whatsapp/conversations/${active.id}/close`, { method: 'POST', body: JSON.stringify({}) }, getToken()!)
      const patch = { status: 'active', automation_status: 'idle' }
      setConvs((prev: any[]) => prev.map((c: any) => c.id === active.id ? { ...c, ...patch } : c))
      setActive((a: any) => a ? { ...a, ...patch } : a)
    } catch (e: any) { alert(e.message) }
  }

  async function createNewConv() {
    const phone = newConvForm.phone.replace(/\D/g, '')
    if (phone.length < 8) { setNewConvError('Número inválido'); return }
    setCreatingConv(true); setNewConvError('')
    try {
      const r = await api('/whatsapp/conversations', { method: 'POST', body: JSON.stringify({ phone, name: newConvForm.name || undefined }) }, getToken()!) as any
      setShowNewConv(false); setNewConvForm({ phone: '', name: '' })
      loadedOnceRef.current = false; setFilter('all'); setSearchInput(''); setSearch('')
      setTimeout(() => { if (r?.conversation?.id) { setActive(r.conversation); openIdRef.current = r.conversation.id } }, 500)
    } catch (e: any) { setNewConvError(e.message) }
    finally { setCreatingConv(false) }
  }

  async function saveCustomName() {
    if (!active) return
    try {
      await api(`/whatsapp/conversations/${active.id}`, { method: 'PATCH', body: JSON.stringify({ custom_name: editNameVal || null }) }, getToken()!)
      setActive((a: any) => ({ ...a, custom_name: editNameVal || null }))
      setConvs((prev) => prev.map((c) => c.id === active.id ? { ...c, custom_name: editNameVal || null } : c))
      setEditingName(false)
    } catch (e: any) { alert(e.message) }
  }

  async function syncHistory() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res: any = await api('/whatsapp/conversations/sync', { method: 'POST', body: JSON.stringify({}) }, getToken()!)
      setSyncMsg(res.message || 'Sincronização iniciada em segundo plano')
      setTimeout(() => { loadedOnceRef.current = false; setFilter('all'); setSearchInput(''); setSearch(''); setLoadingList(true); }, 600)
    } catch (e: any) {
      setSyncMsg(e.message || 'Falha ao sincronizar')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 6000)
    }
  }

  const badgeLabel = (c: any) => c.status === 'active' && c.automation_status && c.automation_status !== 'idle' && c.automation_status !== 'completed' ? '🤖' : ''

  return (
    <AppShell title="Conversas WhatsApp">
      <div className="conv-grid">
        {/* ===== LISTA ===== */}
        <div className="card conv-col-list">
          <div className="conv-toolbar">
            <div className="conv-search-row">
              <div className="conv-search-box">
                <Search size={14} />
                <input
                  className="conv-search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar nome ou telefone..."
                />
              </div>
              <button className="btn btn-primary btn-sm conv-new-btn" onClick={() => setShowNewConv(true)} title="Nova conversa">
                <MessageSquarePlus size={15} />
              </button>
              <button className="btn btn-ghost btn-sm conv-sync" onClick={syncHistory} disabled={syncing} title="Sincronizar mensagens">
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="conv-chips">
              {FILTERS.map((f) => (
                <button key={f.id} className={`conv-chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {syncMsg && <div className="conv-sync-msg">{syncMsg}</div>}
            {!loadingList && <div className="conv-count">{total} conversa{total === 1 ? '' : 's'}</div>}
          </div>

          <div className="conv-list" ref={listRef}>
            {loadingList ? (
              <div className="conv-list-status">Carregando conversas…</div>
            ) : convs.length === 0 ? (
              <div className="empty conv-empty">
                <div className="icon">💬</div>
                <div className="title">Nenhuma conversa</div>
                <div className="desc">Nenhuma conversa encontrada para este filtro.</div>
              </div>
            ) : (
              convs.map((c: any) => (
                <div
                  key={c.id}
                  className={`conv-item ${active?.id === c.id ? 'active' : ''}`}
                  onClick={() => openConversation(c)}
                >
                  <div className="conv-avatar">{displayName(c).charAt(0).toUpperCase()}</div>
                  <div className="conv-item-body">
                    <div className="conv-item-top">
                      <span className="conv-item-name">{displayName(c)}</span>
                      <span className="conv-item-time">{hm(c.last_message_at)}</span>
                    </div>
                    <div className="conv-item-sub">
                      {c.last_message ? (c.last_message.length > 80 ? c.last_message.slice(0, 80) + '…' : c.last_message) : (c.contact_phone || c.contact_company || 'Sem mensagens')}
                    </div>
                    {(c.contact_tags || c.campaign || c.utm_source) && (
                      <div className="conv-item-tags">
                        {c.contact_tags && c.contact_tags.split(/[;,]/).filter(Boolean).slice(0, 3).map((t: string, i: number) => (
                          <span key={i} className="conv-tag">{t.trim()}</span>
                        ))}
                        {c.campaign && <span className="conv-tag conv-tag-meta">📊 {c.campaign}</span>}
                        {c.utm_source && c.utm_source.toLowerCase().includes('facebook') && <span className="conv-tag conv-tag-fb">Meta Ads</span>}
                      </div>
                    )}
                    <div className="conv-item-row2">
                      <span className="conv-item-ctx">
                        {c.stage_name || 'Sem etapa'} {badgeLabel(c) ? `· ${badgeLabel(c)} ${c.automation_status || ''}` : ''}
                      </span>
                      {c.unread_count > 0 && <span className="conv-unread">{c.unread_count}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
            {hasMore && (
              <div className="conv-more">
                <div ref={sentinelRef} className="conv-sentinel" />
                <button className="btn btn-ghost btn-sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ===== CHAT ===== */}
        <div className="card conv-col-chat">
          {!active ? (
            <div className="empty conv-empty fill">
              <div className="icon">💬</div>
              <div className="title">Selecione uma conversa</div>
              <div className="desc">Escolha uma conversa na lista para começar a atender.</div>
            </div>
          ) : (
            <>
              <div className="conv-chat-head">
                <div className="who">
                  <div className="conv-avatar conv-avatar-md">
                    {displayName(active).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="conv-chat-name">
                      {displayName(active)}
                      <button className="btn-icon" title="Editar nome" onClick={() => { setEditNameVal(active.custom_name || ''); setEditingName(true) }}>
                        <Pencil size={13} />
                      </button>
                    </div>
                    <div className="conv-chat-sub">
                      {active.contact_phone ? `${active.contact_phone} · ` : ''}
                      {STATUS_LABEL[active.status] || active.status || '—'}
                      {active.automation_status && active.automation_status !== 'idle' ? ` · ${active.automation_status}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Gerar orçamento"
                    onClick={() => {
                      const name = encodeURIComponent(displayName(active))
                      const phone = encodeURIComponent(active.contact_phone || '')
                      const cid = active.contact_id || ''
                      const cvid = active.id || ''
                      router.push(`/orcamentos?novo=1&contact_id=${cid}&contact_name=${name}&contact_phone=${phone}&conversation_id=${cvid}`)
                    }}
                  >
                    <FileText size={14} /> Orçamento
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={takeover}>Assumir humano</button>
                {active.status === 'human' && <button className="btn btn-primary btn-sm" onClick={finalizar}>Finalizar atendimento</button>}
                </div>
              </div>

              <div className="conv-msgs-wrap">
                {loadingOlder && <div className="conv-older-hint">carregando histórico…</div>}
                <div className="conv-msgs" ref={chatRef} onScroll={onChatScroll}>
                  {msgs.length === 0 ? (
                    <div className="empty conv-empty">
                      <div className="icon">💬</div>
                      <div className="desc">Sem mensagens ainda. Envie a primeira ou aguarde o contato.</div>
                    </div>
                  ) : (
                    msgs.map((m: any) => {
                      const out = m.direction === 'outgoing'
                      const isPending = m.status === 'pending'
                      const isFailed = m.status === 'failed'
                      const isMedia = !!m.media_url
                      const mt = m.media_mime || ''
                      const isImage = m.type === 'image' || mt.startsWith('image/')
                      const isAudio = m.type === 'audio' || mt.startsWith('audio/')
                      const isVideo = m.type === 'video' || mt.startsWith('video/')
                      const isDoc = m.type === 'document'
                      return (
                        <div key={m.id || m.client_id} className={`msg-row ${out ? 'out' : 'in'}`}>
                          <div className={`msg-bubble ${out ? 'out' : 'in'} ${isPending ? 'msg-pending' : ''} ${isFailed ? 'msg-failed' : ''}`}>
                            <div className="msg-author">{msgAuthor(m)}</div>
                            {isImage && m.media_url && (
                              <img className="msg-media-preview" src={mediaUrl(m.media_url) || ''} alt="" loading="lazy" />
                            )}
                            {isVideo && m.media_url && (
                              <video className="msg-media-video" src={mediaUrl(m.media_url) || ''} controls preload="metadata" />
                            )}
                            {isAudio && m.media_url && (
                              <audio className="msg-media-audio" src={mediaUrl(m.media_url) || ''} controls preload="metadata" />
                            )}
                            {isDoc && m.media_url && (
                              <a className="msg-media-doc" href={mediaUrl(m.media_url) || ''} target="_blank" rel="noreferrer">
                                <FileText size={14} />
                                {m.file_name || m.media_url.split('/').pop() || 'Documento'}
                              </a>
                            )}
                            {!isMedia && m.content && (
                              <div className="msg-content">{m.content}</div>
                            )}
                            {isMedia && m.content && (
                              <div className="msg-content">{m.content}</div>
                            )}
                            <div className="msg-meta">
                              {hm(m.created_at)}
                              {out && isPending && <span className="msg-status">⏳</span>}
                              {out && m.status === 'sent' && <span className="msg-status">✓</span>}
                              {out && m.status === 'delivered' && <span className="msg-status">✓✓</span>}
                              {out && isFailed && (
                                <button
                                  className="msg-retry-btn"
                                  onClick={() => retryMessage(m)}
                                  type="button"
                                >Tentar novamente</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="conv-composer">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileAttach(f)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                />
                <button
                  type="button"
                  className="conv-composer-attach"
                  title="Anexar mídia"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  <Paperclip size={16} />
                </button>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pendingAttachment && (
                    <div className="conv-composer-preview">
                      {pendingAttachment.media_type === 'image' ? (
                        <img src={mediaUrl(pendingAttachment.url) || ''} alt="" />
                      ) : (
                        <Paperclip size={14} />
                      )}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pendingAttachment.file_name || 'Anexo'}
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setPendingAttachment(null)}
                        style={{ background: 'transparent', border: 0, color: 'var(--text-dim)', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <input
                    className="input"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder={pendingAttachment ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
                    disabled={sending}
                  />
                </div>
                <button className="btn btn-primary" onClick={send} disabled={sending || (!reply.trim() && !pendingAttachment)}>
                  <Send size={15} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* ===== DETALHES ===== */}
        <div className="card conv-col-details">
          {active ? (
            <>
              <div className="conv-details-head">
                <h3>Detalhes</h3>
                {active.status === 'human' && <span className="badge badge-success">humano</span>}
              </div>
              <div className="conv-details-scroll">
                <Row label="Nome" value={active.custom_name || active.contact_name} />
                <Row label="Telefone" value={active.contact_phone} />
                <Row label="Empresa" value={active.contact_company} />
                <Row label="Lead" value={active.lead_name} />
                <Row label="Etapa" value={active.stage_name} />
                <Row label="Origem" value="WhatsApp" />
                {(active.campaign || active.utm_campaign || active.fbclid || (active.utm_source && /facebook|fb|instagram|meta/i.test(active.utm_source))) && (
                  <div className="conv-detail-row">
                    <div className="label">Campanha</div>
                    <div className="conv-detail-val">
                      {active.campaign && <div className="conv-campaign-line"><strong>📊 {active.campaign}</strong></div>}
                      {active.lead_source && <div className="conv-campaign-line">Origem: <span className="conv-source-pill">{active.lead_source}</span></div>}
                      {active.utm_source && <div className="conv-campaign-line">UTM Source: <code>{active.utm_source}</code></div>}
                      {active.utm_medium && <div className="conv-campaign-line">UTM Medium: <code>{active.utm_medium}</code></div>}
                      {active.utm_campaign && <div className="conv-campaign-line">UTM Campaign: <code>{active.utm_campaign}</code></div>}
                      {active.utm_content && <div className="conv-campaign-line">UTM Content: <code>{active.utm_content}</code></div>}
                      {active.adset && <div className="conv-campaign-line">AdSet: <code>{active.adset}</code></div>}
                      {active.ad_name && <div className="conv-campaign-line">Anúncio: <code>{active.ad_name}</code></div>}
                      {active.fbclid && <div className="conv-campaign-line">📘 <strong>Meta Pixel Click ID:</strong> <code className="conv-fbclid">{active.fbclid}</code></div>}
                    </div>
                  </div>
                )}
                {active.contact_tags && (
                  <div className="conv-detail-row">
                    <div className="label">Tags</div>
                    <div className="conv-detail-val conv-tags-display">
                      {active.contact_tags.split(/[;,]/).filter(Boolean).map((t: string, i: number) => (
                        <span key={i} className="conv-tag">{t.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                <Row label="Status" value={STATUS_LABEL[active.status] || active.status} />
                <Row label="Automação" value={active.automation_status} />
                <Row label="Responsável" value={active.assigned_user_id || '—'} />
                <Row label="Última mensagem" value={active.last_message_at ? hm(active.last_message_at) : '—'} />
                <Row label="ID" value={active.id} mono />
              </div>
            </>
          ) : (
            <div className="empty conv-empty fill"><div className="icon">👤</div></div>
          )}
        </div>
      </div>

      {/* Modal Nova Conversa */}
      {showNewConv && (
        <div className="modal-overlay" onClick={() => setShowNewConv(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Nova conversa</h3>
            <div className="grid gap-3">
              <div>
                <label className="label">Número do WhatsApp *</label>
                <input className="input" value={newConvForm.phone} onChange={(e) => setNewConvForm({ ...newConvForm, phone: e.target.value })} placeholder="+55 (15) 99999-9999" autoFocus />
              </div>
              <div>
                <label className="label">Nome (opcional)</label>
                <input className="input" value={newConvForm.name} onChange={(e) => setNewConvForm({ ...newConvForm, name: e.target.value })} placeholder="Nome do contato" />
              </div>
              {newConvError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{newConvError}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setShowNewConv(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={createNewConv} disabled={creatingConv}>{creatingConv ? 'Criando…' : 'Iniciar conversa'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Nome */}
      {editingName && (
        <div className="modal-overlay" onClick={() => setEditingName(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Editar nome</h3>
            <input className="input" value={editNameVal} onChange={(e) => setEditNameVal(e.target.value)} placeholder="Nome personalizado" autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={() => setEditingName(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveCustomName}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="conv-detail-row">
      <div className="label">{label}</div>
      <div className={`conv-detail-val ${mono ? 'mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}
