require('dotenv').config();
const express = require('express');
const { ServiceBusClient } = require('@azure/service-bus');

const app = express();
app.use(express.json());

const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const topicName = process.env.AZURE_SERVICE_BUS_TOPIC;

let serviceBusClient;
let sender;

async function inicializaServiceBus() {
  serviceBusClient = new ServiceBusClient(connectionString);
  sender = serviceBusClient.createSender(topicName);
  console.log('Service Bus (Topic) inicializado no gateway-api.');
}

app.post('/servicos', async (req, res) => {
  console.log('Recebido POST em /servicos:', req.body);

  const { nome, descricao, categoria, email } = req.body;
  if (!nome || !descricao || !categoria || !email) {
    return res.status(400).json({ erro: 'Campos nome, descricao, categoria e email são obrigatórios.' });
  }
  const mensagem = {
    nome,
    descricao,
    categoria,
    email,
    dataCadastro: new Date().toISOString(),
    tipo: 'NOVO_SERVICO'
  };
  try {
    await sender.sendMessages({ body: mensagem });
    console.log('Mensagem enviada para o Service Bus (Topic):', mensagem);
    res.status(202).json({ mensagem: 'Serviço enviado para processamento.', dados: mensagem });
  } catch (error) {
    console.error('Erro ao enviar mensagem para o Service Bus (Topic):', error);
    res.status(500).json({ erro: 'Falha ao enviar mensagem para o Service Bus.' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', servico: 'gateway-api' });
});

async function main() {
  await inicializaServiceBus();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`gateway-api rodando na porta ${PORT}`);
  });
}

main();
