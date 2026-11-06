const express = require('express')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const bcrypt = require('bcrypt')
const { z } = require('zod')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const cors = require('cors')
require('dotenv').config()

const app = express()

const pool = new Pool({
    connectionString: process.env.DATABASE_URL

})


app.use(helmet())

const SECRET_TOKEN = process.env.JWT_TOKEN || "minha_chave_secreta"
const SECRET_REFRESH_TOKEN = process.env.JWT_REFRESH_TOKEN || "chave_refresh_dev_7d"

app.use(cors({
    origin:'*',
    methods: ['GET', 'POST','PUT', 'DELETE']
}))

app.use(express.json())

app.use((err, req, res, next)=>{
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err){
        return res.status(400).json({erro: 'Sintaxe de JSON inválida'})
    }
})


const limitador = rateLimit({
    windowMs: 1*60*1000,
    max: 5,
    message: {erro: "Muitas tentativas, tente novamente em 1 minuto"}
})

app.use(limitador)

const loginLimitado = rateLimit({
    windowMs: 1*60*1000,
    max: 5,
    message: {erro: "Muitas tentativas, tente novamente em 1 minuto"}
})

const schemaLogin = z.object({
    email: z.string().email('E-mail em formato inválido'),
    senha: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    role: z.enum(['user', 'admin']).optional().default('user')
}).strict()

app.post('/register', async (req,res)=>{
    try{
        const {email,senha,role}=schemaLogin.parse(req.body)
        const hashSenha = await bcrypt.hash(senha,10)

        const novoUsuario = await pool.query(
            'INSERT INTO usuarios (email, senha, role) VALUES ($1,$2,$3) RETURNING id, email, criado_em', [email, hashSenha, role]
        );

        res.status(201).json({
            mensagem:'Uusário cadastrado no PostgresSQL com sucesso',
            usuario: novoUsuario.rows
        })
    } catch(erro){
        if (erro.code === '23505'){
            return res.status(400).json({erro: 'E-mail já cadastrado'})
        }
        if(erro instanceof z.ZodError){
            return res.status(400).json({erro: 'Dados inválidos', detalhes: erro.errors})
        }
        console.error(erro)
        res.status(500).json({erro: 'Erro ao registrar o usuário.'})
    }
})

app.post('/login', loginLimitado, async (req,res)=>{

    try{
        const dadosValidados = schemaLogin.parse(req.body)

        const resultado = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1', [dadosValidados.email]
        )

        const usuario = resultado.rows[0]

        if(!usuario){
            return res.status(401).json({erro: 'Credenciais inválidas'})
        }

        const senhaCorreta = await bcrypt.compare(dadosValidados.senha, usuario.senha)

        if (!senhaCorreta){
            return res.status(401).json({erro: 'Credenciais inválidas'})
        }

        const acessToken = jwt.sign(
            {id: usuario.id, email: usuario.email, role: usuario.role}, SECRET_TOKEN, {expiresIn: '15m'}
        )
        const refreshToken = jwt.sign(
            {id: usuario.id}, SECRET_REFRESH_TOKEN, {expiresIn:'7d'}
        )

        await pool.query('INSERT INTO refresh_tokens (usuario_id, token) VALUES ($1,$2)', [usuario.id, refreshToken])

        res.json({mensagem: 'Login realizado', acessToken, refreshToken})

    } catch (erro){
        if(erro instanceof z.ZodError){
            return res.status(401).json({erro: "Dados inválidos", detalhes: erro.errors})
        }
        res.status(500).json({erro: 'Erro interno no servidor'})
    }
})

app.post('/refresh', async (req, res)=>{
    const {refreshToken} = req.body
    if(!refreshToken) return res.status(401).json({erro: "Refresh token não fornecido"})


    try{
        const checagemBanco = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [refreshToken])
        if (checagemBanco.rowCount === 0){
            return res.status(403).json({erro: "Refresh token inválido ou revogado."})
        }

        jwt.verify(refreshToken, SECRET_REFRESH_TOKEN, async (err, payload)=>{
            if (err){
                await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken])
                return res.status(403).json({erro: "Refresh token expirado. Faça login novamente"})
            }

            const userRes = await pool.query('SELECT id, email, role FROM usuarios WHERE id = $1', [payload.id])
            const usuario = userRes.rows[0]

            const novoAcessToken = jwt.sign(
                {id: usuario.id, email: usuario.email, role: usuario.role}, SECRET_TOKEN, {expiresIn: '15m'}
            )

            res.json({acessToken: novoAcessToken})
        })
    
    } catch (erro){
        res.status(500).json({erro: "Erro ao processar renovação de token."})
    }
})

app.post('/logout', async(req,res)=>{
    const {refreshToken} = req.body
    if(refreshToken){
        await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken])
    }
    res.json({mensagem: 'Logout realizado e sessão revogada com sucesso'})
})


function autenticarToken(req,res,next){
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]


    if(!token){
        return res.status(401).json({erro: 'Acesso negado. Token não fornecido'})
    }

    jwt.verify(token, SECRET_TOKEN, (err, usuario)=>{
        if(err){
            return res.status(403).json({erro: 'Token inválido ou expirado'})
        }

        req.usuario = usuario

        next()
    })
}
function autorizarCargo(...cargosPermitidos){
    return (req, res, next)=>{
        if(!req.usuario || !cargosPermitidos.includes(req.usuario.role)){
            return res.status(403).json({
                erro: 'Acesso proibido. Permissão insuficiente para acessar este recurso'
            })
        }
        next()
    }}


app.get('/perfil', autenticarToken,(req,res)=>{
    res.json({
        mensagem: "Bem vindo ao seu perfil protegido",
        usuario: req.usuario
    })
})

app.get('/admin/dashboard', autenticarToken, autorizarCargo('admin'), async(req,res)=>{
    try{
        const todosUsuarios = await pool.query('SELECT id, email, role, criado_em FROM usuarios')
        res.json({
            mensagem: 'Painel Administrativo - Acesso Autorizado',
            totalUsuario: todosUsuarios.rowCount,
            usuarios: todosUsuarios.rows
        })

    }catch(erro){
        res.status(500).json({erro: "Erro ao carregar dados do painel"})
    }
})

app.get('/',(req,res)=>{
    res.json("Servidor seguro rodando com sucesso!")
})

app.listen(3000, '0.0.0.0', ()=>{
    console.log("Servidor seguro rodando com sucesso na porta 3000")
})
