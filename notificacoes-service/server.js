require('dotenv').config();
const express = require('express');
const { ServiceBusClient } = require('@azure/service-bus');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

// Configuração do banco
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  port: parseInt(process.env.DB_PORT, 10),
};

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

// Middleware JWT
function autenticarJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ erro: 'Token inválido' });
    req.usuario = usuario;
    next();
  });
}

// Middleware por papéis
function autorizarRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.role)) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }
    next();
  };
}

// Conexão banco
let pool;
async function conectarBanco() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('Conectado ao banco de dados!');
  } catch (err) {
    console.error('Erro ao conectar no banco:', err);
  }
}

// Service Bus
const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const topicName = process.env.AZURE_SERVICE_BUS_TOPIC;
const subscriptionName = process.env.AZURE_SERVICE_BUS_SUBSCRIPTION;

async function iniciarServiceBus() {
  const sbClient = new ServiceBusClient(connectionString);
  const receiver = sbClient.createReceiver(topicName, subscriptionName);

  receiver.subscribe({
    processMessage: async (message) => {
      console.log('Mensagem recebida:', message.body);
      const servico = message.body;

      if (!servico.nome || !servico.descricao || !servico.categoria) {
        console.log('Mensagem inválida, descartando');
        await receiver.completeMessage(message);
        return;
      }

      try {
        await pool.request()
          .input('nome', sql.VarChar, servico.nome)
          .input('descricao', sql.VarChar, servico.descricao)
          .input('categoria', sql.VarChar, servico.categoria)
          .input('dataCadastro', sql.DateTime, new Date(servico.dataCadastro))
          .query(`
            INSERT INTO Servicos (nome, descricao, categoria, dataCadastro)
            VALUES (@nome, @descricao, @categoria, @dataCadastro)
          `);

        console.log('Serviço salvo no banco.');
        await receiver.completeMessage(message);
      } catch (err) {
        console.error('Erro ao salvar no banco:', err);
        await receiver.abandonMessage(message);
      }
    },
    processError: async (err) => {
      console.error('Erro no Service Bus:', err);
    },
  });

  console.log('notification-service ouvindo mensagens do Topic/Subscription...');
}

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', servico: 'notification-service' });
});

// Rota protegida
app.get('/servicos', autenticarJWT, autorizarRoles('admin', 'prestador'), async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM Servicos');
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao buscar serviços:', err);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// Login fake
const usuariosFake = [
  { id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 8), role: 'admin' },
  { id: 2, username: 'prestador', password: bcrypt.hashSync('prestador123', 8), role: 'prestador' },
  { id: 3, username: 'usuario', password: bcrypt.hashSync('usuario123', 8), role: 'usuario' },
];

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const usuario = usuariosFake.find(u => u.username === username);

  if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado' });

  const senhaValida = bcrypt.compareSync(password, usuario.password);
  if (!senhaValida) return res.status(401).json({ erro: 'Senha incorreta' });

  const token = jwt.sign({ id: usuario.id, role: usuario.role }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Inicialização
async function main() {
  await conectarBanco();
  await iniciarServiceBus();

  const PORT = process.env.PORTA_SERVICO || 3002;
  app.listen(PORT, () => {
    console.log(`notification-service rodando na porta ${PORT}`);
  });
}

main().catch(err => {
  console.error('Erro na inicialização:', err);
});
