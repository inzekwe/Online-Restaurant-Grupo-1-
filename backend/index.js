const express = require("express")
const { Sequelize } = require("sequelize")

const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "restaurante.db"
})

sequelize.authenticate()

const Prato = sequelize.define("Prato", {
    nome: {
    type: Sequelize.STRING
},
descricao: {
    type: Sequelize.STRING
},
preco: {
    type: Sequelize.FLOAT
},
disponivel: {
    type: Sequelize.BOOLEAN
}
})

const app = express()
app.use(express.json())

app.post("/pratos", async function(req, res) {
const body = req.body
const prato = await Prato.create(body)

res.json(prato)
})

app.get("/pratos", async function(req, res) {
const pratos = await Prato.findAll()

res.json(pratos)
})
app.get("/pratos/:id", async function(req, res) {
const pratoId = req.params.id
const prato = await Prato.findByPk(pratoId)

res.json(prato)
})

app.put("/pratos/:id", async function(req, res) {
const pratoId = req.params.id
const body = req.body
const prato = await Prato.findByPk(pratoId)

if (prato == null) {
    return res.status(404).send("Prato não encontrado")
}

await prato.update(body)

res.json(prato)
})

app.delete("/pratos/:id", async function(req, res) {
const pratoId = req.params.id
const prato = await Prato.findByPk(pratoId)

if (prato == null) {
    return res.status(404).send("Prato não encontrado")
}

await prato.destroy()

res.send("Prato " + pratoId + " excluído")
})

const Cliente = sequelize.define("Cliente", {
    nome: {
    type: Sequelize.STRING
},
telefone: {
    type: Sequelize.STRING
},
endereco: {
    type: Sequelize.STRING
}
})

app.post("/clientes", async function(req, res) {
const body = req.body
const cliente = await Cliente.create(body)

res.json(cliente)
})

app.get("/clientes", async function(req, res) {
const clientes = await Cliente.findAll()

res.json(clientes)
})

app.get("/clientes/:id", async function(req, res) {
const clienteId = req.params.id
const cliente = await Cliente.findByPk(clienteId)

if (cliente == null) {
    return res.status(404).send("Cliente não encontrado")
}

res.json(cliente)

})

app.put("/clientes/:id", async function(req, res) {
const clienteId = req.params.id
const body = req.body
const cliente = await Cliente.findByPk(clienteId)

if (cliente == null) {
    return res.status(404).send("Cliente não encontrado")
}

await cliente.update(body)
res.json(cliente)
})

app.delete("/clientes/:id", async function(req, res) {
const clienteId = req.params.id
const cliente = await Cliente.findByPk(clienteId)

if (cliente == null) {
    return res.status(404).send("Cliente não encontrado")
}

await cliente.destroy()

res.send("Cliente " + clienteId + " excluído")

})

const Pedido = sequelize.define("Pedido", {
data_hora: {
    type: Sequelize.DATE
},
status: {
    type: Sequelize.STRING
},
id_cliente: {
    type: Sequelize.INTEGER
}

})
Cliente.hasMany(Pedido, {
    foreignKey: "id_cliente"
})

Pedido.belongsTo(Cliente, {
    foreignKey: "id_cliente"
})


app.post("/pedidos", async function(req, res) {
const body = req.body
const pedido = await Pedido.create(body)

res.json(pedido)
})

app.get("/pedidos", async function(req, res) {
const pedidos = await Pedido.findAll()

res.json(pedidos)
})

app.get("/pedidos/:id", async function(req, res) {
const pedidoId = req.params.id
const pedido = await Pedido.findByPk(pedidoId)

if (pedido == null) {
    return res.status(404).send("Pedido não encontrado")
}

res.json(pedido)

})

app.put("/pedidos/:id", async function(req, res) {
const pedidoId = req.params.id
const body = req.body
const pedido = await Pedido.findByPk(pedidoId)

if (pedido == null) {
    return res.status(404).send("Pedido não encontrado")
}

await pedido.update(body)

res.json(pedido)

})

app.delete("/pedidos/:id", async function(req, res) {
const pedidoId = req.params.id
const pedido = await Pedido.findByPk(pedidoId)

if (pedido == null) {
    return res.status(404).send("Pedido não encontrado")
}

await pedido.destroy()

res.send("Pedido " + pedidoId + " excluído")

})

const ItemPedido = sequelize.define("ItemPedido", {
    id_pedido: {
        type: Sequelize.INTEGER
    },
    id_prato: {
        type: Sequelize.INTEGER
    },
    quantidade: {
    type: Sequelize.INTEGER
}

})
Pedido.hasMany(ItemPedido, {
    foreignKey: "id_pedido"
})

ItemPedido.belongsTo(Pedido, {
    foreignKey: "id_pedido"
})
Prato.hasMany(ItemPedido, {
    foreignKey: "id_prato"
})

ItemPedido.belongsTo(Prato, {
    foreignKey: "id_prato"
})

sequelize.sync()

app.post("/itens-pedido", async function(req, res) {
const body = req.body
const itemPedido = await ItemPedido.create(body)

res.json(itemPedido)

})

app.get("/itens-pedido", async function(req, res) {
const itensPedido = await ItemPedido.findAll()
res.json(itensPedido)
})

app.get("/itens-pedido/:id", async function(req, res) {
    const itemPedidoId = req.params.id
    const itemPedido = await ItemPedido.findByPk(itemPedidoId)

    if (itemPedido == null) {
        return res.status(404).send("Item do pedido não encontrado")
    }

    res.json(itemPedido)
})

app.put("/itens-pedido/:id", async function(req, res) {
    const itemPedidoId = req.params.id
    const body = req.body
    const itemPedido = await ItemPedido.findByPk(itemPedidoId)

    if (itemPedido == null) {
        return res.status(404).send("Item do pedido não encontrado")
    }

    await itemPedido.update(body)

    res.json(itemPedido)
})

app.delete("/itens-pedido/:id", async function(req, res) {
const itemPedidoId = req.params.id
const itemPedido = await ItemPedido.findByPk(itemPedidoId)

if (itemPedido == null) {
    return res.status(404).send("Item do pedido não encontrado")
}

await itemPedido.destroy()

res.send("Item do pedido " + itemPedidoId + " excluído")
})

app.get("/", function(req, res) {
    res.send("API do Restaurante Online funcionando")
})

app.listen(8080, function() {
    console.log("Servidor iniciado")
})