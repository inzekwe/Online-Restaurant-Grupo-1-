const path = require("path")
const express = require("express")
const { Sequelize, DataTypes } = require("sequelize")

const app = express()
// Parse incoming JSON request bodies so route handlers can read req.body.
// Analisa os corpos das requisições JSON para que as rotas possam ler req.body.
app.use(express.json())
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
    disponivel: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
})

// Customer table: stores the contact and delivery details used when placing an order.
// Tabela de clientes: armazena os dados de contato e entrega usados nos pedidos.
const Cliente = sequelize.define("Cliente", {
    nome: { type: DataTypes.STRING, allowNull: false },
    telefone: { type: DataTypes.STRING, allowNull: false },
    endereco: { type: DataTypes.STRING, allowNull: false }
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
// Shared joins used to return a complete order with its customer, dishes, and quantities.
// Relacionamentos compartilhados para retornar o pedido com cliente, pratos e quantidades.
const ORDER_INCLUDE = [
    { model: Cliente },
    { model: ItemPedido, include: [Prato] }
]

// Convert an incoming ID to a positive integer, or return null when it is invalid.
// Converte o identificador recebido em um inteiro positivo ou retorna nulo se for inválido.
function positiveId(value) {
    const id = Number(value)
    return Number.isInteger(id) && id > 0 ? id : null
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

// Create a dish in the restaurant's menu and default it to available unless specified otherwise.
// Cadastra um prato no cardápio e o define como disponível, salvo indicação contrária.
app.post("/pratos", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do prato em JSON" })
    const data = pick(req.body, ["nome", "descricao", "preco", "disponivel"])
    const prato = await Prato.create(data)
    return res.status(201).json(prato)
})

// List available menu dishes, or all dishes when the restaurant requests ?todos=true.
// Lista pratos disponíveis ou todos os pratos quando o restaurante usa ?todos=true.
app.get("/pratos", async (req, res) => {
    const options = { order: [["nome", "ASC"]] }
    if (req.query.todos !== "true") options.where = { disponivel: true }
    const pratos = await Prato.findAll(options)
    return res.json(pratos)
})

// Read one dish by its database ID for a menu detail or restaurant edit screen.
// Busca um prato pelo identificador para exibir detalhes ou permitir sua edição pelo restaurante.
app.get("/pratos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de prato inválido" })
    const prato = await Prato.findByPk(id)
    if (!prato) return sendNotFound(res, "Prato")
    return res.json(prato)
})

// Edit a dish's menu details or availability.
// Altera os dados de um prato ou sua disponibilidade no cardápio.
app.put("/pratos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de prato inválido" })
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do prato em JSON" })
    const prato = await Prato.findByPk(id)
    if (!prato) return sendNotFound(res, "Prato")
    await prato.update(pick(req.body, ["nome", "descricao", "preco", "disponivel"]))
    return res.json(prato)
})

// Remove a dish from inventory when no order history references it.
// Exclui um prato do cadastro quando nenhum pedido do histórico faz referência a ele.
app.delete("/pratos/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de prato inválido" })
    const prato = await Prato.findByPk(id)
    if (!prato) return sendNotFound(res, "Prato")
    await prato.destroy()
    return res.json({ message: `Prato ${id} excluído` })
})

// Register a customer before checkout, saving the details needed for order delivery.
// Cadastra o cliente antes da finalização do pedido e salva os dados necessários para a entrega.
app.post("/clientes", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do cliente em JSON" })
    const cliente = await Cliente.create(pick(req.body, ["nome", "telefone", "endereco"]))
    return res.status(201).json(cliente)
})

// List customers for restaurant-side customer management.
// Lista clientes para consulta e administração pelo restaurante.
app.get("/clientes", async (_req, res) => res.json(await Cliente.findAll()))

// Read one customer's saved contact and address details.
// Consulta os dados de contato e o endereço salvos de um cliente.
app.get("/clientes/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de cliente inválido" })
    const cliente = await Cliente.findByPk(id)
    if (!cliente) return sendNotFound(res, "Cliente")
    return res.json(cliente)
})

// Customer tracking: return only this customer's orders, with items and dishes.
// Acompanhamento do cliente: retorna os pedidos desse cliente, com itens e pratos.
app.get("/clientes/:id/pedidos", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de cliente inválido" })
    const cliente = await Cliente.findByPk(id)
    if (!cliente) return sendNotFound(res, "Cliente")
    const pedidos = await Pedido.findAll({
        where: { id_cliente: id },
        include: [{ model: ItemPedido, include: [Prato] }],
        order: [["data_hora", "DESC"]]
    })
    return res.json(pedidos)
})

// Update a customer's contact or delivery details without changing their database ID.
// Atualiza os dados de contato ou entrega do cliente sem alterar seu identificador no banco.
app.put("/clientes/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de cliente inválido" })
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do cliente em JSON" })
    const cliente = await Cliente.findByPk(id)
    if (!cliente) return sendNotFound(res, "Cliente")
    await cliente.update(pick(req.body, ["nome", "telefone", "endereco"]))
    return res.json(cliente)
})

// Delete a customer only when no order references the customer.
// Exclui o cliente somente quando nenhum pedido estiver relacionado a ele.
app.delete("/clientes/:id", async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de cliente inválido" })
    const cliente = await Cliente.findByPk(id)
    if (!cliente) return sendNotFound(res, "Cliente")
    await cliente.destroy()
    return res.json({ message: `Cliente ${id} excluído` })
})

// Create the order and its dishes atomically. Require customer choice of delivery or pickup.
// Cria o pedido e seus pratos em uma única transação. Exige a escolha entre entrega e retirada.
// Request: { "id_cliente": 1, "tipo_entrega": "entrega", "itens": [{ "id_prato": 2, "quantidade": 3 }] }
// Requisição: { "id_cliente": 1, "tipo_entrega": "entrega", "itens": [{ "id_prato": 2, "quantidade": 3 }] }
app.post("/pedidos", async (req, res) => {
    if (!isObject(req.body)) return res.status(400).json({ error: "Envie os dados do pedido em JSON" })
    const idCliente = positiveId(req.body.id_cliente)
    const tipoEntrega = req.body.tipo_entrega
    const itens = req.body.itens
    if (!idCliente) return res.status(400).json({ error: "id_cliente deve ser um ID positivo" })
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
        const cliente = await Cliente.findByPk(idCliente, { transaction })
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
            id_cliente: idCliente,
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
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ error: "ID de pedido inválido" })
    const pedido = await Pedido.findByPk(id)
    if (!pedido) return sendNotFound(res, "Pedido")
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
