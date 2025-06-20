const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'umasecretbemsegura';

module.exports = function autenticarJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: 'Token ausente.' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET, (err, usuario) => {
    if (err) return res.status(403).json({ erro: 'Token inválido.' });
    req.usuario = usuario;  // Dados do usuário no request
    next();
  });
};