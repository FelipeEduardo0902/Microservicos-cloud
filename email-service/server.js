require('dotenv').config();
const express = require('express');
const { ServiceBusClient } = require('@azure/service-bus');
const nodemailer = require('nodemailer');

const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const topicName = process.env.AZURE_SERVICE_BUS_TOPIC;
const subscriptionName = process.env.AZURE_SERVICE_BUS_SUBSCRIPTION;

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Função para enviar o e-mail
async function enviarEmail(servico) {
  await transporter.sendMail({
    from: `"Plataforma de Serviços" <${process.env.EMAIL_USER}>`,
    to: servico.email,
    subject: "Seu serviço foi cadastrado!",
    text: `Olá, ${servico.nome}! Seu serviço "${servico.descricao}" foi cadastrado com sucesso.`,
  });
  console.log('E-mail enviado para:', servico.email);
}

// Função principal para consumir o tópico
async function iniciarServiceBus() {
  const sbClient = new ServiceBusClient(connectionString);
  const receiver = sbClient.createReceiver(topicName, subscriptionName);

  receiver.subscribe({
    processMessage: async (msg) => {
      console.log('Mensagem recebida pelo email-service:', msg.body);
      const evento = msg.body;
      if (evento.tipo === 'SERVICO_CADASTRADO') {
        try {
          await enviarEmail(evento);
        } catch (err) {
          console.error('Erro ao enviar e-mail:', err);
        }
      }
      await receiver.completeMessage(msg);
    },
    processError: async (err) => {
      console.error('Erro no Service Bus:', err);
    },
  });

  console.log('email-service ouvindo mensagens do Topic/Subscription...');
}

// Pequeno servidor só para manter o processo vivo no Azure
app.get('/health', (req, res) => {
  res.json({ status: 'ok', servico: 'email-service' });
});

// Inicialização
app.listen(PORT, () => {
  console.log(`Servidor de healthcheck rodando na porta ${PORT}`);
  iniciarServiceBus().catch(console.error);
});
