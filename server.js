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

// ==================== CELULARES ====================

// Listar todos os celulares
servidor.get('/celulares', async () => {
    const resultado = await sql.query(
        'SELECT * FROM celular WHERE ativo = true ORDER BY id'
    );
    return resultado.rows;
});

// Buscar celular por ID
servidor.get('/celulares/:id', async (request, reply) => {
    const { id } = request.params;
    const resultado = await sql.query(
        'SELECT * FROM celular WHERE id = $1', 
        [id]
    );
    return resultado.rows[0] || { mensagem: 'Celular não encontrado' };
});

// Cadastrar novo celular
servidor.post('/celulares', async (request, reply) => {
    const { marca, modelo, preco, armazenamento, cor, estoque, imagem_url } = request.body;

    const resultado = await sql.query(
        `INSERT INTO celular (marca, modelo, preco, armazenamento, cor, estoque, imagem_url) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [marca, modelo, preco, armazenamento, cor, estoque || 0, imagem_url]
    );

    return resultado.rows[0];
});

// Atualizar celular
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

// Deletar celular (soft delete)
servidor.delete('/celulares/:id', async (request, reply) => {
    const { id } = request.params;
    await sql.query('UPDATE celular SET ativo = false WHERE id = $1', [id]);
    return { mensagem: 'Celular desativado com sucesso' };
});

servidor.listen({ port: 3000 }, (err) => {
    if (err) throw err;
    console.log('🚀 Servidor rodando em http://localhost:3000');
});