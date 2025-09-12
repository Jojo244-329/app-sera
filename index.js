const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { Pool } = require("pg"); // banco PostgreSQL

const app = express();
app.use(cors());
app.use(express.json());

// 🔑 Config do banco (Railway gera isso nas VARIÁVEIS)
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT
});

// Chaves do gateway
const PUBLIC_KEY = process.env.PUBLIC_KEY || "yt0313861_y42n57er76i3n8iu";
const SECRET_KEY = process.env.SECRET_KEY || "7w9xbx75ijwk7ewxd4soizd7giiwrn5e416n5mjsub4qa8vgrrb1tntk1pfzzpj6";

const HEADERS = {
  "x-public-key": PUBLIC_KEY,
  "x-secret-key": SECRET_KEY,
  "Content-Type": "application/json"
};

//
// 📌 Banco de Dados
//

// Criar tabela (executa uma vez)
app.get("/api/setup", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255),
        email VARCHAR(255),
        celular VARCHAR(20),
        cpf VARCHAR(20),
        descricao VARCHAR(255),
        preco DECIMAL(10,2),
        pix_manual TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    res.json({ success: true, message: "Tabela criada" });
  } catch (err) {
    console.error("Erro ao criar tabela:", err);
    res.status(500).json({ error: "Erro ao criar tabela" });
  }
});

// Salvar pedido (Pix manual)
app.post("/api/salvar", async (req, res) => {
  try {
    const { nome, email, celular, cpf, descricao, preco, pixManual } = req.body;
    const result = await pool.query(
      "INSERT INTO pedidos (nome, email, celular, cpf, descricao, preco, pix_manual) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [nome, email, celular, cpf, descricao, preco, pixManual]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error("Erro ao salvar pedido:", err);
    res.status(500).json({ error: "Erro ao salvar pedido" });
  }
});

// Buscar pedido
app.get("/api/pagamento/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM pedidos WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Pedido não encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar pedido:", err);
    res.status(500).json({ error: "Erro ao buscar pedido" });
  }
});

// Listar todos os pedidos
app.get("/api/listar", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pedidos ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao listar pedidos:", err);
    res.status(500).json({ error: "Erro ao listar pedidos" });
  }
});


//
// 📌 Rotas de Gateway (mantidas do teu código)
//

// Geração do Pix
app.post("/api/gerar-pix", async (req, res) => {
  try {
    const { client, products, amountFinal } = req.body;

    const identifier = `id-${Date.now()}`;
    const dataAmanha = new Date();
    dataAmanha.setDate(dataAmanha.getDate() + 1);
    const dueDate = dataAmanha.toISOString().split("T")[0];

    const payloadGateway = {
      identifier,
      amount: amountFinal,
      client,
      products,
      dueDate,
      metadata: { key1: "value1", key2: "value2" },
      callbackUrl: "https://seusite.com/api/webhook/pix"
    };

    console.log("📡 Enviando PIX:", JSON.stringify(payloadGateway, null, 2));

    const resposta = await axios.post(
      "https://app.onetimepay.com.br/api/v1/gateway/pix/receive",
      payloadGateway,
      { headers: HEADERS }
    );

    res.status(200).json({
      pixCode: resposta.data.pix.code,
      pixQrCodeBase64: resposta.data.pix.base64,
      orderId: resposta.data.order.id,
      orderUrl: resposta.data.order.url,
      transactionId: resposta.data.transactionId
    });
  } catch (erro) {
    console.error("❌ ERRO PIX:", erro.response?.data || erro.message);
    res.status(erro.response?.status || 500).json({ erro: erro.message });
  }
});

// Geração do Cartão
app.post("/api/gerar-cartao", async (req, res) => {
  try {
    const { client, products, amount, clientIp, card, installments } = req.body;

    const identifier = `id-${Date.now()}`;
    const dataAmanha = new Date();
    dataAmanha.setDate(dataAmanha.getDate() + 1);
    const dueDate = dataAmanha.toISOString().split("T")[0];

    const payloadGateway = {
      identifier,
      amount,
      client,
      clientIp: clientIp || "127.0.0.1",
      card,
      installments,
      products,
      dueDate,
      metadata: { key1: "value1", key2: "value2" },
      callbackUrl: "https://minha.api.com/card/callback/bep150efpd"
    };

    console.log("📡 Enviando CARTÃO:", JSON.stringify(payloadGateway, null, 2));

    const resposta = await axios.post(
      "https://app.onetimepay.com.br/api/v1/gateway/card/receive",
      payloadGateway,
      { headers: HEADERS }
    );

    res.status(200).json(resposta.data);
  } catch (erro) {
    console.error("❌ ERRO CARTÃO:", erro.response?.data || erro.message);
    res.status(erro.response?.status || 500).json({ erro: erro.message });
  }
});

// Verificar transação
app.get("/api/verificar-transacao", async (req, res) => {
  const transactionId = req.query.transactionId;
  try {
    const resposta = await axios.get(
      `https://app.onetimepay.com.br/api/v1/transactions/${transactionId}`,
      { headers: HEADERS }
    );
    res.status(200).json(resposta.data);
  } catch (erro) {
    console.error("❌ Erro consulta:", erro.response?.data || erro.message);
    res.status(erro.response?.status || 500).json({ erro: "Erro ao verificar transação." });
  }
});

//
// 🚀 Start normal (Railway precisa disso, sem serverless-http)
//
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Servidor rodando na porta ${PORT}`));
