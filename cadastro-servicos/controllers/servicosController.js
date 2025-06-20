// controllers/servicosController.js
const sql = require('mssql');
const { dbConfig } = require('../database');
const { ServiceBusClient } = require('@azure/service-bus');

const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
const topicName = process.env.AZURE_SERVICE_BUS_TOPIC;

const sbClient = new ServiceBusClient(connectionString);

// Função auxiliar para buscar serviço por id
async function buscarServicoPorId(id) {
  let pool = await sql.connect(dbConfig);
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM Servicos WHERE id = @id');
  return result.recordset[0];
}

exports.listar = async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);
    const result = await pool.request().query('SELECT * FROM Servicos');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao listar serviços.' });
  }
};

exports.criar = async (req, res) => {
  const { nome, descricao, categoria, email } = req.body; // lembre de enviar o email no body
  const usuarioId = req.usuario.id;

  if (!['prestador', 'admin'].includes(req.usuario.tipo)) {
    return res.status(403).json({ erro: 'Acesso negado para criar serviço.' });
  }

  try {
    let pool = await sql.connect(dbConfig);
    await pool.request()
      .input('nome', sql.VarChar, nome)
      .input('descricao', sql.VarChar, descricao)
      .input('categoria', sql.VarChar, categoria)
      .input('usuarioId', sql.Int, usuarioId)
      .query(`
        INSERT INTO Servicos (nome, descricao, categoria, usuarioId)
        VALUES (@nome, @descricao, @categoria, @usuarioId)
      `);

    // Publica evento no Service Bus para o email-service
    const sender = sbClient.createSender(topicName);
    await sender.sendMessages({
      body: {
        nome,
        descricao,
        categoria,
        email,
        tipo: 'SERVICO_CADASTRADO',
        dataCadastro: new Date().toISOString()
      }
    });
    await sender.close();

    res.status(201).json({ mensagem: 'Serviço criado com sucesso.' });
  } catch (err) {
    console.error('Erro ao criar serviço:', err);
    res.status(500).json({ erro: 'Erro ao criar serviço.' });
  }
};

exports.atualizar = async (req, res) => {
  const id = req.params.id;
  const { nome, descricao, categoria } = req.body;

  try {
    const servico = await buscarServicoPorId(id);
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado.' });

    if (req.usuario.tipo !== 'admin' && servico.usuarioId !== req.usuario.id) {
      return res.status(403).json({ erro: 'Acesso negado para atualizar este serviço.' });
    }

    let pool = await sql.connect(dbConfig);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nome', sql.VarChar, nome)
      .input('descricao', sql.VarChar, descricao)
      .input('categoria', sql.VarChar, categoria)
      .query(`
        UPDATE Servicos
        SET nome = @nome, descricao = @descricao, categoria = @categoria
        WHERE id = @id
      `);
    res.json({ mensagem: 'Serviço atualizado com sucesso.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar serviço.' });
  }
};

exports.excluir = async (req, res) => {
  const id = req.params.id;

  try {
    const servico = await buscarServicoPorId(id);
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado.' });

    if (req.usuario.tipo !== 'admin' && servico.usuarioId !== req.usuario.id) {
      return res.status(403).json({ erro: 'Acesso negado para excluir este serviço.' });
    }

    let pool = await sql.connect(dbConfig);
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Servicos WHERE id = @id');
    res.json({ mensagem: 'Serviço excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir serviço.' });
  }
};
