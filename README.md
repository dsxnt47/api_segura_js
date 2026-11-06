# 🔐 API Segura JS

API REST de autenticação e autorização construída com **Node.js**, **Express** e **PostgreSQL**. Implementa cadastro de usuários, login com JWT (access token + refresh token), controle de acesso por cargo (roles) e diversas camadas de segurança.

## ✨ Funcionalidades

- Cadastro de usuários com senha criptografada (**bcrypt**)
- Login com **JWT** (access token de 15 min + refresh token de 7 dias)
- Renovação de token (`/refresh`) e logout com revogação da sessão
- Refresh tokens armazenados no banco, permitindo revogação
- Controle de acesso por cargo (`user` / `admin`)
- Validação de dados de entrada com **Zod**
- Proteção de cabeçalhos HTTP com **Helmet**
- Limitação de requisições com **express-rate-limit**
- Tratamento de JSON malformado

## 🛠️ Tecnologias

| Tecnologia | Uso |
|---|---|
| [Express](https://expressjs.com/) | Framework web |
| [PostgreSQL](https://www.postgresql.org/) + [pg](https://node-postgres.com/) | Banco de dados |
| [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | Geração/validação de JWT |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | Hash de senhas |
| [Zod](https://zod.dev/) | Validação de schemas |
| [Helmet](https://helmetjs.github.io/) | Headers de segurança |
| [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit) | Rate limiting |
| [cors](https://github.com/expressjs/cors) | Controle de CORS |
| [dotenv](https://github.com/motdotla/dotenv) | Variáveis de ambiente |

## 📁 Estrutura do projeto

```
api_segura_js/
├── node_modules/
├── .env
├── package.json
├── package-lock.json
└── server.js
```

## 🚀 Como executar

### Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [PostgreSQL](https://www.postgresql.org/) em execução

### 1. Clone o repositório

```bash
git clone https://github.com/SEU_USUARIO/api_segura_js.git
cd api_segura_js
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_do_banco
JWT_TOKEN=sua_chave_secreta_para_access_token
JWT_REFRESH_TOKEN=sua_chave_secreta_para_refresh_token
```

> ⚠️ Use chaves longas e aleatórias em produção. Nunca versione o arquivo `.env`.

### 4. Crie as tabelas no banco

```sql
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5. Inicie o servidor

```bash
node server.js
```

O servidor ficará disponível em `http://localhost:3000`.

## 📡 Endpoints

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| GET | `/` | Não | Verifica se o servidor está no ar |
| POST | `/register` | Não | Cadastra um novo usuário |
| POST | `/login` | Não | Realiza login e retorna os tokens |
| POST | `/refresh` | Não | Gera um novo access token |
| POST | `/logout` | Não | Revoga o refresh token |
| GET | `/perfil` | Bearer token | Retorna os dados do usuário autenticado |
| GET | `/admin/dashboard` | Bearer token + `admin` | Lista todos os usuários |

### `POST /register`

**Body:**

```json
{
  "email": "usuario@exemplo.com",
  "senha": "123456",
  "role": "user"
}
```

- `email`: obrigatório, formato válido
- `senha`: obrigatório, mínimo de 6 caracteres
- `role`: opcional (`user` ou `admin`), padrão `user`

**Resposta (201):**

```json
{
  "mensagem": "Uusário cadastrado no PostgresSQL com sucesso",
  "usuario": [
    { "id": 1, "email": "usuario@exemplo.com", "criado_em": "2026-11-06T12:00:00.000Z" }
  ]
}
```

**Erros:** `400` (dados inválidos ou e-mail já cadastrado), `500` (erro interno).

### `POST /login`

**Body:** igual ao de `/register`.

**Resposta (200):**

```json
{
  "mensagem": "Login realizado",
  "acessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Erros:** `401` (credenciais ou dados inválidos), `429` (limite de tentativas), `500`.

### `POST /refresh`

**Body:**

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }
```

**Resposta (200):**

```json
{ "acessToken": "eyJhbGciOiJIUzI1NiIs..." }
```

**Erros:** `401` (token não fornecido), `403` (token inválido, revogado ou expirado), `500`.

### `POST /logout`

**Body:**

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIs..." }
```

**Resposta (200):**

```json
{ "mensagem": "Logout realizado e sessão revogada com sucesso" }
```

### `GET /perfil`

**Header:**

```
Authorization: Bearer <acessToken>
```

**Resposta (200):**

```json
{
  "mensagem": "Bem vindo ao seu perfil protegido",
  "usuario": { "id": 1, "email": "usuario@exemplo.com", "role": "user", "iat": 1730000000, "exp": 1730000900 }
}
```

**Erros:** `401` (token ausente), `403` (token inválido ou expirado).

### `GET /admin/dashboard`

Requer token válido de um usuário com `role: admin`.

**Resposta (200):**

```json
{
  "mensagem": "Painel Administrativo - Acesso Autorizado",
  "totalUsuario": 2,
  "usuarios": [
    { "id": 1, "email": "admin@exemplo.com", "role": "admin", "criado_em": "..." }
  ]
}
```

**Erros:** `401`, `403` (permissão insuficiente), `500`.

## 🔄 Fluxo de autenticação

1. O cliente faz `POST /login` e recebe `acessToken` (15 min) e `refreshToken` (7 dias).
2. O cliente envia o `acessToken` no header `Authorization: Bearer ...` nas rotas protegidas.
3. Quando o `acessToken` expira, o cliente chama `POST /refresh` com o `refreshToken`.
4. No `POST /logout`, o `refreshToken` é removido do banco e deixa de ser válido.

## 🛡️ Segurança

- Senhas armazenadas com hash **bcrypt** (10 salt rounds)
- Mensagens genéricas de erro no login (`Credenciais inválidas`), evitando enumeração de usuários
- Queries parametrizadas, protegendo contra **SQL Injection**
- Schema Zod com `.strict()`, rejeitando campos não previstos
- Headers de segurança via **Helmet**
- **Rate limiting** global (5 req/min) e específico para `/login` (5 req/min)
- Refresh tokens persistidos e revogáveis

## 📝 Observações

Este projeto é uma **demonstração** de autenticação com JWT. Algumas escolhas foram feitas para facilitar os testes locais e devem ser revistas em produção:

- O campo `role` pode ser enviado livremente no `/register` (permite criar um `admin` para testar a rota protegida)
- As chaves JWT têm valores padrão (fallback) no código; em produção, exija as variáveis de ambiente
- O CORS está aberto (`origin: '*'`); em produção, restrinja aos domínios do seu front-end
- O rate limit global (5 requisições/minuto por IP) é baixo de propósito; ajuste conforme o uso real
- Todo o código está em um único arquivo (`server.js`) para simplificar a leitura

### Ideias de evolução

- [ ] Separar o código em módulos (routes, controllers, middlewares)
- [ ] Adicionar testes automatizados
- [ ] Adicionar scripts `start` / `dev` (nodemon) no `package.json`
- [ ] Rotacionar o refresh token a cada uso

## 📄 Licença

Este projeto está sob a licença MIT. Consulte o arquivo `LICENSE` para mais detalhes.

## 👤 Autor

Feito por **SEU NOME** — [GitHub](https://github.com/SEU_USUARIO)
