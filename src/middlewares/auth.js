import jwt from 'jsonwebtoken';

export async function verificarToken(request, reply) {
    try {
        const authHeader = request.headers.authorization;

        if (!authHeader) {
            return reply.status(401).send({ mensagem: 'Token não fornecido' });
        }

        const token = authHeader.split(' ')[1]; // Formato: "Bearer TOKEN"

        if (!token) {
            return reply.status(401).send({ mensagem: 'Token inválido' });
        }

        // Verificar o token
        const decoded = jwt.verify(token, 'cellstore_secret_key');

        // Colocar os dados do usuário na request para usar nas rotas
        request.usuario = decoded;

        // Continuar para a próxima função
    } catch (error) {
        return reply.status(401).send({ mensagem: 'Token inválido ou expirado' });
    }
}