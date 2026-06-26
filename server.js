import Fastify from 'fastify';
import { Pool } from 'pg';

const sql = new Pool({
    user: "postgres",
    password: "senai",
    host: "localhost",
    port: 5432,
    database: "cellstore_db"
});

const servidor = Fastify({ logger: true });

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

// Login
servidor.post('/login', async (request, reply) => {
    const { email, senha } = request.body;

    const resultado = await sql.query(
        'SELECT id, nome, email, perfil FROM usuario WHERE email = $1 AND senha = $2',
        [email, senha]
    );

    if (resultado.rows.length === 0) {
        return { mensagem: 'Email ou senha inválidos' };
    }

    return resultado.rows[0];
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

// Criar pedido
servidor.post('/pedidos', async (request, reply) => {
    const { usuario_id, itens } = request.body;

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

// Listar pedidos de um usuário (CORRIGIDO)
servidor.get('/pedidos/:usuario_id', async (request, reply) => {
    const { usuario_id } = request.params;

    const resultado = await sql.query(
        `SELECT 
            p.id, 
            p.data_pedido, 
            p.status, 
            p.valor_total,
            json_agg(
                json_build_object(
                    'celular_id', ip.celular_id,
                    'quantidade', ip.quantidade,
                    'preco_unitario', ip.preco_unitario
                )
            ) AS itens
         FROM pedido p
         LEFT JOIN item_pedido ip ON ip.pedido_id = p.id
         WHERE p.usuario_id = $1
         GROUP BY p.id, p.data_pedido, p.status, p.valor_total
         ORDER BY p.data_pedido DESC`,
        [usuario_id]
    );

    return resultado.rows;
});

servidor.listen({ port: 3000 }, (err) => {
    if (err) throw err;
    console.log('🚀 Servidor rodando em http://localhost:3000');
});