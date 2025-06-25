require('dotenv').config();
const express = require('express');
const servicosRoutes = require('./routes/servicos');

const app = express();
app.use(express.json());

app.use('/servicos', servicosRoutes);

const PORT = process.env.PORTA_SERVICO || 8080;
app.listen(PORT, () => console.log(`cadastro-servicos rodando na porta ${PORT}`));
