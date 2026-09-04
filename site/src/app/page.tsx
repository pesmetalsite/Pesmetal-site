'use client'
import { useEffect, useState } from 'react'
import {
  Hammer, Wrench, Shield, Ruler, Cog, HardHat,
  ArrowRight, Loader2, Menu, X, MessageCircle,
  CheckCircle2, Phone, ChevronRight, Star
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://lucid-contentment-production-17bc.up.railway.app'
const DEFAULT_WA = '5515999999999'

const SERVICES = [
  { icon: Hammer, tag: 'Caldeiraria', title: 'Estruturas Pesadas', desc: 'Bases, pilares, vigas e grandes peças soldadas para mineração, siderurgia e construção civil.' },
  { icon: Wrench, tag: 'Caldeiraria', title: 'Estruturas Médias', desc: 'Mezaninos, escadas marinheiro, plataformas e bases para equipamentos industriais.' },
  { icon: Shield, tag: 'Soldagem', title: 'Soldagem Especializada', desc: 'Processos MIG, TIG, eletrodo e arame tubular com soldadores qualificados e EPS registrado.' },
  { icon: Ruler, tag: 'Usinagem', title: 'Usinagem CNC', desc: 'Peças usinadas em tornos e fresadoras CNC conforme desenho técnico do cliente.' },
  { icon: Cog, tag: 'Recuperação', title: 'Caçambas & Dentes', desc: 'Reparo estrutural e reforço em caçambas, dentes e suportes para máquinas pesadas.' },
  { icon: HardHat, tag: 'Fabricação', title: 'Sob Medida', desc: 'Projetos customizados da engenharia à entrega, com acabamento industrial.' },
]

const PROJECTS = [
  { img: '/images/dentes-case.jpg', cat: 'Mineração', title: 'Dentes CASE 430M' },
  { img: '/images/cacamba-reparo.jpg', cat: 'Caldeiraria', title: 'Reparo Estrutural' },
  { img: '/images/oficina-portao.jpg', cat: 'Construção', title: 'Estruturas Metálicas' },
  { img: '/images/soldador-precisao.jpg', cat: 'Soldagem', title: 'Soldagem de Precisão' },
  { img: '/images/pecas-fundidas.jpg', cat: 'Usinagem', title: 'Peças sob Desenho' },
  { img: '/images/produto-final.jpg', cat: 'Fabricação', title: 'Acabamento Industrial' },
]

export default function Home() {
  const [scrolled, setScrolled] = useState(false)
  const [company, setCompany] = useState({
    company_whatsapp: '',
    company_name: 'Pes Metal',
    company_experience_years: '30',
    company_about: ''
  })
  const [services, setServices] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', service: '', description: '' })
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20)
    h()
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    document.body.classList.add('fade-ready')
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in-view') }),
      { threshold: 0, rootMargin: '0px 0px -6% 0px' }
    )
    document.querySelectorAll('.fade-up').forEach((el) => obs.observe(el))
    requestAnimationFrame(() => {
      document.querySelectorAll('.fade-up').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.top < window.innerHeight + 50) el.classList.add('in-view')
      })
    })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let session = localStorage.getItem('pesmetal_session')
    if (!session) { session = crypto.randomUUID(); localStorage.setItem('pesmetal_session', session) }
    const p = new URLSearchParams(window.location.search)
    fetch(`${API}/public/track`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: session,
        utm_source: p.get('utm_source') || undefined,
        utm_medium: p.get('utm_medium') || undefined,
        utm_campaign: p.get('utm_campaign') || undefined,
        utm_content: p.get('utm_content') || undefined,
        utm_term: p.get('utm_term') || undefined,
        fbclid: p.get('fbclid') || undefined,
        gclid: p.get('gclid') || undefined,
        referrer: document.referrer || undefined,
        landing_page: window.location.href,
        event: 'page_view',
      }),
    }).catch(() => {})

    Promise.all([
      fetch(`${API}/public/company`).then(r => r.json()).catch(() => null),
      fetch(`${API}/public/services`).then(r => r.json()).catch(() => null),
      fetch(`${API}/public/projects`).then(r => r.json()).catch(() => null),
    ]).then(([c, s, pr]: any[]) => {
      if (c?.company) setCompany(c.company)
      if (s?.services?.length) setServices(s.services)
      if (pr?.projects?.length) setProjects(pr.projects)
    })
  }, [])

  const wa = (company.company_whatsapp || DEFAULT_WA).replace(/\D/g, '')
  const waLink = `https://wa.me/${wa}?text=${encodeURIComponent('Olá! Vim pelo site da Pes Metal e gostaria de um orçamento.')}`

  const track = (label: string) => {
    const session = localStorage.getItem('pesmetal_session')
    fetch(`${API}/public/track`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: session, event: 'whatsapp_click', source: 'site', payload: { label } }),
    }).catch(() => {})
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true); setFormError('')
    try {
      const p = new URLSearchParams(window.location.search)
      const session = localStorage.getItem('pesmetal_session') || ''
      const r = await fetch(`${API}/public/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, session_token: session,
          utm_source: p.get('utm_source') || undefined,
          utm_medium: p.get('utm_medium') || undefined,
          utm_campaign: p.get('utm_campaign') || undefined,
          utm_content: p.get('utm_content') || undefined,
          utm_term: p.get('utm_term') || undefined,
          fbclid: p.get('fbclid') || undefined,
          gclid: p.get('gclid') || undefined,
          referrer: document.referrer || undefined,
          landing_page: window.location.href,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao enviar. Tente novamente.')
      }
      setSuccess(true)
      setForm({ name: '', phone: '', email: '', company: '', service: '', description: '' })
    } catch (e: any) {
      const isOffline = e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || !navigator.onLine
      setFormError(isOffline ? 'Servidor indisponível. Entre em contato pelo WhatsApp.' : e.message || 'Erro ao enviar.')
    } finally { setSending(false) }
  }

  const allServices = services.length > 0 ? services : SERVICES
  const allProjects = projects.length > 0 ? projects : PROJECTS
  const years = company.company_experience_years

  return (
    <>
      {/* HEADER */}
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
        <div className="container header-inner">
          <a href="#" className="logo">
            <div className="logo-mark">PM</div>
            <div>
              <div className="logo-name">PES METAL</div>
              <div className="logo-tagline">Caldeiraria · Soldagem · Usinagem</div>
            </div>
          </a>
          <nav className="nav">
            <a href="#servicos">Serviços</a>
            <a href="#sobre">Empresa</a>
            <a href="#projetos">Projetos</a>
            <a href="#contato">Contato</a>
            <a href={waLink} target="_blank" rel="noopener" className="nav-wa" onClick={() => track('header')}>
              <MessageCircle size={15} /> WhatsApp
            </a>
          </nav>
          <button onClick={() => setMenuOpen(!menuOpen)} className="menu-btn" aria-label="Menu">
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="mobile-nav open" onClick={() => setMenuOpen(false)}>
          <div className="mobile-nav-inner" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <button onClick={() => setMenuOpen(false)}><X size={24} /></button>
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['#servicos','Serviços'],['#sobre','Empresa'],['#projetos','Projetos'],['#contato','Contato']].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{ padding: '12px 0', fontSize: 18, fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{label}</a>
              ))}
              <a href={waLink} target="_blank" rel="noopener" className="btn btn-wa" style={{ marginTop: 16, justifyContent: 'center' }}>
                <MessageCircle size={16} /> Falar no WhatsApp
              </a>
            </nav>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="container">
          <div className="hero-content">
            <div className="hero-label">
              <span>Sorocaba/SP</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span>Atendemos todo o Brasil</span>
            </div>
            <h1>
              Quem trabalha com <span className="accent">metal</span>,<br />
              trabalha com a <span className="blue">gente certa.</span>
            </h1>
            <p className="hero-desc">
              Caldeiraria, soldagem e usinagem para indústria, mineração e construção civil.
              Engenharia própria, prazo cumprido, qualidade documentada.
            </p>
            <div className="hero-actions">
              <a href="#contato" className="btn btn-primary">
                Solicitar Orçamento <ArrowRight size={16} />
              </a>
              <a href={waLink} target="_blank" rel="noopener" className="btn btn-outline" onClick={() => track('hero')}>
                <MessageCircle size={18} /> Falar no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <div className="trust">
        <div className="container">
          <div className="trust-grid">
            <div className="trust-item">
              <div className="trust-num">{years}+</div>
              <div className="trust-label">Anos de mercado</div>
            </div>
            <div className="trust-item">
              <div className="trust-num">500+</div>
              <div className="trust-label">Projetos entregues</div>
            </div>
            <div className="trust-item">
              <div className="trust-num">6</div>
              <div className="trust-label">Linhas de serviço</div>
            </div>
            <div className="trust-item">
              <div className="trust-num">100%</div>
              <div className="trust-label">Engenharia própria</div>
            </div>
            <div className="trust-item">
              <div className="trust-num">24h</div>
              <div className="trust-label">Resposta ao orçamento</div>
            </div>
          </div>
        </div>
      </div>

      {/* SERVIÇOS */}
      <section id="servicos" className="section">
        <div className="container">
          <div className="section-header">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              Capacidade de produção
            </div>
            <h2>Soluções em metalurgia pesada</h2>
            <p>Da caldeiraria pesada à usinagem de precisão — cobrimos toda a cadeia de fabricação metalúrgica com qualidade documentada.</p>
          </div>

          <div className="services-grid">
            {allServices.slice(0, 6).map((s: any, i: number) => {
              const def = SERVICES[i] || SERVICES[0]
              const Icon = s.icon || def.icon || Hammer
              return (
                <div key={i} className="service-card fade-up">
                  <div className="service-icon"><Icon size={24} strokeWidth={1.5} /></div>
                  <div className="service-tag">{s.category || def.tag}</div>
                  <h3>{s.name || def.title}</h3>
                  <p>{s.description || def.desc}</p>
                </div>
              )
            })}
          </div>

          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <a href="#contato" className="btn btn-primary" style={{ display: 'inline-flex' }}>
              Solicitar orçamento <ChevronRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* SOBRE */}
      <section id="sobre" className="section section-alt">
        <div className="container">
          <div className="about-grid">
            <div className="about-text fade-up">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                {years} anos de história
              </div>
              <h2>Fornecedor de referência para a indústria pesada</h2>
              <p>
                {company.company_about ||
                  'A Pes Metal é fornecedora de componentes e estruturas metálicas para operações que não podem parar. Trabalhamos com manutenção industrial, fabricação sob desenho e recuperação de equipamentos — sempre com controle de qualidade documentado e entrega no prazo.'}
              </p>

              <ul className="qual-list">
                <li>
                  <span className="q-icon"><CheckCircle2 size={14} /></span>
                  <div className="q-text">
                    <h4>Soldadores qualificados</h4>
                    <p>Procedimentos de soldagem qualificados (EPS) conforme normas técnicas aplicáveis.</p>
                  </div>
                </li>
                <li>
                  <span className="q-icon"><CheckCircle2 size={14} /></span>
                  <div className="q-text">
                    <h4>Controle dimensional</h4>
                    <p>Instrumentação de precisão para verificação de tolerâncias e geometrias críticas.</p>
                  </div>
                </li>
                <li>
                  <span className="q-icon"><CheckCircle2 size={14} /></span>
                  <div className="q-text">
                    <h4>Prazo cumprido</h4>
                    <p>Gestão de projeto com cronograma detalhado. Seguimos o prazo combinado.</p>
                  </div>
                </li>
                <li>
                  <span className="q-icon"><CheckCircle2 size={14} /></span>
                  <div className="q-text">
                    <h4>Qualidade documentada</h4>
                    <p>Inspeção visual, dimensional e registros fotográficos antes da expedição.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="about-img-wrap fade-up">
              <img src="/images/soldador-precisao.jpg" alt="Soldador profissional" loading="lazy" />
              <div className="about-year">
                <div className="num">{years}+</div>
                <div className="lbl">Anos</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROJETOS */}
      <section id="projetos" className="section">
        <div className="container">
          <div className="section-header">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              Portfólio
            </div>
            <h2>Projetos que falam por nós</h2>
            <p>Cada peça é produzida para atender à especificação técnica do cliente. Sem improviso.</p>
          </div>

          <div className="projects-grid">
            {allProjects.slice(0, 6).map((p: any, i: number) => {
              const def = PROJECTS[i] || PROJECTS[0]
              const img = p.image || (p.images && p.images[0]) || def.img
              const cat = p.category || def.cat
              const title = p.name || def.title
              return (
                <div key={i} className="project-card fade-up">
                  <img src={img} alt={title} loading="lazy" />
                  <div className="project-overlay">
                    <div className="project-cat">{cat}</div>
                    <h3>{title}</h3>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="container">
          <h2>Tem um projeto em mãos?</h2>
          <p>Envie a descrição, foto ou desenho técnico. Nossa equipe avalia e retorna em até 24 horas úteis.</p>
          <div className="cta-btns">
            <a href="#contato" className="btn btn-primary">
              Preencher formulário <ArrowRight size={16} />
            </a>
            <a href={waLink} target="_blank" rel="noopener" className="btn btn-wa" onClick={() => track('cta')}>
              <MessageCircle size={18} /> Falar agora
            </a>
          </div>
        </div>
      </section>

      {/* CONTATO / FORM */}
      <section id="contato" className="section form-section">
        <div className="container">
          <div className="section-header">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              Solicitar orçamento
            </div>
            <h2>Envie seu projeto</h2>
            <p>Análise técnica sem compromisso. Respondemos em até 24 horas úteis.</p>
          </div>

          <div className="form-grid">
            <div className="form-aside fade-up">
              <h3>O que você recebe</h3>
              <ul className="form-list">
                <li>
                  <span className="check-icon"><CheckCircle2 size={12} /></span>
                  Análise técnica da sua solicitação
                </li>
                <li>
                  <span className="check-icon"><CheckCircle2 size={12} /></span>
                  Orçamento detalhado por item
                </li>
                <li>
                  <span className="check-icon"><CheckCircle2 size={12} /></span>
                  Prazo de entrega proposto
                </li>
                <li>
                  <span className="check-icon"><CheckCircle2 size={12} /></span>
                  Condições de pagamento
                </li>
                <li>
                  <span className="check-icon"><CheckCircle2 size={12} /></span>
                  Suporte técnico durante a execução
                </li>
              </ul>

              <div className="contact-box">
                <div className="label">Horário de atendimento</div>
                <div className="value">Segunda a Sexta · 08h às 18h</div>
                <a href={waLink} target="_blank" rel="noopener" className="wa-link" onClick={() => track('form-sidebar')}>
                  <MessageCircle size={16} /> Falar pelo WhatsApp
                </a>
              </div>
            </div>

            <form className="form-card fade-up" onSubmit={submit}>
              {success && (
                <div className="form-success">
                  <strong>Solicitação enviada!</strong> Nossa equipe entrará em contato em breve.
                </div>
              )}
              {formError && <div className="form-error">{formError}</div>}

              <div className="form-row">
                <div className="form-field">
                  <label>Nome completo</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Seu nome completo" />
                </div>
                <div className="form-field">
                  <label>Telefone / WhatsApp</label>
                  <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>E-mail</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@empresa.com" />
                </div>
                <div className="form-field">
                  <label>Empresa</label>
                  <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Sua empresa" />
                </div>
              </div>
              <div className="form-field">
                <label>Serviço de interesse</label>
                <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>
                  <option value="">Selecione…</option>
                  <option value="Caldeiraria Pesada">Caldeiraria Pesada</option>
                  <option value="Caldeiraria Média">Caldeiraria Média</option>
                  <option value="Soldagem Especializada">Soldagem Especializada</option>
                  <option value="Usinagem CNC">Usinagem CNC</option>
                  <option value="Recuperação de Caçambas">Recuperação de Caçambas</option>
                  <option value="Fabricação Sob Medida">Fabricação Sob Medida</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div className="form-field">
                <label>Descreva seu projeto</label>
                <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detalhes do projeto, dimensões aproximadas, materiais, quantidade, prazo desejado…" rows={4} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={sending}>
                {sending ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
                ) : (
                  <>Enviar Solicitação <ArrowRight size={16} /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="logo" style={{ marginBottom: 20 }}>
                <div className="logo-mark">PM</div>
                <div>
                  <div className="logo-name" style={{ color: '#fff' }}>PES METAL</div>
                  <div className="logo-tagline">Caldeiraria · Soldagem · Usinagem</div>
                </div>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, maxWidth: 280, lineHeight: 1.7 }}>
                {years}+ anos fornecendo soluções em caldeiraria, soldagem e usinagem para indústria pesada em todo o Brasil.
              </p>
            </div>
            <div>
              <h4>Navegação</h4>
              <ul>
                <li><a href="#servicos">Serviços</a></li>
                <li><a href="#sobre">Empresa</a></li>
                <li><a href="#projetos">Projetos</a></li>
                <li><a href="#contato">Contato</a></li>
              </ul>
            </div>
            <div>
              <h4>Serviços</h4>
              <ul>
                <li><a href="#servicos">Caldeiraria</a></li>
                <li><a href="#servicos">Soldagem</a></li>
                <li><a href="#servicos">Usinagem</a></li>
                <li><a href="#servicos">Recuperação</a></li>
              </ul>
            </div>
            <div>
              <h4>Contato</h4>
              <ul>
                <li><a href={waLink} target="_blank" rel="noopener">WhatsApp</a></li>
                <li><a href="mailto:contato@pesmetal.com.br">E-mail</a></li>
                <li><span>Sorocaba/SP</span></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Pes Metal</span>
            <span>Sorocaba/SP · Atendemos todo o Brasil</span>
            <a
              href="https://pesmetal-admin.vercel.app"
              target="_blank"
              rel="noopener"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}
            >
              Acesso restrito
            </a>
          </div>
        </div>
      </footer>

      {/* WA FLOAT */}
      <a href={waLink} target="_blank" rel="noopener" className="wa-float" aria-label="WhatsApp" onClick={() => track('float')}>
        <MessageCircle size={28} />
      </a>
    </>
  )
}
