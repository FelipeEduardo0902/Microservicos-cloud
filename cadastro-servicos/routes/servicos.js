const express = require('express');
const router = express.Router();
const autenticarJWT = require('../middleware/autenticarJWT');
const servicosController = require('../controllers/servicosController');

router.get('/', autenticarJWT, servicosController.listar);
router.post('/', autenticarJWT, servicosController.criar);
router.put('/:id', autenticarJWT, servicosController.atualizar);
router.delete('/:id', autenticarJWT, servicosController.excluir);

module.exports = router;