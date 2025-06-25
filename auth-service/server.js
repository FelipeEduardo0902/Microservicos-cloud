require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { sql, dbConfig } = require('./database');

const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'supersecret';

// Middleware de autenticação JWT
function autenticarJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: 'Token ausente.' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ erro: 'Token inválido.' });
    req.usuario = usuario;
    next();
  });
}

// Funções auxiliares para banco
async function createUsuario({ nome, email, senha, tipo }) {
  let pool = await sql.connect(dbConfig);
  const result = await pool.request()
    .input('nome', sql.VarChar, nome)
    .input('email', sql.VarChar, email)
    .input('senha', sql.VarChar, senha)
    .input('tipo', sql.VarChar, tipo)
    .query(`
      INSERT INTO Usuarios (nome, email, senha, tipo)
      OUTPUT INSERTED.id
      VALUES (@nome, @email, @senha, @tipo)
    `);
  return result.recordset[0].id;
}

async function findUsuarioByEmail(email) {
  let pool = await sql.connect(dbConfig);
  const result = await pool.request()
    .input('email', sql.VarChar, email)
    .query('SELECT * FROM Usuarios WHERE email = @email');
  return result.recordset[0];
}

async function findUsuarioById(id) {
  let pool = await sql.connect(dbConfig);
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM Usuarios WHERE id = @id');
  return result.recordset[0];
}

// Cadastro de usuário
app.post('/usuarios', async (req, res) => {
  const { nome, email, senha, tipo } = req.body;
  if (!nome || !email || !senha || !tipo) return res.status(400).json({ erro: 'Campos obrigatórios.' });

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const id = await createUsuario({ nome, email, senha: senhaHash, tipo });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(400).json({ erro: 'E-mail já cadastrado ou erro no banco.' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  try {
    const usuario = await findUsuarioByEmail(email);
    if (!usuario) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const match = await bcrypt.compare(senha, usuario.senha);
    if (!match) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const payload = { id: usuario.id, email: usuario.email, tipo: usuario.tipo };
    const token = jwt.sign(payload, SECRET, { expiresIn: '4h' });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro no servidor.' });
  }
});

// Perfil logado
app.get('/me', autenticarJWT, async (req, res) => {
  try {
    const usuario = await findUsuarioById(req.usuario.id);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    delete usuario.senha;
    res.json(usuario);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro no servidor.' });
  }
});

// Rota só para admin
app.get('/admin-somente', autenticarJWT, (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito a admin.' });
  }
  res.json({ mensagem: 'Bem-vindo, admin!' });
});

// Listar todos os usuários - apenas admin
app.get('/usuarios', autenticarJWT, async (req, res) => {
  if (req.usuario.tipo !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito a admin.' });
  }

  try {
    let pool = await sql.connect(dbConfig);
    const result = await pool.request().query('SELECT id, nome, email, tipo FROM Usuarios');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

// Inicializa servidor
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log('auth-service rodando na porta', PORT));
