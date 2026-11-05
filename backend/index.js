const path = require("path")
const fs = require("fs/promises")
const crypto = require("crypto")
const express = require("express")
const { Sequelize, DataTypes, Op } = require("sequelize")

const app = express()
const UPLOADS_DIR = path.join(__dirname, "uploads")
// Allow the separate React development server to call the API. Set CORS_ORIGINS
// to a comma-separated list of trusted frontend origins in other environments.
// Permite que o servidor React separado acesse a API. Configure CORS_ORIGINS
// com uma lista de origens confiáveis nos demais ambientes.
const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS || "http://localhost:3000,http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
)
app.use((req, res, next) => {
    const origin = req.get("Origin")
    if (origin && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin)
        res.setHeader("Vary", "Origin")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    }
    if (req.method === "OPTIONS") return res.sendStatus(204)
    return next()
})
// Parse incoming JSON request bodies so route handlers can read req.body.
// Analisa os corpos das requisições JSON para que as rotas possam ler req.body.
app.use(express.json())
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1d" }))
// Allow a custom port for local development and isolated verification; default to 8080.
// Permite definir uma porta personalizada para desenvolvimento local; o padrão é 8080.
const PORT = Number(process.env.PORT) || 8080

// Keep the database beside this file even when the server starts elsewhere.
// Mantém o banco de dados ao lado deste arquivo, mesmo quando o servidor é iniciado de outra pasta.
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: path.join(__dirname, "restaurante.db"),
    logging: false
})

// Menu table: stores each dish's name, description, price, and order availability.
// Tabela do cardápio: armazena nome, descrição, preço e disponibilidade de cada prato.
const Prato = sequelize.define("Prato", {
    nome: { type: DataTypes.STRING, allowNull: false },
    descricao: { type: DataTypes.STRING, allowNull: true },
    preco: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
    categoria: { type: DataTypes.STRING, allowNull: false, defaultValue: "Pratos principais", validate: { isIn: [["Pratos principais", "Sobremesas", "Bebidas"]] } },
    imagem_url: { type: DataTypes.STRING, allowNull: true },
    destaque: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    disponivel: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
})

// Customer table: stores the contact and delivery details used when placing an order.
// Tabela de clientes: armazena os dados de contato e entrega usados nos pedidos.
const Cliente = sequelize.define("Cliente", {
    // Public customer code; the numeric primary key remains internal to the relationships.
    // Código público do cliente; o identificador numérico permanece interno aos relacionamentos.
    codigo_cliente: { type: DataTypes.STRING, allowNull: false },
    nome: { type: DataTypes.STRING, allowNull: false },
    telefone: { type: DataTypes.STRING, allowNull: false },
    endereco: { type: DataTypes.STRING, allowNull: false },
    senha_hash: { type: DataTypes.STRING, allowNull: true }
})

// Order table: records who ordered, when they ordered, and the current progress status.
// Tabela de pedidos: registra quem fez o pedido, quando foi feito e seu status atual.
const Pedido = sequelize.define("Pedido", {
    data_hora: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // Nullable in the model for legacy rows; new orders must provide this in POST /pedidos.
    // Aceita valor nulo em registros antigos; novos pedidos devem informar este campo em POST /pedidos.
    tipo_entrega: { type: DataTypes.STRING, allowNull: true },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "recebido",
        validate: { isIn: [["recebido", "em_preparacao", "saiu_para_entrega", "concluido", "cancelado"]] }
    }
})

// Order line table: joins one order to a dish and records how many were requested.
// Tabela de itens do pedido: relaciona um pedido a um prato e registra a quantidade solicitada.
const ItemPedido = sequelize.define("ItemPedido", {
    quantidade: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } }
})
const AppConfig = sequelize.define("AppConfig", {
    key: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.STRING, allowNull: false }
})

// A customer can place many orders. Orders with customer history cannot be orphaned.
// Um cliente pode fazer vários pedidos. O histórico não permite pedidos sem cliente relacionado.
Cliente.hasMany(Pedido, { foreignKey: { name: "id_cliente", allowNull: false }, onDelete: "RESTRICT" })
Pedido.belongsTo(Cliente, { foreignKey: { name: "id_cliente", allowNull: false } })
// Deleting an order removes its line items; dishes referenced by order history are protected.
// Excluir um pedido remove seus itens; pratos presentes no histórico de pedidos ficam protegidos.
Pedido.hasMany(ItemPedido, { foreignKey: { name: "id_pedido", allowNull: false }, onDelete: "CASCADE" })
ItemPedido.belongsTo(Pedido, { foreignKey: { name: "id_pedido", allowNull: false } })
Prato.hasMany(ItemPedido, { foreignKey: { name: "id_prato", allowNull: false }, onDelete: "RESTRICT" })
ItemPedido.belongsTo(Prato, { foreignKey: { name: "id_prato", allowNull: false } })

// Only these status values are accepted when the restaurant updates an order.
// Estes são os únicos status aceitos quando o restaurante atualiza um pedido.
const STATUSES = ["recebido", "em_preparacao", "saiu_para_entrega", "concluido", "cancelado"]
// The first version supports delivery to the customer's saved address or customer pickup.
// A primeira versão permite entrega no endereço salvo do cliente ou retirada no restaurante.
const FULFILLMENT_TYPES = ["entrega", "retirada"]
const DISH_CATEGORIES = ["Pratos principais", "Sobremesas", "Bebidas"]
const CURATED_FEATURED_DISHES = [
    { nome: "Frango da Horta", descricao: "Peito de frango grelhado, polenta cremosa, tomates confitados e molho fresco de ervas.", categoria: "Pratos principais", preco: 42.90, imagem_url: "images/destaque-frango-horta.png" },
    { nome: "Nhoque Dourado de Cogumelos", descricao: "Nhoque de mandioquinha na manteiga de sálvia, ragu de cogumelos e parmesão curado.", categoria: "Pratos principais", preco: 39.90, imagem_url: "images/destaque-nhoque-cogumelos.png" },
    { nome: "Salmão do Mercado", descricao: "Salmão selado, purê de batata-baroa, legumes tostados e molho cítrico de ervas.", categoria: "Pratos principais", preco: 58.90, imagem_url: "images/destaque-salmao-mercado.png" },
    { nome: "Lasanha da Nonna", descricao: "Camadas de massa fresca, ragu de tomate e carne, béchamel leve e queijo gratinado.", categoria: "Pratos principais", preco: 44.90, imagem_url: "images/destaque-lasanha-nonna.png" },
    { nome: "Pudim de Leite com Baunilha", descricao: "Pudim artesanal de baunilha com calda de caramelo âmbar e frutas vermelhas.", categoria: "Sobremesas", preco: 18.90, imagem_url: "images/destaque-pudim-baunilha.png" }
]
const CURATED_MENU_EXTRAS = [
    { nome: "Bolo de Chocolate da Casa", descricao: "Fatia de bolo úmido com ganache de chocolate meio amargo e frutas vermelhas.", categoria: "Sobremesas", preco: 19.90, imagem_url: "images/sobremesa-bolo-chocolate.png" },
    { nome: "Torta de Pera e Amêndoas", descricao: "Massa amanteigada, peras assadas, creme de baunilha e amêndoas tostadas.", categoria: "Sobremesas", preco: 17.90, imagem_url: "images/sobremesa-torta-pera.png" },
    { nome: "Chá Gelado de Hibisco", descricao: "Hibisco artesanal com frutas vermelhas, servido gelado com hortelã.", categoria: "Bebidas", preco: 12.90, imagem_url: "images/bebida-cha-hibisco.png" },
    { nome: "Suco de Laranja Natural", descricao: "Laranjas frescas espremidas na hora, sem adição de açúcar.", categoria: "Bebidas", preco: 10.90, imagem_url: "images/bebida-suco-laranja.png" },
    { nome: "Café e Cappuccino", descricao: "Espresso encorpado ou cappuccino cremoso com leite vaporizado.", categoria: "Bebidas", preco: 8.90, imagem_url: "images/bebida-cafe-cappuccino.png" }
]
// Shared joins used to return a complete order with its customer, dishes, and quantities.
// Relacionamentos compartilhados para retornar o pedido com cliente, pratos e quantidades.
const ORDER_INCLUDE = [
    { model: Cliente, attributes: { exclude: ["senha_hash"] } },
    { model: ItemPedido, include: [Prato] }
]

// Convert an incoming ID to a positive integer, or return null when it is invalid.
// Converte o identificador recebido em um inteiro positivo ou retorna nulo se for inválido.
function positiveId(value) {
    const id = Number(value)
    return Number.isInteger(id) && id > 0 ? id : null
}

function inferDishCategory(name = "") {
    if (/bolo|doce|pudim|brownie|torta|sobremesa/i.test(name)) return "Sobremesas"
    if (/suco|cafe|café|bebida|chá|refrigerante/i.test(name)) return "Bebidas"
    return "Pratos principais"
}

function customerIdentifier(value) {
    const id = positiveId(value)
    if (id) return { id }
    const code = String(value || "").trim().toUpperCase()
    return /^MESA-[A-F0-9]{8}$/.test(code) ? { codigo_cliente: code } : null
}

async function findCustomer(value, options = {}) {
    const identifier = customerIdentifier(value)
    if (!identifier) return null
    return identifier.id
        ? Cliente.findByPk(identifier.id, options)
        : Cliente.findOne({ ...options, where: { ...(options.where || {}), codigo_cliente: identifier.codigo_cliente } })
}

async function generateCustomerCode() {
    let code
    do {
        code = "MESA-" + crypto.randomBytes(4).toString("hex").toUpperCase()
    } while (await Cliente.findOne({ where: { codigo_cliente: code } }))
    return code
}

const TOKEN_SECRET = process.env.TOKEN_SECRET || "mesa-dev-secret-change-before-deploy"
function signToken(customer) {
    const payload = Buffer.from(JSON.stringify({ id: customer.id, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url")
    const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url")
    return payload + "." + signature
}
function verifyToken(token) {
    if (!token || !token.includes(".")) return null
    const [payload, signature] = token.split(".")
    const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest()
    let supplied
    try { supplied = Buffer.from(signature, "base64url") } catch { return null }
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null
    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString())
        return data.exp > Date.now() ? data : null
    } catch { return null }
}
function requireCustomer(req, res, next) {
    const token = req.get("Authorization")?.replace(/^Bearer\s+/i, "")
    const session = verifyToken(token)
    if (!session) return res.status(401).json({ error: "Entre na sua conta para continuar." })
    req.customerSession = session
    return next()
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") }
}
function passwordMatches(password, encoded) {
    if (!encoded) return false
    const [salt, hash] = encoded.split(":")
    const actual = crypto.scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, "hex")
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected)
}
function safeCustomer(customer) {
    const data = customer.toJSON()
    delete data.senha_hash
    return data
}

// Reject missing, array, or primitive JSON bodies where an object is expected.
// Rejeita corpos JSON ausentes, em formato de lista ou de valor simples quando se espera um objeto.
function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

// Send one consistent 404 response when a requested database record does not exist.
// Envia uma resposta 404 padronizada quando o registro solicitado não existe no banco de dados.
function sendNotFound(res, entity) {
    return res.status(404).json({ error: `${entity} não encontrado` })
}

// Copy only allowed properties from a request, preventing callers from changing IDs or timestamps.
// Copia apenas os campos permitidos, impedindo alterações indevidas em identificadores e datas.
function pick(body, fields) {
    const result = {}
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) result[field] = body[field]
    }
    return result
}

// Save an uploaded dish photo outside the database and return its public API path.
// Salva a foto do prato fora do banco e retorna o caminho público da API.
app.post("/uploads/pratos", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Envie uma imagem JPEG, PNG ou WebP" })
    }
    const type = req.get("Content-Type")?.split(";")[0].toLowerCase()
    const signatures = {
        "image/jpeg": req.body[0] === 0xff && req.body[1] === 0xd8 && req.body[2] === 0xff,
        "image/png": req.body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        "image/webp": req.body.toString("ascii", 0, 4) === "RIFF" && req.body.toString("ascii", 8, 12) === "WEBP"
    }
    if (!signatures[type]) return res.status(400).json({ error: "O arquivo não corresponde a uma imagem JPEG, PNG ou WebP válida" })
    const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[type]
    const filename = crypto.randomBytes(16).toString("hex") + extension
    await fs.mkdir(UPLOADS_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOADS_DIR, filename), req.body)
    return res.status(201).json({ imagem_url: "/uploads/" + filename })
})

// Back Office (BKO): create a menu dish, defaulting it to available unless specified otherwise.
// Back Office (BKO): cadastra um prato e o define como disponível, salvo indicação contrária.
app.post("/pratos", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do prato em JSON" })
    const data = pick(req.body, ["nome", "descricao", "preco", "categoria", "imagem_url", "destaque", "disponivel"])
    if (data.categoria && !DISH_CATEGORIES.includes(data.categoria)) return res.status(400).json({ error: `categoria deve ser uma destas opções: ${DISH_CATEGORIES.join(", ")}` })
    const prato = await Prato.create(data)
    return res.status(201).json(prato)
})

// Public menu: list available dishes. The Back Office uses ?todos=true to manage unavailable dishes too.
// Cardápio público: lista pratos disponíveis. O Back Office usa ?todos=true para incluir os indisponíveis.
app.get("/pratos", async (req, res) => {
    const options = { order: [["nome", "ASC"]] }
    if (req.query.todos !== "true") options.where = { disponivel: true }
    const pratos = await Prato.findAll(options)
    return res.json(pratos)
})

// Featured menu: rank currently available dishes by quantity in non-cancelled orders.
app.get("/pratos/destaques", async (_req, res) => {
    const disponiveis = await Prato.findAll({ where: { disponivel: true } })
    const pedidos = await Pedido.findAll({
        where: { status: { [Op.ne]: "cancelado" } },
        include: [{ model: ItemPedido, attributes: ["quantidade"], include: [{ model: Prato, attributes: ["id"], where: { disponivel: true } }] }]
    })
    const sold = new Map()
    for (const pedido of pedidos) for (const item of pedido.ItemPedidos || []) {
        const id = item.Prato?.id
        if (id) sold.set(id, (sold.get(id) || 0) + item.quantidade)
    }
    disponiveis.sort((a, b) => Number(b.destaque) - Number(a.destaque) || (sold.get(b.id) || 0) - (sold.get(a.id) || 0) || a.nome.localeCompare(b.nome, "pt-BR"))
    return res.json(disponiveis.slice(0, 5).map((dish) => ({ ...dish.toJSON(), unidades_vendidas: sold.get(dish.id) || 0 })))
})

// Read one dish by ID for menu details or the Back Office edit screen.
// Busca um prato pelo ID para detalhes do cardápio ou para a tela de edição do Back Office.
app.get("/pratos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de prato inválido" })
    const prato = await Prato.findByPk(id)
    if (!prato) return sendNotFound(res, "Prato")
    return res.json(prato)
})

// Back Office (BKO): edit a dish's menu details or availability.
// Back Office (BKO): altera os dados do prato ou sua disponibilidade no cardápio.
app.put("/pratos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de prato inválido" })
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do prato em JSON" })
    const prato = await Prato.findByPk(id)
    if (!prato) return sendNotFound(res, "Prato")
    const data = pick(req.body, ["nome", "descricao", "preco", "categoria", "imagem_url", "destaque", "disponivel"])
    if (data.categoria && !DISH_CATEGORIES.includes(data.categoria)) return res.status(400).json({ error: `categoria deve ser uma destas opções: ${DISH_CATEGORIES.join(", ")}` })
    await prato.update(data)
    return res.json(prato)
})

// Back Office (BKO): remove a dish only when no order history references it.
// Back Office (BKO): exclui o prato somente quando nenhum pedido do histórico faz referência a ele.
app.delete("/pratos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de prato inválido" })
    const prato = await Prato.findByPk(id)
    if (!prato) return sendNotFound(res, "Prato")
    const linkedOrders = await ItemPedido.count({ where: { id_prato: id } })
    if (linkedOrders > 0) {
        return res.status(409).json({ error: "Este prato faz parte do histórico de pedidos e não pode ser excluído. Marque-o como indisponível para removê-lo do cardápio." })
    }
    try {
        await prato.destroy()
    } catch (err) {
        if (err.name === "SequelizeForeignKeyConstraintError") {
            return res.status(409).json({ error: "Este prato está vinculado a um pedido. Marque-o como indisponível para removê-lo do cardápio." })
        }
        throw err
    }
    return res.json({ message: `Prato ${id} excluído` })
})

// Customer account registration and login use a salted scrypt password hash and signed session token.
app.post("/auth/register", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do cadastro em JSON" })
    const { nome, telefone, endereco, senha } = req.body
    if (![nome, telefone, endereco].every((value) => typeof value === "string" && value.trim()) || typeof senha !== "string" || senha.length < 8) {
        return res.status(400).json({ error: "Informe nome, telefone, endereço e uma senha com pelo menos 8 caracteres." })
    }
    const { salt, hash } = hashPassword(senha)
    const cliente = await Cliente.create({
        nome: nome.trim(), telefone: telefone.trim(), endereco: endereco.trim(),
        senha_hash: salt + ":" + hash,
        codigo_cliente: await generateCustomerCode()
    })
    return res.status(201).json({ cliente: safeCustomer(cliente), token: signToken(cliente) })
})

app.post("/auth/login", async (req, res) => {
    if (!isObject(req.body) || typeof req.body.codigo_cliente !== "string" || typeof req.body.senha !== "string") {
        return res.status(400).json({ error: "Informe o código do cliente e a senha." })
    }
    const cliente = await findCustomer(req.body.codigo_cliente)
    if (!cliente || !passwordMatches(req.body.senha, cliente.senha_hash)) {
        return res.status(401).json({ error: "Código ou senha incorretos. Cadastros antigos precisam criar uma conta com senha." })
    }
    return res.json({ cliente: safeCustomer(cliente), token: signToken(cliente) })
})

app.get("/auth/me", requireCustomer, async (req, res) => {
    const cliente = await Cliente.findByPk(req.customerSession.id)
    if (!cliente) return res.status(401).json({ error: "Esta conta não está mais disponível." })
    return res.json(safeCustomer(cliente))
})

app.get("/minha-conta/pedidos", requireCustomer, async (req, res) => {
    return res.json(await Pedido.findAll({
        where: { id_cliente: req.customerSession.id },
        include: [{ model: ItemPedido, include: [Prato] }],
        order: [["data_hora", "DESC"]]
    }))
})

app.put("/minha-conta", requireCustomer, async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados em JSON" })
    const cliente = await Cliente.findByPk(req.customerSession.id)
    if (!cliente) return res.status(401).json({ error: "Esta conta não está mais disponível." })
    await cliente.update(pick(req.body, ["nome", "telefone", "endereco"]))
    return res.json(safeCustomer(cliente))
})

app.delete("/minha-conta", requireCustomer, async (req, res) => {
    const cliente = await Cliente.findByPk(req.customerSession.id)
    if (!cliente) return res.status(401).json({ error: "Esta conta não está mais disponível." })
    await cliente.destroy()
    return res.json({ message: "Conta excluída" })
})

// Legacy administrative record creation; new customers should use /auth/register.
app.post("/clientes", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do cliente em JSON" })
    const cliente = await Cliente.create({ ...pick(req.body, ["nome", "telefone", "endereco"]), codigo_cliente: await generateCustomerCode() })
    return res.status(201).json(safeCustomer(cliente))
})

// List customers for restaurant-side customer management.
// Lista clientes para consulta e administração pelo restaurante.
app.get("/clientes", async (_req, res) => res.json((await Cliente.findAll()).map(safeCustomer)))

// Read one customer's saved contact and address details.
// Consulta os dados de contato e o endereço salvos de um cliente.
app.get("/clientes/:id", async (req, res) => {
    if (!customerIdentifier(req.params.id)) return res.status(400).json({ error: "Código de cliente inválido" })
    const cliente = await findCustomer(req.params.id)
    if (!cliente) return sendNotFound(res, "Cliente")
    return res.json(safeCustomer(cliente))
})

// Customer tracking: return only this customer's orders, with items and dishes.
// Acompanhamento do cliente: retorna os pedidos desse cliente, com itens e pratos.
app.get("/clientes/:id/pedidos", async (req, res) => {
    const session = verifyToken(req.get("Authorization")?.replace(/^Bearer\s+/i, ""))
    if (!session) return res.status(401).json({ error: "Entre na sua conta para consultar seus pedidos." })
    if (!customerIdentifier(req.params.id)) return res.status(400).json({ error: "Código de cliente inválido" })
    const cliente = await findCustomer(req.params.id)
    if (!cliente) return sendNotFound(res, "Cliente")
    if (cliente.id !== session.id) return res.status(403).json({ error: "Você só pode consultar seus próprios pedidos." })
    const pedidos = await Pedido.findAll({
        where: { id_cliente: cliente.id },
        include: [{ model: ItemPedido, include: [Prato] }],
        order: [["data_hora", "DESC"]]
    })
    return res.json(pedidos)
})

app.get("/backoffice/clientes/:id/pedidos", async (req, res) => {
    if (!customerIdentifier(req.params.id)) return res.status(400).json({ error: "Código de cliente inválido" })
    const cliente = await findCustomer(req.params.id)
    if (!cliente) return sendNotFound(res, "Cliente")
    const pedidos = await Pedido.findAll({ where: { id_cliente: cliente.id }, include: [{ model: ItemPedido, include: [Prato] }], order: [["data_hora", "DESC"]] })
    return res.json(pedidos)
})

// Update a customer's contact or delivery details without changing their database ID.
// Atualiza os dados de contato ou entrega do cliente sem alterar seu identificador no banco.
app.put("/clientes/:id", async (req, res) => {
    if (!customerIdentifier(req.params.id)) return res.status(400).json({ error: "Código de cliente inválido" })
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do cliente em JSON" })
    const cliente = await findCustomer(req.params.id)
    if (!cliente) return sendNotFound(res, "Cliente")
    await cliente.update(pick(req.body, ["nome", "telefone", "endereco"]))
    return res.json(safeCustomer(cliente))
})

// Delete a customer only when no order references the customer.
// Exclui o cliente somente quando nenhum pedido estiver relacionado a ele.
app.delete("/clientes/:id", async (req, res) => {
    const id = req.params.id
    if (!customerIdentifier(id)) return res.status(400).json({ error: "Código de cliente inválido" })
    const cliente = await findCustomer(id)
    if (!cliente) return sendNotFound(res, "Cliente")
    await cliente.destroy()
    return res.json({ message: `Cliente ${id} excluído` })
})

// Create the order and its dishes atomically. Require customer choice of delivery or pickup.
// Cria o pedido e seus pratos em uma única transação. Exige a escolha entre entrega e retirada.
// Request: { "id_cliente": 1, "tipo_entrega": "entrega", "itens": [{ "id_prato": 2, "quantidade": 3 }] }
// Requisição: { "id_cliente": 1, "tipo_entrega": "entrega", "itens": [{ "id_prato": 2, "quantidade": 3 }] }
app.post("/pedidos", requireCustomer, async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do pedido em JSON" })
    const idCliente = String(req.body.id_cliente || "").trim()
    const authenticatedCustomer = await Cliente.findByPk(req.customerSession.id)
    const requestedCustomer = await findCustomer(idCliente)
    if (!authenticatedCustomer || !requestedCustomer || authenticatedCustomer.id !== requestedCustomer.id) {
        return res.status(403).json({ error: "Faça o pedido usando sua própria conta." })
    }
    const tipoEntrega = req.body.tipo_entrega
    const itens = req.body.itens
    if (!customerIdentifier(idCliente)) return res.status(400).json({ error: "id_cliente deve ser um código de cliente válido" })
    if (!FULFILLMENT_TYPES.includes(tipoEntrega)) {
        return res.status(400).json({ error: `tipo_entrega deve ser um destes valores: ${FULFILLMENT_TYPES.join(", ")}` })
    }
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: "O pedido deve conter pelo menos um item" })
    }

    const validatedItems = []
    for (const item of itens) {
        const idPrato = positiveId(item && item.id_prato)
        const quantidade = Number(item && item.quantidade)
        if (!idPrato || !Number.isInteger(quantidade) || quantidade <= 0) {
            return res.status(400).json({ error: "Cada item precisa de id_prato válido e quantidade inteira maior que zero" })
        }
        validatedItems.push({ id_prato: idPrato, quantidade })
    }

    const pedido = await sequelize.transaction(async (transaction) => {
        const cliente = await findCustomer(idCliente, { transaction })
        if (!cliente) {
            const error = new Error("Cliente não encontrado")
            error.status = 404
            throw error
        }

        const pratoIds = [...new Set(validatedItems.map((item) => item.id_prato))]
        const pratos = await Prato.findAll({ where: { id: pratoIds, disponivel: true }, transaction })
        if (pratos.length !== pratoIds.length) {
            const error = new Error("Um ou mais pratos não existem ou estão indisponíveis")
            error.status = 400
            throw error
        }

        const createdPedido = await Pedido.create({
            id_cliente: cliente.id,
            tipo_entrega: tipoEntrega,
            status: "recebido"
        }, { transaction })
        await ItemPedido.bulkCreate(
            validatedItems.map((item) => ({ ...item, id_pedido: createdPedido.id })),
            { transaction }
        )
        return createdPedido
    })

    const pedidoCompleto = await Pedido.findByPk(pedido.id, { include: ORDER_INCLUDE })
    return res.status(201).json(pedidoCompleto)
})

// Restaurant view: each order includes its customer, items, quantities, and dishes.
// Visão do restaurante: cada pedido inclui o cliente, os itens, as quantidades e os pratos.
app.get("/pedidos", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
    const pedidos = await Pedido.findAll({ include: ORDER_INCLUDE, order: [["data_hora", "DESC"]] })
    return res.json(pedidos)
})

// Read a single order with all details needed by the restaurant or tracking screen.
// Busca um pedido com todos os dados necessários para o restaurante ou para o acompanhamento.
app.get("/pedidos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de pedido inválido" })
    const pedido = await Pedido.findByPk(id, { include: ORDER_INCLUDE })
    if (!pedido) return sendNotFound(res, "Pedido")
    return res.json(pedido)
})

// The restaurant changes only the order status through this endpoint.
// Esta rota permite que o restaurante altere somente o status do pedido.
app.put("/pedidos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de pedido inválido" })
    if (!isObject(req.body) || !STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: `status deve ser um destes valores: ${STATUSES.join(", ")}` })
    }
    const pedido = await Pedido.findByPk(id)
    if (!pedido) return sendNotFound(res, "Pedido")
    await pedido.update({ status: req.body.status })
    return res.json(await Pedido.findByPk(id, { include: ORDER_INCLUDE }))
})

// Cancel an order while preserving its items and history for customer tracking and restaurant records.
// Cancela o pedido sem apagar seus itens e histórico, mantendo-os para consulta do cliente e do restaurante.
app.delete("/pedidos/:id", async (req, res) => {
    const session = verifyToken(req.get("Authorization")?.replace(/^Bearer\s+/i, ""))
    if (!session) return res.status(401).json({ error: "Entre na sua conta para cancelar seu pedido." })
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de pedido inválido" })
    const pedido = await Pedido.findByPk(id)
    if (!pedido) return sendNotFound(res, "Pedido")
    if (pedido.id_cliente !== session.id) return res.status(403).json({ error: "Você só pode cancelar seus próprios pedidos." })
    await pedido.update({ status: "cancelado" })
    return res.json({ message: `Pedido ${id} cancelado`, pedido: await Pedido.findByPk(id, { include: ORDER_INCLUDE }) })
})

// Keep the item CRUD endpoints available for restaurant-side corrections.
// Mantém as rotas de cadastro, consulta, alteração e exclusão dos itens para correções do restaurante.
app.post("/itens-pedido", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do item em JSON" })
    const idPedido = positiveId(req.body.id_pedido)
    const idPrato = positiveId(req.body.id_prato)
    const quantidade = Number(req.body.quantidade)
    if (!idPedido || !idPrato || !Number.isInteger(quantidade) || quantidade <= 0) {
        return res.status(400).json({ error: "Informe IDs válidos e quantidade inteira maior que zero" })
    }
    const [pedido, prato] = await Promise.all([Pedido.findByPk(idPedido), Prato.findByPk(idPrato)])
    if (!pedido) return sendNotFound(res, "Pedido")
    if (!prato) return sendNotFound(res, "Prato")
    const item = await ItemPedido.create({ id_pedido: idPedido, id_prato: idPrato, quantidade })
    return res.status(201).json(await ItemPedido.findByPk(item.id, { include: [Prato] }))
})

// List order lines with their parent orders and dishes for restaurant review.
// Lista os itens com seus pedidos e pratos relacionados para consulta do restaurante.
app.get("/itens-pedido", async (_req, res) => {
    return res.json(await ItemPedido.findAll({ include: [Pedido, Prato] }))
})

// Read one order line with its order and dish details.
// Consulta um item do pedido com os dados do pedido e do prato relacionado.
app.get("/itens-pedido/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de item inválido" })
    const item = await ItemPedido.findByPk(id, { include: [Pedido, Prato] })
    if (!item) return sendNotFound(res, "Item do pedido")
    return res.json(item)
})

// Correct an order line's order, dish, or quantity.
// Corrige o pedido, o prato ou a quantidade de um item.
app.put("/itens-pedido/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de item inválido" })
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do item em JSON" })
    const item = await ItemPedido.findByPk(id)
    if (!item) return sendNotFound(res, "Item do pedido")
    const data = pick(req.body, ["id_pedido", "id_prato", "quantidade"])
    if ("quantidade" in data && (!Number.isInteger(Number(data.quantidade)) || Number(data.quantidade) <= 0)) {
        return res.status(400).json({ error: "quantidade deve ser um inteiro maior que zero" })
    }
    if ("id_pedido" in data && !positiveId(data.id_pedido)) return res.status(400).json({ error: "id_pedido inválido" })
    if ("id_prato" in data && !positiveId(data.id_prato)) return res.status(400).json({ error: "id_prato inválido" })
    await item.update(data)
    return res.json(await ItemPedido.findByPk(id, { include: [Pedido, Prato] }))
})

// Remove one order line when correcting an order.
// Exclui um item individual durante a correção de um pedido.
app.delete("/itens-pedido/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de item inválido" })
    const item = await ItemPedido.findByPk(id)
    if (!item) return sendNotFound(res, "Item do pedido")
    await item.destroy()
    return res.json({ message: `Item do pedido ${id} excluído` })
})

// Health check: confirms the HTTP API process is responding.
// Verificação de funcionamento: confirma que o processo da API responde às requisições HTTP.
app.get("/", (_req, res) => res.send("API do Restaurante Online funcionando"))

// Map validation, foreign-key, and unexpected errors to readable HTTP responses.
// Converte erros de validação, de chave estrangeira e inesperados em respostas HTTP compreensíveis.
app.use((err, _req, res, _next) => {
    if (res.headersSent) return
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({ error: "JSON inválido" })
    }
    if (err.status) return res.status(err.status).json({ error: err.message })
    if (err instanceof Sequelize.ValidationError) {
        return res.status(400).json({ error: err.errors.map((item) => item.message).join("; ") })
    }
    if (err instanceof Sequelize.ForeignKeyConstraintError) {
        return res.status(409).json({ error: "Registro relacionado impede esta operação" })
    }
    console.error(err)
    return res.status(500).json({ error: "Erro interno do servidor" })
})

// Connect to SQLite, create missing tables, and add the fulfillment column to older databases.
// Conecta ao SQLite, cria as tabelas ausentes e adiciona o campo de modalidade em bancos antigos.
async function startServer() {
    await sequelize.authenticate()
    await sequelize.sync()
    const queryInterface = sequelize.getQueryInterface()
    const clienteTable = Cliente.getTableName()
    const clienteColumns = await queryInterface.describeTable(clienteTable)
    if (!clienteColumns.codigo_cliente) {
        await queryInterface.addColumn(clienteTable, "codigo_cliente", {
            type: DataTypes.STRING,
            allowNull: true
        })
    }
    const refreshedCustomerColumns = await queryInterface.describeTable(clienteTable)
    if (!refreshedCustomerColumns.senha_hash) {
        await queryInterface.addColumn(clienteTable, "senha_hash", { type: DataTypes.STRING, allowNull: true })
    }
    const clientesSemCodigo = await Cliente.findAll({ where: { codigo_cliente: null } })
    for (const cliente of clientesSemCodigo) {
        await cliente.update({ codigo_cliente: await generateCustomerCode() })
    }
    const clienteIndexes = await queryInterface.showIndex(clienteTable)
    if (!clienteIndexes.some((index) => index.name === "clientes_codigo_cliente_unique")) {
        await queryInterface.addIndex(clienteTable, ["codigo_cliente"], {
            unique: true,
            name: "clientes_codigo_cliente_unique"
        })
    }
    const pratoTable = Prato.getTableName()
    const pratoColumns = await queryInterface.describeTable(pratoTable)
    if (!pratoColumns.categoria) {
        await queryInterface.addColumn(pratoTable, "categoria", {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "Pratos principais"
        })
    }
    if (!pratoColumns.imagem_url) {
        await queryInterface.addColumn(pratoTable, "imagem_url", {
            type: DataTypes.STRING,
            allowNull: true
        })
    }
    if (!pratoColumns.destaque) {
        await queryInterface.addColumn(pratoTable, "destaque", {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        })
    }
    if (!pratoColumns.categoria) {
        const pratosAntigos = await Prato.findAll()
        for (const prato of pratosAntigos) await prato.update({ categoria: inferDishCategory(prato.nome) })
    }
    // Seed the initial feature dishes once. A persistent marker prevents deleted
    // demo dishes from returning even if the Back Office later empties the menu.
    if (!await AppConfig.findByPk("featured-menu-v1")) {
      if (await Prato.count() === 0) {
        for (const dishData of CURATED_FEATURED_DISHES) {
            await Prato.create({ ...dishData, destaque: true, disponivel: true })
        }
      }
      await AppConfig.create({ key: "featured-menu-v1", value: "seeded" })
    }
    // Add the dessert and drink examples once, including for existing installations.
    // The marker keeps Back Office deletions permanent across future server restarts.
    if (!await AppConfig.findByPk("menu-extras-v1")) {
        for (const dishData of CURATED_MENU_EXTRAS) {
            if (!await Prato.findOne({ where: { nome: dishData.nome } })) {
                await Prato.create({ ...dishData, destaque: false, disponivel: true })
            }
        }
        await AppConfig.create({ key: "menu-extras-v1", value: "seeded" })
    }
    await fs.mkdir(UPLOADS_DIR, { recursive: true })
    const pedidoColumns = await queryInterface.describeTable(Pedido.getTableName())
    if (!pedidoColumns.tipo_entrega) {
        await queryInterface.addColumn(Pedido.getTableName(), "tipo_entrega", {
            type: DataTypes.STRING,
            allowNull: true
        })
    }
    app.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT}`))
}

// Report startup failures and leave a non-zero exit code so deployment tools detect them.
// Informa falhas na inicialização e define um código de saída diferente de zero para sinalizá-las.
startServer().catch((err) => {
    console.error("Não foi possível iniciar o servidor ou conectar ao SQLite:", err)
    process.exitCode = 1
})
