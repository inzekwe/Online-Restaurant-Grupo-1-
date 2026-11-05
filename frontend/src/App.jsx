import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Bike, BadgeCheck, ChefHat, Clock3, Flame, ForkKnife, Heart, Leaf, LoaderCircle, MapPin, Minus, Plus, PackageCheck, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Store, Trash2, Utensils, Users, X } from "lucide-react"
import { api, API_BASE } from "./api"

const money = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const status = (s) => ({ recebido: ["Recebido", "new"], em_preparacao: ["Em preparo", "cooking"], saiu_para_entrega: ["Saiu para entrega", "delivery"], concluido: ["Concluído", "done"], cancelado: ["Cancelado", "cancel"] }[s] || [s || "—", "new"])
const emoji = (name = "") => /bolo|doce|pudim|brownie|torta/i.test(name) ? "🍰" : /suco|cafe|café|bebida|chá/i.test(name) ? "🥤" : /salada|veg|legume/i.test(name) ? "🥗" : /massa|lasanha|nhoque/i.test(name) ? "🍝" : /hamb|burger/i.test(name) ? "🍔" : /peixe|salmão|camarao/i.test(name) ? "🐟" : "🍲"
const category = (name = "", selected = "") => selected || (/bolo|doce|pudim|brownie|torta|sobremesa/i.test(name) ? "Sobremesas" : /suco|cafe|café|bebida|chá|refrigerante/i.test(name) ? "Bebidas" : "Pratos principais")
const photoIndex = (name = "") => /bolo|doce|pudim|brownie|torta/i.test(name) ? 3 : /massa|lasanha|nhoque|pasta/i.test(name) ? 1 : /salada|veg|legume/i.test(name) ? 2 : 0
const toDateTimeLocal = (date) => { const p = (n) => String(n).padStart(2, "0"); return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}` }

function OrderJourney({ order }) {
  const steps = [
    ["Recebido", PackageCheck],
    ["Em preparo", ChefHat],
    [order.tipo_entrega === "retirada" ? "Pronto para retirar" : "A caminho", order.tipo_entrega === "retirada" ? Store : Bike],
    ["Concluído", BadgeCheck]
  ]
  const current = { recebido: 0, em_preparacao: 1, saiu_para_entrega: 2, concluido: 3 }[order.status] ?? -1
  return <div className={"order-journey" + (order.status === "cancelado" ? " cancelled" : "")} aria-label={"Etapas do pedido: " + labelStatus(order.status)}>
    {steps.map(([name, Icon], index) => {
      const done = order.status === "concluido" || index < current
      const active = index === current && order.status !== "concluido"
      return <div className={"journey-step" + (done ? " done" : active ? " active" : "")} key={name}>
        <span className="journey-icon"><Icon size={19}/></span><b>{name}</b><small>{done ? "Concluído" : active ? "Agora" : "Em breve"}</small>
      </div>
    })}
    {order.status === "cancelado" && <p className="journey-cancelled-note">Este pedido foi cancelado.</p>}
  </div>
}
const labelStatus = (value) => ({ recebido: "Recebido", em_preparacao: "Em preparo", saiu_para_entrega: "Saiu para entrega", concluido: "Concluído", cancelado: "Cancelado" }[value] || value || "sem status")

export default function App() {
  const [page, setPage] = useState("menu")
  const [dishes, setDishes] = useState([])
  const [featuredDishes, setFeaturedDishes] = useState([])
  const [featuredIndex, setFeaturedIndex] = useState(0)
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersLastUpdated, setOrdersLastUpdated] = useState(null)
  const [ordersSyncError, setOrdersSyncError] = useState("")
  const ordersRequestRef = useRef(false)
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerHistory, setCustomerHistory] = useState(null)
  const [selectedDish, setSelectedDish] = useState(null)
  const [cart, setCart] = useState({})
  const [filter, setFilter] = useState("Todos")
  const [search, setSearch] = useState("")
  const [drawer, setDrawer] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [dishForm, setDishForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [customerId, setCustomerId] = useState(localStorage.getItem("mesaCustomerId") || "")
  const [customerOrders, setCustomerOrders] = useState([])
  const [profile, setProfile] = useState(null)
  const [authCustomer, setAuthCustomer] = useState(null)
  const [authModal, setAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState("login")
  const [authReturn, setAuthReturn] = useState("tracking")
  const [salesPeriod, setSalesPeriod] = useState("day")
  const [salesFrom, setSalesFrom] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return toDateTimeLocal(d) })
  const [salesTo, setSalesTo] = useState(() => toDateTimeLocal(new Date()))
  const notify = (text) => { setToast(text); setTimeout(() => setToast(""), 3200) }
  const loadMenu = useCallback(async (all = false) => {
    try { setDishes(await api("/pratos" + (all ? "?todos=true" : ""))); setError("") }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  const loadFeaturedDishes = useCallback(async () => {
    try { setFeaturedDishes(await api("/pratos/destaques", { cache: "no-store" })) }
    catch { setFeaturedDishes([]) }
  }, [])
  const loadOrders = useCallback(async (manual = false) => {
    if (ordersRequestRef.current) return
    ordersRequestRef.current = true
    setOrdersLoading(true)
    try {
      setOrders(await api("/pedidos", { cache: "no-store" }))
      setOrdersLastUpdated(new Date())
      setOrdersSyncError("")
    } catch (e) {
      setOrdersSyncError(e.message)
      if (manual) setError(e.message)
    } finally {
      ordersRequestRef.current = false
      setOrdersLoading(false)
    }
  }, [])
  const loadCustomers = useCallback(async () => {
    try { setCustomers(await api("/clientes")) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => { loadMenu(); loadFeaturedDishes() }, [loadMenu, loadFeaturedDishes])
  useEffect(() => {
    if (!localStorage.getItem("mesaAuthToken")) return
    api("/auth/me").then((customer) => { setAuthCustomer(customer); setProfile(customer); setCustomerId(customer.codigo_cliente) }).catch(() => localStorage.removeItem("mesaAuthToken"))
  }, [])
  const lines = useMemo(() => Object.entries(cart).map(([id, qty]) => {
    const d = dishes.find((x) => x.id === Number(id)); return d ? { ...d, qty } : null
  }).filter(Boolean), [cart, dishes])
  const count = lines.reduce((a, x) => a + x.qty, 0)
  const total = lines.reduce((a, x) => a + x.qty * Number(x.preco), 0)
  // Recompute the current period end on every render: polling updates orders
  // without changing the selected preset, so a memoized `now` would hide newer orders.
  const periodBounds = salesPeriod === "custom"
    ? [new Date(salesFrom), new Date(salesTo)]
    : (() => {
        const now = new Date(); const start = new Date(now)
        if (salesPeriod === "day") start.setHours(0, 0, 0, 0)
        if (salesPeriod === "week") { start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) }
        if (salesPeriod === "month") { start.setHours(0, 0, 0, 0); start.setDate(1) }
        return [start, now]
      })()
  const periodOrders = orders.filter((o) => { const date = new Date(o.data_hora); return date >= periodBounds[0] && date <= periodBounds[1] })
  const periodSales = periodOrders.filter((o) => o.status !== "cancelado").reduce((sum, o) => sum + (o.ItemPedidos || []).reduce((s, line) => s + Number(line.Prato?.preco || 0) * line.quantidade, 0), 0)
  const shown = dishes.filter((d) => (filter === "Todos" || category(d.nome, d.categoria) === filter) && (d.nome + " " + (d.descricao || "")).toLowerCase().includes(search.toLowerCase()))
  const shownCustomers = customers.filter((c) =>
    (c.codigo_cliente + " " + c.nome + " " + c.telefone).toLowerCase().includes(customerSearch.toLowerCase())
  )
  const quantity = (id, n) => setCart((old) => { const next = { ...old }; next[id] = (next[id] || 0) + n; if (next[id] <= 0) delete next[id]; return next })
  const admin = async () => { setPage("admin"); setLoading(true); await Promise.all([loadMenu(true), loadOrders(), loadCustomers()]); setLoading(false) }
  useEffect(() => {
    if (page !== "admin") return undefined
    const refreshIfVisible = () => { if (!document.hidden) loadOrders() }
    const interval = window.setInterval(refreshIfVisible, 8000)
    const onVisibility = () => { if (document.visibilityState === "visible") refreshIfVisible() }
    window.addEventListener("focus", refreshIfVisible)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", refreshIfVisible)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [page, loadOrders])
  const store = () => { setPage("menu"); setFilter("Todos"); loadMenu() }
  const loadMyOrders = async () => {
    try {
      const [result, customer] = await Promise.all([api("/minha-conta/pedidos"), api("/auth/me")])
      setCustomerOrders(result); setProfile(customer); setAuthCustomer(customer); setCustomerId(customer.codigo_cliente); setError("")
    } catch (e) { setError(e.message) }
  }
  const openAuth = (next = "tracking", mode = "login") => { setAuthReturn(next); setAuthMode(mode); setAuthModal(true); setError("") }
  const tracking = () => {
    if (!authCustomer) return openAuth("tracking")
    setPage("tracking"); setError(""); loadMyOrders()
  }
  const beginCheckout = () => {
    setDrawer(false)
    if (authCustomer) setCheckout(true)
    else { openAuth("checkout"); notify("Entre ou crie sua conta para finalizar o pedido.") }
  }
  const submitAuth = async (event) => {
    event.preventDefault(); setBusy(true); setError("")
    const f = new FormData(event.currentTarget)
    const register = authMode === "register"
    const body = register
      ? { nome: f.get("nome"), telefone: f.get("telefone"), endereco: f.get("endereco"), senha: f.get("senha") }
      : { codigo_cliente: f.get("codigo_cliente"), senha: f.get("senha") }
    try {
      const result = await api(register ? "/auth/register" : "/auth/login", { method: "POST", body: JSON.stringify(body) })
      localStorage.setItem("mesaAuthToken", result.token)
      localStorage.setItem("mesaCustomerId", result.cliente.codigo_cliente)
      setAuthCustomer(result.cliente); setProfile(result.cliente); setCustomerId(result.cliente.codigo_cliente); setAuthModal(false)
      if (authReturn === "checkout") setCheckout(true)
      else { setPage("tracking"); await loadMyOrders() }
      if (register) notify("Conta criada. Seu código de cliente é " + result.cliente.codigo_cliente)
      else notify("Bem-vindo de volta, " + result.cliente.nome + "!")
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const signOut = () => {
    localStorage.removeItem("mesaAuthToken"); localStorage.removeItem("mesaCustomerId")
    setAuthCustomer(null); setProfile(null); setCustomerOrders([]); setCustomerId(""); setPage("menu"); notify("Você saiu da sua conta.")
  }
  const lookup = loadMyOrders
  const openCustomerHistory = async (customer) => {
    setBusy(true)
    try {
      const [details, history] = await Promise.all([api("/clientes/" + encodeURIComponent(customer.codigo_cliente)), api("/backoffice/clientes/" + encodeURIComponent(customer.codigo_cliente) + "/pedidos")])
      setCustomerHistory({ customer: details, orders: history })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const changeStatus = async (id, next) => {
    setBusy(true)
    try { await api("/pedidos/" + id, { method: "PUT", body: JSON.stringify({ status: next }) }); await Promise.all([loadOrders(), loadFeaturedDishes()]); notify("Status atualizado") }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const editDish = async (event) => {
    event.preventDefault(); setBusy(true)
    const f = new FormData(event.currentTarget)
    const data = { nome: f.get("nome"), descricao: f.get("descricao"), preco: Number(f.get("preco")), categoria: f.get("categoria"), imagem_url: dishForm.imagem_url || null, destaque: f.get("destaque") === "on", disponivel: f.get("disponivel") === "on" }
    try {
      if (dishForm.id) await api("/pratos/" + dishForm.id, { method: "PUT", body: JSON.stringify(data) })
      else await api("/pratos", { method: "POST", body: JSON.stringify(data) })
      setDishForm(null); await Promise.all([loadMenu(true), loadFeaturedDishes()]); notify("Cardápio atualizado")
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const toggleDish = async (d) => {
    setBusy(true)
    try { await api("/pratos/" + d.id, { method: "PUT", body: JSON.stringify({ disponivel: !d.disponivel }) }); await Promise.all([loadMenu(true), loadFeaturedDishes()]) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const removeDish = async (d) => {
    if (!confirm("Excluir " + d.nome + "? Pratos associados a pedidos antigos precisam ser pausados para preservar o histórico.")) return
    setBusy(true)
    try { await api("/pratos/" + d.id, { method: "DELETE" }); await Promise.all([loadMenu(true), loadFeaturedDishes()]); notify("Prato excluído") }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Escolha uma foto JPEG, PNG ou WebP.")
      event.target.value = ""
      return
    }
    setBusy(true)
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const compressed = await new Promise((resolve, reject) =>
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível preparar esta imagem.")), "image/webp", 0.82)
      )
      const result = await api("/uploads/pratos", { method: "POST", body: compressed, headers: { "Content-Type": "image/webp" } })
      setDishForm((current) => ({ ...current, imagem_url: result.imagem_url }))
      notify("Foto carregada")
    } catch (e) { setError(e.message) } finally { setBusy(false); event.target.value = "" }
  }
  const saveProfile = async (event) => {
    event.preventDefault(); setBusy(true)
    const f = new FormData(event.currentTarget)
    try {
      const updated = await api("/minha-conta", { method: "PUT", body: JSON.stringify({ nome: f.get("nome"), telefone: f.get("telefone"), endereco: f.get("endereco") }) })
      setProfile(updated); setAuthCustomer(updated); notify("Seus dados foram atualizados")
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const deleteProfile = async () => {
    if (!confirm("Excluir este cadastro? O histórico de pedidos impede a exclusão.")) return
    setBusy(true)
    try {
      await api("/minha-conta", { method: "DELETE" })
      localStorage.removeItem("mesaCustomerId"); localStorage.removeItem("mesaAuthToken"); setCustomerId(""); setProfile(null); setAuthCustomer(null); setCustomerOrders([])
      notify("Cadastro excluído")
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const editOrderItem = async (line) => {
    const value = prompt("Nova quantidade para " + (line.Prato?.nome || "este item") + ":", String(line.quantidade))
    if (value === null) return
    const quantity = Number(value)
    if (!Number.isInteger(quantity) || quantity < 1) { setError("Informe uma quantidade inteira maior que zero."); return }
    setBusy(true)
    try { await api("/itens-pedido/" + line.id, { method: "PUT", body: JSON.stringify({ quantidade }) }); await Promise.all([loadOrders(), loadFeaturedDishes()]); notify("Item atualizado") }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const deleteOrderItem = async (line) => {
    if (!confirm("Remover " + (line.Prato?.nome || "este item") + " do pedido?")) return
    setBusy(true)
    try { await api("/itens-pedido/" + line.id, { method: "DELETE" }); await Promise.all([loadOrders(), loadFeaturedDishes()]); notify("Item removido") }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const addOrderItem = async (order) => {
    const id = prompt("ID do prato disponível que deseja adicionar:")
    if (!id) return
    const value = prompt("Quantidade:", "1")
    if (value === null) return
    setBusy(true)
    try {
      await api("/itens-pedido", { method: "POST", body: JSON.stringify({ id_pedido: order.id, id_prato: Number(id), quantidade: Number(value) }) })
      await Promise.all([loadOrders(), loadFeaturedDishes()]); notify("Item adicionado ao pedido")
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const placeOrder = async (event) => {
    event.preventDefault(); setBusy(true); setError("")
    const f = new FormData(event.currentTarget)
    try {
      if (!authCustomer) throw new Error("Entre na sua conta para fazer um pedido.")
      const id = authCustomer.codigo_cliente
      const order = await api("/pedidos", { method: "POST", body: JSON.stringify({ id_cliente: id, tipo_entrega: f.get("tipo_entrega"), itens: lines.map((x) => ({ id_prato: x.id, quantidade: x.qty })) }) })
      setCart({}); setCheckout(false); setDrawer(false); setCustomerId(id); localStorage.setItem("mesaCustomerId", id); setPage("tracking"); loadFeaturedDishes()
      notify("Pedido #" + order.id + " recebido!"); await loadMyOrders()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const label = (s) => status(s)[0]
  const imageSource = (url) => url?.startsWith("/") ? API_BASE + url : url
  const artwork = (dish, index = 0) => <div className={"dish-art tone-" + (index % 4)}>{dish.imagem_url ? <img className="dish-photo-uploaded" src={imageSource(dish.imagem_url)} alt={dish.nome}/> : <span className="dish-photo" style={{ backgroundPosition: (photoIndex(dish.nome) % 2 ? "100%" : "0%") + " " + (photoIndex(dish.nome) > 1 ? "100%" : "0%") }} aria-hidden="true"/>}<small>{category(dish.nome, dish.categoria).toUpperCase()}</small><button title="Favoritar" aria-label={"Favoritar " + dish.nome} onClick={(e) => { e.stopPropagation(); e.currentTarget.classList.toggle("saved") }}><Heart size={16} /></button></div>

  const spotlightDishes = featuredDishes.length ? featuredDishes : dishes.filter((dish) => dish.disponivel).slice(0, 5)
  const spotlight = spotlightDishes.length ? spotlightDishes[featuredIndex % spotlightDishes.length] : null
  useEffect(() => {
    if (spotlightDishes.length < 2) return undefined
    const timer = window.setTimeout(() => setFeaturedIndex((index) => (index + 1) % spotlightDishes.length), 2000)
    return () => window.clearTimeout(timer)
  }, [featuredIndex, spotlightDishes.length])

  return <div className={"app" + (count > 0 && page === "menu" && !drawer && !checkout ? " has-mini-cart" : "")}>
    <div className="announcement"><span><Sparkles size={13}/> Feito com tempo. Servido com carinho.</span><span>Ter–Dom · 11h às 22h · São Paulo</span></div>
    <header className="nav">
      <button className="logo" onClick={store}><span className="logo-icon"><ForkKnife size={18}/></span><span>Mesa<span className="dot">.</span><small>COZINHA DE BAIRRO</small></span></button>
      <nav><button className={page === "menu" ? "chosen" : ""} onClick={store}>Cardápio</button><button className={page === "tracking" ? "chosen" : ""} onClick={tracking}>Meus pedidos</button><button className={page === "admin" ? "chosen" : ""} onClick={admin}>Back Office</button></nav>
      <div className="nav-right"><span className="location"><MapPin size={16}/><span><small>Estamos por perto</small><b>São Paulo, SP</b></span></span><button className="bag" onClick={() => setDrawer(true)} aria-label="Abrir sacola"><ShoppingBag size={20}/>{count > 0 && <i>{count}</i>}</button></div>
    </header>
    {error && <div className="alert"><span>{error}</span><button onClick={() => setError("")}><X size={16}/></button></div>}

    {page === "menu" && <main>
      <section className="hero">
        <div className="hero-copy"><span className="kicker"><i/> COZINHA DE VERDADE, TODO DIA</span><h1>Um bom dia<br/>começa à <em>mesa.</em></h1><p>Ingredientes frescos, receitas de família e aquele sabor de comida feita em casa. Escolha o seu favorito.</p><div className="hero-actions"><button className="btn cream explore-menu" onClick={() => document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })}>Explorar cardápio <ArrowRight size={16}/></button></div><div className="home-cooks"><span>👩🏽‍🍳</span><span>🧑🏻‍🍳</span><span>👨🏾‍🍳</span><b>Feito aqui, com carinho<small>Da nossa cozinha direto pra você</small></b></div></div>
        <div className="hero-image" aria-roledescription="carousel" aria-label="Destaques do cardápio">{spotlight?.imagem_url ? <img key={spotlight.id} src={imageSource(spotlight.imagem_url)} alt={spotlight.nome}/> : spotlight ? <div className="spotlight-fallback" style={{backgroundPosition:(photoIndex(spotlight.nome)%2?"100%":"0%")+" "+(photoIndex(spotlight.nome)>1?"100%":"0%")}}/> : <img src="/images/mesa-hero.png" alt="Prato da casa"/>}<div className="hero-vignette"/><div className="stamp">feito<strong>com<br/>afeto</strong><Heart size={15} fill="currentColor"/></div>{spotlight && <div className="spotlight-copy" aria-live="polite"><small>✦ NOSSO PRATO DA CASA {spotlight.unidades_vendidas > 0 ? "· " + spotlight.unidades_vendidas + " vendidos" : ""}</small><b>{spotlight.nome}</b><span>{category(spotlight.nome,spotlight.categoria)} · {money(spotlight.preco)}</span><button onClick={()=>{quantity(spotlight.id,1);notify(spotlight.nome+" adicionado à sacola")}}>Pedir este prato <ArrowRight size={15}/></button></div>}{spotlightDishes.length>1 && <div className="featured-controls"><button aria-label="Prato em destaque anterior" onClick={()=>setFeaturedIndex((index)=>(index-1+spotlightDishes.length)%spotlightDishes.length)}>‹</button><div>{spotlightDishes.map((dish,index)=><button key={dish.id} aria-label={"Mostrar destaque " + (index+1) + ": " + dish.nome} aria-current={index===featuredIndex?"true":undefined} onClick={()=>setFeaturedIndex(index)}/>)}</div><button aria-label="Próximo prato em destaque" onClick={()=>setFeaturedIndex((index)=>(index+1)%spotlightDishes.length)}>›</button></div>}</div>
      </section>
      <section className="benefits"><div><Leaf/><span><b>Ingredientes frescos</b><small>Escolhidos toda manhã</small></span></div><div><Clock3/><span><b>Feito na hora</b><small>Sem atalhos, sem pressa</small></span></div><div><Bike/><span><b>Chega quentinho</b><small>Entrega ou retirada</small></span></div><div><strong className="stars">★★★★★</strong><span><b>4,9 de 5</b><small>Gente que já provou</small></span></div></section>
      <section className="menu-section" id="menu"><div className="section-title"><div><span className="kicker dark"><i/> FEITO HOJE, PENSADO PRA VOCÊ</span><h2>O que vai ser <em>hoje?</em></h2><p>Receitas simples, ingredientes de verdade e muito sabor.</p></div><label className="search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no cardápio"/></label></div>
        <div className="filters">{["Todos", "Pratos principais", "Sobremesas", "Bebidas"].map((x) => <button className={filter === x ? "selected" : ""} onClick={() => setFilter(x)} key={x}>{x}</button>)}<small>{shown.length} opções</small></div>
        {loading ? <div className="empty"><LoaderCircle className="spin"/>Carregando cardápio…</div> : shown.length ? <div className="dish-grid">{shown.map((d, i) => <article className="dish-card" key={d.id} role="button" tabIndex={0} aria-label={"Ver detalhes de " + d.nome} onClick={() => setSelectedDish(d)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSelectedDish(d) } }}>{artwork(d, i)}<div className="dish-content"><span className="dish-meta"><Flame size={13}/> Queridinho da casa <i>·</i> 25–35 min</span><h3>{d.nome}</h3><p>{d.descricao || "Preparado na hora com ingredientes frescos e muito carinho."}</p><div className="dish-price"><b>{money(d.preco)}</b><button onClick={(e) => { e.stopPropagation(); quantity(d.id, 1); notify(d.nome + " adicionado à sacola") }} aria-label={"Adicionar " + d.nome}><Plus size={18}/></button></div></div></article>)}</div> : <div className="empty-menu"><span>🍲</span><h3>{dishes.length ? "Não encontramos esse prato" : "Nossa cozinha está preparando o cardápio"}</h3><p>{dishes.length ? "Tente outra busca ou categoria." : "A equipe pode cadastrar os pratos no Back Office."}</p><button className="btn dark" onClick={dishes.length ? () => { setSearch(""); setFilter("Todos") } : admin}>{dishes.length ? "Ver cardápio completo" : "Abrir Back Office"} <ArrowRight size={16}/></button></div>}
      </section>
      <section className="story"><span className="story-icon"><Utensils/></span><div><small>DE CASA PRA SUA CASA</small><h2>Tem coisa melhor que<br/>comida que <em>abraça?</em></h2></div><p>Na Mesa, cada receita tem uma história. E a gente adora quando você faz parte dela.</p><button onClick={() => notify("Em breve: conheça mais sobre a nossa cozinha.")}>Nossa história <ArrowRight size={16}/></button></section>
    </main>}

    {page === "tracking" && <main className="tracking"><span className="kicker dark"><i/> ÁREA DO CLIENTE</span><h1>Seus pedidos, <em>de perto.</em></h1><p>Olá, {authCustomer?.nome}. Acompanhe seus pedidos com segurança na sua conta.</p><div className="account-toolbar"><span><b>{authCustomer?.codigo_cliente}</b><small>Conta conectada</small></span><button className="account-cart-button" onClick={() => setDrawer(true)} aria-label={"Abrir sacola com " + count + (count === 1 ? " item" : " itens")}><span className="account-cart-icon"><ShoppingBag size={20}/><i>{count}</i></span><span className="account-cart-copy"><b>Sua sacola</b><small>{count ? `${count} ${count === 1 ? "item" : "itens"} · ${money(total)}` : "Confira seus itens e finalize"}</small></span><ArrowRight className="account-cart-arrow" size={17}/></button><button className="account-signout" onClick={signOut}>Sair da conta</button></div>
      <div className={"tracking-results" + (customerOrders.length === 1 && profile ? " single-result" : "")}>
      {customerOrders.length ? <div className="track-list">{customerOrders.map((o) => <article className="order-card" key={o.id}><header><div><small>PEDIDO #{o.id}</small><h2>{o.tipo_entrega === "retirada" ? "Retirada no restaurante" : "Entrega no seu endereço"}</h2></div><span className={"status " + status(o.status)[1]}><i/>{label(o.status)}</span></header><OrderJourney order={o}/><div className="order-lines">{(o.ItemPedidos || []).map((line) => <div key={line.id}><span><b>{line.quantidade}×</b> {line.Prato?.nome}</span><strong>{money(Number(line.Prato?.preco || 0) * line.quantidade)}</strong></div>)}</div><footer><span><Clock3 size={15}/> {new Date(o.data_hora).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</span>{!["cancelado", "concluido"].includes(o.status) && <button onClick={async () => { setBusy(true); try { await api("/pedidos/" + o.id, { method: "DELETE" }); await lookup(); notify("Pedido cancelado") } catch (err) { setError(err.message) } finally { setBusy(false) } }}>Cancelar pedido</button>}</footer></article>)}</div> : <div className="track-empty"><PackageCheck/><h3>Seu próximo momento gostoso começa aqui.</h3><p>Depois de fazer um pedido, ele aparece nesta área.</p><button className="btn dark" onClick={store}>Ver cardápio <ArrowRight size={16}/></button></div>}
      {profile && <section className="profile-card"><div><small>SEU CADASTRO</small><h2>Seus dados</h2><span className="profile-code">{profile.codigo_cliente}</span></div><form onSubmit={saveProfile}><label className="field">Nome<input name="nome" defaultValue={profile.nome} required/></label><label className="field">Telefone<input name="telefone" defaultValue={profile.telefone} required/></label><label className="field">Endereço<input name="endereco" defaultValue={profile.endereco} required/></label><button className="btn dark" disabled={busy}>Salvar alterações</button><button type="button" className="delete-account" onClick={deleteProfile} disabled={busy}>Excluir cadastro</button></form></section>}
      </div>
    </main>}

    {page === "admin" && <main className="admin"><div className="admin-heading"><div><span className="kicker"><i/> ÁREA DA EQUIPE</span><h1>Bom dia, <em>Mesa.</em></h1><p>Um resumo da casa, pra deixar tudo no ponto.</p></div><span className="online"><i/> Painel da cozinha · {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span></div><section className="sales-filter"><div><b>Período das vendas</b><small>Filtra os pedidos recebidos e o resumo de vendas.</small></div><div className="sales-presets">{[["day","Hoje"],["week","Esta semana"],["month","Este mês"],["custom","Personalizado"]].map(([value,labelText])=><button className={salesPeriod===value?"active":""} key={value} onClick={()=>setSalesPeriod(value)}>{labelText}</button>)}</div>{salesPeriod === "custom" && <div className="sales-dates"><label>De<input type="datetime-local" value={salesFrom} onChange={(e)=>setSalesFrom(e.target.value)}/></label><label>Até<input type="datetime-local" value={salesTo} onChange={(e)=>setSalesTo(e.target.value)}/></label></div>}</section><section className="stats"><div><ShoppingBag/><small>Pedidos no período</small><b>{periodOrders.length.toString().padStart(2, "0")}</b></div><div><ChefHat/><small>Em preparo</small><b>{periodOrders.filter((x) => x.status === "em_preparacao").length.toString().padStart(2, "0")}</b></div><div><Utensils/><small>Pratos ativos</small><b>{dishes.filter((x) => x.disponivel).length.toString().padStart(2, "0")}</b></div><div><BadgeCheck/><small>Vendas registradas*</small><b>{money(periodSales)}</b></div></section>
      <div className="admin-grid"><section className="admin-panel"><div className="panel-head"><div><small>OPERAÇÃO</small><h2>Pedidos recebidos <i>{periodOrders.length}</i></h2><small className={"orders-sync" + (ordersSyncError ? " failed" : "")}>{ordersSyncError ? "Falha na atualização automática. " : "Atualiza automaticamente a cada 8 segundos. "}{ordersLastUpdated ? `Última atualização: ${ordersLastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Aguardando primeira atualização…"}</small></div><button onClick={() => loadOrders(true)} disabled={ordersLoading}>{ordersLoading ? "Atualizando…" : "Atualizar ↻"}</button></div>{periodOrders.length ? <div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Data e hora</th><th>Status</th><th>Atualizar</th></tr></thead><tbody>{periodOrders.map((o) => <Fragment key={o.id}><tr><td><b>#{o.id}</b><small>{o.tipo_entrega === "retirada" ? "Retirada" : "Entrega"}</small></td><td>{o.Cliente?.nome}<small>{o.Cliente?.codigo_cliente} · {o.Cliente?.telefone}</small></td><td>{(o.ItemPedidos || []).reduce((s, l) => s + l.quantidade, 0)} itens<small>{(o.ItemPedidos || []).map((l) => l.Prato?.nome).join(", ")}</small></td><td>{new Date(o.data_hora).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td><td><span className={"status " + status(o.status)[1]}><i/>{label(o.status)}</span></td><td><select value={o.status} disabled={busy} onChange={(e) => changeStatus(o.id, e.target.value)}><option value="recebido">Recebido</option><option value="em_preparacao">Em preparo</option><option value="saiu_para_entrega">Saiu para entrega</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></td></tr><tr className="items-row"><td colSpan="6"><details><summary>Conferir e corrigir itens do pedido</summary><div>{(o.ItemPedidos || []).map((line) => <span key={line.id}><b>{line.quantidade}× {line.Prato?.nome}</b><button disabled={busy} onClick={() => editOrderItem(line)}>Alterar quantidade</button><button disabled={busy} onClick={() => deleteOrderItem(line)}>Remover</button></span>)}<button className="add-order-item" disabled={busy} onClick={() => addOrderItem(o)}><Plus size={14}/> Adicionar item</button></div></details></td></tr></Fragment>)}</tbody></table></div> : <div className="empty-admin">🍽️<b>Nenhum pedido neste período</b><small>Ajuste o intervalo para ver outros pedidos.</small></div>}</section>
      <section className="admin-panel"><div className="panel-head"><div><small>CARDÁPIO</small><h2>Pratos da casa <i>{dishes.length}</i></h2></div><button className="add" onClick={() => setDishForm({})}><Plus size={15}/> Novo prato</button></div><div className="dish-admin">{dishes.map((d) => <div key={d.id}>{d.imagem_url ? <img className="admin-dish-image" src={imageSource(d.imagem_url)} alt=""/> : <span className="admin-emoji">{emoji(d.nome)}</span>}<span className="dish-admin-name"><b>{d.nome}</b><small>{money(d.preco)} · {category(d.nome,d.categoria)}</small></span><button className={"toggle " + (d.disponivel ? "on" : "")} onClick={() => toggleDish(d)}>{d.disponivel ? "Ativo" : "Pausado"}</button><button className="mini" onClick={() => setDishForm(d)} title="Editar prato"><SlidersHorizontal size={15}/></button><button className="mini remove" onClick={() => removeDish(d)} title="Excluir prato"><Trash2 size={15}/></button></div>)}</div><p className="history-note"><ShieldCheck size={14}/> Pratos em pedidos anteriores não podem ser apagados. Pause a disponibilidade para preservar o histórico.</p><small className="disclaimer">*Estimativa pelos preços atuais; a API não guarda o preço histórico do pedido.</small></section><section className="admin-panel customers-panel"><div className="panel-head"><div><small>RELACIONAMENTO</small><h2>Clientes <i>{customers.length}</i></h2></div><input className="customer-search" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Buscar por código, nome ou telefone"/></div><div className="customer-list">{shownCustomers.length ? shownCustomers.map((c) => <div key={c.id}><span className="customer-avatar">{c.nome?.trim().charAt(0).toUpperCase() || "C"}</span><span className="customer-data"><b>{c.codigo_cliente}</b><small>{c.nome} · {c.telefone}</small></span><button disabled={busy} onClick={() => openCustomerHistory(c)}>Ver histórico <ArrowRight size={14}/></button></div>) : <p className="customers-empty">Nenhum cliente encontrado.</p>}</div></section></div>
    </main>}

    {page === "menu" && count > 0 && !drawer && !checkout && <aside className="mini-cart" aria-label="Resumo da sacola"><div className="mini-cart-title"><ShoppingBag size={20}/><span><b>Sua sacola <i>{count}</i></b><small>{authCustomer ? `Conta: ${authCustomer.codigo_cliente}` : "Visitante · entre ou crie uma conta para pedir"}</small></span></div><div className="mini-cart-lines">{lines.map((line) => <div className="mini-cart-line" key={line.id}><span>{line.qty}× {line.nome}</span><b>{money(line.preco * line.qty)}</b></div>)}</div><div className="mini-cart-total"><span>Subtotal <b>{money(total)}</b></span><button onClick={() => setDrawer(true)}>Ver sacola <ArrowRight size={16}/></button></div></aside>}
    <footer className="footer"><div className="footer-brand"><button className="logo" onClick={store}><span className="logo-icon"><ForkKnife size={17}/></span><span>Mesa<span className="dot">.</span><small>COZINHA DE BAIRRO</small></span></button><p>Comida de verdade, feita com calma e servida com carinho.</p><span className="footer-hours"><Clock3 size={15}/> Terça a domingo · 11h às 22h</span></div><div className="footer-links"><b>Explore</b><button onClick={()=>{store();setTimeout(()=>document.getElementById("menu")?.scrollIntoView({behavior:"smooth"}),0)}}>Cardápio completo</button><button onClick={()=>{store();setFilter("Sobremesas");setTimeout(()=>document.getElementById("menu")?.scrollIntoView({behavior:"smooth"}),0)}}>Sobremesas</button><button onClick={()=>{store();setFilter("Bebidas");setTimeout(()=>document.getElementById("menu")?.scrollIntoView({behavior:"smooth"}),0)}}>Bebidas</button></div><div className="footer-links"><b>Atendimento</b><button onClick={tracking}>Acompanhar pedido</button><span>Entrega ou retirada</span><span>São Paulo, SP</span></div><div className="footer-links"><b>Para a equipe</b><button onClick={admin}>Área do restaurante <ArrowRight size={14}/></button><span>Pedidos e cardápio</span><span>© 2026 Mesa Cozinha de Bairro</span></div></footer>

    {drawer && <><button className="shade" onClick={() => setDrawer(false)} aria-label="Fechar sacola"/><aside className="drawer"><header><div><small>SEU PEDIDO</small><h2>Sua sacola <i>{count}</i></h2></div><button onClick={() => setDrawer(false)}><X/></button></header>{lines.length ? <><div className="cart-lines">{lines.map((x) => <div key={x.id}>{x.imagem_url ? <img className="cart-photo" src={imageSource(x.imagem_url)} alt=""/> : <span className="cart-emoji">{emoji(x.nome)}</span>}<span className="cart-desc"><b>{x.nome}</b><small>{money(x.preco)}</small><span className="qty"><button onClick={() => quantity(x.id, -1)}><Minus size={12}/></button>{x.qty}<button onClick={() => quantity(x.id, 1)}><Plus size={12}/></button></span></span><strong>{money(x.preco * x.qty)}</strong></div>)}</div><div className="drawer-bottom"><p><Bike size={17}/> Entrega ou retirada <small>Você escolhe no próximo passo</small></p><div className="total"><span>Subtotal</span><b>{money(total)}</b></div><small className="tax">{authCustomer ? `Conectado como ${authCustomer.codigo_cliente}` : "Visitante: entre ou crie uma conta para finalizar."}</small><button className="btn dark full" onClick={beginCheckout}>{authCustomer ? "Continuar para checkout" : "Entrar ou criar conta"} <ArrowRight size={16}/></button></div></> : <div className="empty-cart"><ShoppingBag/><h3>Sua sacola está esperando.</h3><p>Escolha algo gostoso do cardápio.</p><button className="btn dark" onClick={() => { setDrawer(false); store() }}>Ver cardápio</button></div>}</aside></>}

    {checkout && <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && setCheckout(false)}><section className="modal"><div className="modal-top"><span><PackageCheck/></span><button onClick={() => setCheckout(false)}><X/></button></div><span className="kicker dark"><i/> SÓ MAIS UM PASSO</span><h2>Vamos preparar<br/>seu <em>pedido.</em></h2><p>Confira seus dados e escolha como receber.</p><form onSubmit={placeOrder}><fieldset><legend>Como prefere?</legend><label><input type="radio" name="tipo_entrega" value="entrega" defaultChecked/><span><Bike/> Entrega<small>{authCustomer?.endereco || "Receba em casa"}</small></span></label><label><input type="radio" name="tipo_entrega" value="retirada"/><span><Store/> Retirada<small>Busque na cozinha</small></span></label></fieldset><div className="signed-in-note"><ShieldCheck size={17}/><span><b>{authCustomer?.nome}</b><small>{authCustomer?.codigo_cliente} · {authCustomer?.telefone}</small></span></div><div className="total"><span>{count} itens · Total</span><b>{money(total)}</b></div><button className="btn dark full" disabled={busy}>{busy ? "Enviando pedido…" : "Confirmar pedido"} <ArrowRight size={16}/></button><small className="privacy"><ShieldCheck size={14}/> Pedido vinculado à sua conta.</small></form></section></div>}

    {authModal && <div className="modal-wrap" onMouseDown={(e)=>e.target===e.currentTarget&&setAuthModal(false)}><section className="modal auth-modal"><div className="modal-top"><span><Users/></span><button onClick={()=>setAuthModal(false)}><X/></button></div><span className="kicker dark"><i/> ÁREA DO CLIENTE</span><h2>{authMode === "login" ? "Que bom ter você de volta." : "Crie sua conta Mesa."}</h2><p>{authMode === "login" ? "Entre para ver seus pedidos ou finalizar a sacola." : "Cadastre seus dados uma vez e acompanhe seus pedidos."}</p><form onSubmit={submitAuth}>{authMode === "register" ? <><label className="field">Nome completo<input name="nome" required autoComplete="name"/></label><label className="field">Telefone<input name="telefone" required type="tel" autoComplete="tel"/></label><label className="field">Endereço<input name="endereco" required autoComplete="street-address"/></label></> : <label className="field">Código de cliente<input name="codigo_cliente" required placeholder="MESA-A1B2C3D4" defaultValue={customerId} autoComplete="username"/></label>}<label className="field">Senha<input name="senha" required type="password" minLength="8" autoComplete={authMode === "login" ? "current-password" : "new-password"}/>{authMode === "register" && <small>Use pelo menos 8 caracteres.</small>}</label><button className="btn dark full" disabled={busy}>{busy ? "Aguarde…" : authMode === "login" ? "Entrar" : "Criar conta"} <ArrowRight size={16}/></button></form><button className="auth-switch" onClick={()=>setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Ainda não tem conta? Criar agora" : "Já tem conta? Entrar"}</button></section></div>}

    {selectedDish && <div className="modal-wrap" onMouseDown={(e)=>e.target===e.currentTarget&&setSelectedDish(null)}><section className="modal dish-detail-modal" role="dialog" aria-modal="true" aria-label={"Detalhes de " + selectedDish.nome}><div className="modal-top"><span><Utensils/></span><button onClick={()=>setSelectedDish(null)} aria-label="Fechar detalhes"><X/></button></div><div className="dish-detail-art">{artwork(selectedDish, 0)}</div><span className="kicker dark"><i/> {category(selectedDish.nome, selectedDish.categoria).toUpperCase()}</span><h2>{selectedDish.nome}</h2><p>{selectedDish.descricao || "Preparado na hora com ingredientes frescos e muito carinho."}</p><div className="dish-detail-footer"><b>{money(selectedDish.preco)}</b><button className="btn dark" onClick={()=>{ quantity(selectedDish.id, 1); setSelectedDish(null); notify(selectedDish.nome + " adicionado à sacola") }}><Plus size={17}/> Adicionar à sacola</button></div></section></div>}

    {dishForm && <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && setDishForm(null)}><section className="modal small-modal"><div className="modal-top"><span><Utensils/></span><button onClick={() => setDishForm(null)}><X/></button></div><span className="kicker dark"><i/> GESTÃO DO CARDÁPIO</span><h2>{dishForm.id ? "Editar prato" : "Novo prato"}</h2><p>Uma boa descrição abre o apetite.</p><form onSubmit={editDish}><div className="photo-picker">{dishForm.imagem_url ? <img src={imageSource(dishForm.imagem_url)} alt="Prévia do prato"/> : <span>🍽️</span>}<label className="field">Foto do prato<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={busy}/></label><small>JPEG, PNG ou WebP. A foto será otimizada ao enviar.</small></div><label className="field">Nome do prato<input name="nome" defaultValue={dishForm.nome || ""} required placeholder="Ex.: Frango da horta"/></label><label className="field">Descrição<textarea name="descricao" defaultValue={dishForm.descricao || ""} rows="3" placeholder="Ingredientes e acompanhamento…"/></label><label className="field">Categoria<select name="categoria" defaultValue={dishForm.categoria || "Pratos principais"}><option>Pratos principais</option><option>Sobremesas</option><option>Bebidas</option></select></label><label className="check-field"><input name="destaque" type="checkbox" defaultChecked={dishForm.destaque ?? false}/> <span><b>Exibir em Nosso Prato da Casa</b><small>Prioriza este prato no carrossel de destaques.</small></span></label><label className="field">Preço (R$)<input name="preco" type="number" min="0" step="0.01" defaultValue={dishForm.preco ?? ""} required/></label><label className="check-field"><input name="disponivel" type="checkbox" defaultChecked={dishForm.disponivel ?? true}/> <span><b>Disponível no cardápio</b><small>Clientes podem ver e pedir este prato.</small></span></label><button className="btn dark full" disabled={busy}>{busy ? "Salvando…" : dishForm.id ? "Salvar alterações" : "Adicionar ao cardápio"} <ArrowRight size={16}/></button></form></section></div>}
    {customerHistory && <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && setCustomerHistory(null)}><section className="modal history-modal"><div className="modal-top"><span><Users/></span><button onClick={() => setCustomerHistory(null)}><X/></button></div><span className="kicker dark"><i/> HISTÓRICO DO CLIENTE</span><h2>{customerHistory.customer.codigo_cliente}</h2><p>{customerHistory.customer.nome} · {customerHistory.customer.telefone}<br/>{customerHistory.customer.endereco}</p><div className="history-orders">{customerHistory.orders.length ? customerHistory.orders.map((o) => <article key={o.id}><header><strong>Pedido #{o.id}</strong><span className={"status " + status(o.status)[1]}><i/>{label(o.status)}</span></header><small>{new Date(o.data_hora).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })} · {o.tipo_entrega === "retirada" ? "Retirada" : "Entrega"}</small>{(o.ItemPedidos || []).map((line) => <div key={line.id}><span>{line.quantidade}× {line.Prato?.nome}</span><b>{money(Number(line.Prato?.preco || 0) * line.quantidade)}</b></div>)}</article>) : <div className="customers-empty">Este cliente ainda não tem pedidos.</div>}</div></section></div>}
    {toast && <div className="toast"><BadgeCheck size={17}/>{toast}<button onClick={() => setToast("")}><X size={15}/></button></div>}
  </div>
}
