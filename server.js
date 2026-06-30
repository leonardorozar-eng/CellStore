import Fastify from 'fastify';
import { Pool } from 'pg';
import cors from '@fastify/cors';
import jwt from 'jsonwebtoken';
import { verificarToken } from './src/middlewares/auth.js';

const sql = new Pool({
    user: "postgres",
    password: "senai",
    host: "localhost",
    port: 5432,
    database: "cellstore_db"
});

const servidor = Fastify({ logger: true });

// ==================== CORS ====================
await servidor.register(cors, {
    origin: true,
    credentials: true
});

// ==================== USUÁRIOS ====================

// Cadastrar usuário
servidor.post('/usuarios', async (request, reply) => {
    const { nome, email, cpf, senha, perfil } = request.body;

    const resultado = await sql.query(
        `INSERT INTO usuario (nome, email, cpf, senha, perfil) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, perfil`,
        [nome, email, cpf, senha, perfil || 'cliente']
    );

    return resultado.rows[0];
});

// Login com JWT
servidor.post('/login', async (request, reply) => {
    const { email, senha } = request.body;

    const resultado = await sql.query(
        'SELECT id, nome, email, senha, perfil FROM usuario WHERE email = $1',
        [email]
    );

    if (resultado.rows.length === 0) {
        return reply.status(401).send({ mensagem: 'Email ou senha inválidos' });
    }

    const usuario = resultado.rows[0];

    if (usuario.senha !== senha) {
        return reply.status(401).send({ mensagem: 'Email ou senha inválidos' });
    }

    const token = jwt.sign(
        { 
            id: usuario.id, 
            nome: usuario.nome, 
            email: usuario.email,
            perfil: usuario.perfil 
        },
        'cellstore_secret_key',
        { expiresIn: '7d' }
    );

    return {
        mensagem: 'Login realizado com sucesso',
        token: token,
        usuario: {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil
        }
    };
});

// ==================== CELULARES ====================

servidor.get('/celulares', async () => {
    const resultado = await sql.query(
        'SELECT * FROM celular WHERE ativo = true ORDER BY id'
    );
    return resultado.rows;
});

servidor.get('/celulares/:id', async (request, reply) => {
    const { id } = request.params;
    const resultado = await sql.query(
        'SELECT * FROM celular WHERE id = $1', 
        [id]
    );
    return resultado.rows[0] || { mensagem: 'Celular não encontrado' };
});

servidor.post('/celulares', async (request, reply) => {
    const { marca, modelo, preco, armazenamento, cor, estoque, imagem_url } = request.body;

    const resultado = await sql.query(
        `INSERT INTO celular (marca, modelo, preco, armazenamento, cor, estoque, imagem_url) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [marca, modelo, preco, armazenamento, cor, estoque || 0, imagem_url]
    );

    return resultado.rows[0];
});

servidor.put('/celulares/:id', async (request, reply) => {
    const { id } = request.params;
    const { marca, modelo, preco, armazenamento, cor, estoque } = request.body;

    const resultado = await sql.query(
        `UPDATE celular 
         SET marca = $1, modelo = $2, preco = $3, armazenamento = $4, cor = $5, estoque = $6 
         WHERE id = $7 RETURNING *`,
        [marca, modelo, preco, armazenamento, cor, estoque, id]
    );

    return resultado.rows[0];
});

servidor.delete('/celulares/:id', async (request, reply) => {
    const { id } = request.params;
    await sql.query('UPDATE celular SET ativo = false WHERE id = $1', [id]);
    return { mensagem: 'Celular desativado com sucesso' };
});

// ==================== PEDIDOS ====================

// Criar pedido (protegido + validação de estoque)
servidor.post('/pedidos', { preHandler: verificarToken }, async (request, reply) => {
    const { usuario_id, itens } = request.body;

    if (!usuario_id || !itens || itens.length === 0) {
        return reply.status(400).send({ mensagem: 'usuario_id e itens são obrigatórios' });
    }

    // Verificar estoque antes de criar o pedido
    for (const item of itens) {
        const celular = await sql.query(
            'SELECT estoque FROM celular WHERE id = $1',
            [item.celular_id]
        );

        if (celular.rows.length === 0) {
            return reply.status(404).send({ 
                mensagem: `Celular com id ${item.celular_id} não encontrado` 
            });
        }

        if (celular.rows[0].estoque < item.quantidade) {
            return reply.status(400).send({ 
                mensagem: `Estoque insuficiente para o celular id ${item.celular_id}` 
            });
        }
    }

    // Criar o pedido
    const pedido = await sql.query(
        'INSERT INTO pedido (usuario_id) VALUES ($1) RETURNING *',
        [usuario_id]
    );
    const pedidoId = pedido.rows[0].id;

    let valorTotal = 0;

    for (const item of itens) {
        const celular = await sql.query(
            'SELECT preco FROM celular WHERE id = $1',
            [item.celular_id]
        );
        const preco = celular.rows[0].preco;

        await sql.query(
            `INSERT INTO item_pedido (pedido_id, celular_id, quantidade, preco_unitario)
             VALUES ($1, $2, $3, $4)`,
            [pedidoId, item.celular_id, item.quantidade, preco]
        );

        // Baixar o estoque automaticamente
        await sql.query(
            'UPDATE celular SET estoque = estoque - $1 WHERE id = $2',
            [item.quantidade, item.celular_id]
        );

        valorTotal += preco * item.quantidade;
    }

    await sql.query(
        'UPDATE pedido SET valor_total = $1 WHERE id = $2',
        [valorTotal, pedidoId]
    );

    return { 
        mensagem: 'Pedido criado com sucesso', 
        pedido_id: pedidoId, 
        valor_total: valorTotal 
    };
});

// Listar todos os pedidos (Admin - protegido)
servidor.get('/pedidos', { preHandler: verificarToken }, async (request, reply) => {
    const resultado = await sql.query(
        `SELECT 
            p.id, 
            p.data_pedido, 
            p.status, 
            p.valor_total,
            u.nome AS cliente,
            json_agg(
                json_build_object(
                    'celular_id', ip.celular_id,
                    'quantidade', ip.quantidade,
                    'preco_unitario', ip.preco_unitario
                )
            ) AS itens
         FROM pedido p
         JOIN usuario u ON u.id = p.usuario_id
         LEFT JOIN item_pedido ip ON ip.pedido_id = p.id
         GROUP BY p.id, u.nome
         ORDER BY p.data_pedido DESC`
    );

    return resultado.rows;
});

// Alterar status do pedido (Admin - protegido)
servidor.put('/pedidos/:id/status', { preHandler: verificarToken }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    const statusValidos = ['pendente', 'confirmado', 'enviado', 'entregue', 'cancelado'];

    if (!statusValidos.includes(status)) {
        return reply.status(400).send({ mensagem: 'Status inválido' });
    }

    const resultado = await sql.query(
        'UPDATE pedido SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
    );

    if (resultado.rows.length === 0) {
        return reply.status(404).send({ mensagem: 'Pedido não encontrado' });
    }

    return { 
        mensagem: 'Status atualizado com sucesso', 
        pedido: resultado.rows[0] 
    };
});

servidor.listen({ port: 3000 }, (err) => {
    if (err) throw err;
    console.log('Servidor rodando em http://localhost:3000');
});