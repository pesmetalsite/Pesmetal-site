'use client'
import { useEffect, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import { api, getToken, getUser } from '@/lib/api'
import { MessageSquarePlus, Pencil, RefreshCw, Search, Send } from 'lucide-react'

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
  const [sending, setSending] = useState(false)

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
    if (!text || !active?.id || sending) return
    setSending(true)
    try {
      await api(`/whatsapp/conversations/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }, getToken()!)
      setReply('')
      const r = await api(`/whatsapp/conversations/${active.id}/messages?limit=${PAGE}&offset=0&oldest_first=0`, {}, getToken()!)
      const asc = (r.messages || []).slice().reverse()
      const map = new Map(msgsRef.current.map((m: any) => [m.id, m]))
      asc.forEach((m: any) => map.set(m.id, m))
      commitMsgs(Array.from(map.values()).sort(byTime))
      const now = new Date().toISOString()
      setConvs((prev: any[]) => {
        const others = prev.filter((c: any) => c.id !== active.id)
        return [{ ...active, last_message_at: now, unread_count: 0 }, ...others]
      })
      setActive((a: any) => a ? { ...a, last_message_at: now, unread_count: 0 } : a)
      requestAnimationFrame(scrollBottom)
    } catch (e: any) {
      alert(e.message || 'Falha ao enviar')
    } finally {
      setSending(false)
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
                <button className="btn btn-ghost btn-sm" onClick={takeover}>Assumir humano</button>
                {active.status === 'human' && <button className="btn btn-primary btn-sm" onClick={finalizar}>Finalizar atendimento</button>}
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
                      return (
                        <div key={m.id} className={`msg-row ${out ? 'out' : 'in'}`}>
                          <div className={`msg-bubble ${out ? 'out' : 'in'}`}>
                            <div className="msg-author">{msgAuthor(m)}</div>
                            <div className="msg-content">{m.content || (m.media_url ? '📎 Anexo' : '')}</div>
                            <div className="msg-meta">{hm(m.created_at)}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="conv-composer">
                <input
                  className="input"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                  placeholder="Digite uma mensagem..."
                  disabled={sending}
                />
                <button className="btn btn-primary" onClick={send} disabled={sending || !reply.trim()}>
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
