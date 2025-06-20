require('dotenv').config();
const express = require('express');
const { ServiceBusClient } = require('@azure/service-bus');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

// Configurações do banco
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  port: parseInt(process.env.DB_PORT, 10),
};

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

// Middleware para autenticação JWT
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

// Middleware para autorização por papéis
function autorizarRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.role)) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }
    next();
  };
}

// Conexão com banco
let pool;
async function conectarBanco() {
  try {
    pool = await sql.connect(dbConfig);
    console.log('Conectado ao banco de dados!');
  } catch (err) {
    console.error('Erro ao conectar no banco:', err);
  }
}

// Configuração do Service Bus (TOPIC + SUBSCRIPTION)
const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const topicName = process.env.AZURE_SERVICE_BUS_TOPIC;
const subscriptionName = process.env.AZURE_SERVICE_BUS_SUBSCRIPTION;

let serviceBusClient;
let receiver;

async function iniciarServiceBus() {
  serviceBusClient = new ServiceBusClient(connectionString);
  receiver = serviceBusClient.createReceiver(topicName, subscriptionName);

  receiver.subscribe({
    processMessage: async (message) => {
      console.log('Mensagem recebida:', message.body);
      const servico = message.body;

      // Validação básica
      if (!servico.nome || !servico.descricao || !servico.categoria) {
        console.log('Mensagem inválida, descartando');
        await receiver.completeMessage(message);
        return;
      }

      try {
        const request = pool.request();
        await request
          .input('nome', sql.VarChar, servico.nome)
          .input('descricao', sql.VarChar, servico.descricao)
          .input('categoria', sql.VarChar, servico.categoria)
          .input('dataCadastro', sql.DateTime, new Date(servico.dataCadastro))
          .query(`
            INSERT INTO Servicos (nome, descricao, categoria, dataCadastro)
            VALUES (@nome, @descricao, @categoria, @dataCadastro)
          `);

        console.log('Serviço gravado com sucesso no banco.');
        await receiver.completeMessage(message);
      } catch (err) {
        console.error('Erro ao gravar no banco:', err);
        await receiver.abandonMessage(message);
      }
    },

    processError: async (err) => {
      console.error('Erro no Service Bus receiver:', err);
    },
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', servico: 'notificacoes-service' });
});

// Rota protegida para listar serviços
app.get('/servicos', autenticarJWT, autorizarRoles('admin', 'prestador'), async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM Servicos');
    res.json(result.recordset);
  } catch (err) {
    console.error('Erro ao buscar serviços:', err);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// Rota de login simulado
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
    console.log(`Servidor notificacoes-service rodando na porta ${PORT}`);
  });

  process.stdin.resume(); // mantém o processo vivo
}

main().catch(err => {
  console.error('Erro na inicialização:', err);
});
