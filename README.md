# R16 Meet

Ferramenta privada de videochamada da R16 para reuniões com clientes do
Paraguai: cada pessoa acompanha a reunião no próprio idioma (português do
Brasil ⇄ espanhol). Baseada no projeto aberto
[crafter-station/i18n](https://github.com/crafter-station/i18n).

**Infraestrutura:** Vercel (hospedagem) · Supabase (banco de dados e, em breve,
login) · Daily.co (vídeo) · OpenAI (agente da reunião) · provedor de tradução
configurável (por enquanto `none` ou Palabra).

Detalhes da arquitetura para quem (ou qual IA) for mexer no código: veja o
[AGENTS.md](AGENTS.md).

---

## Rodar no seu computador

### 1. Instale o necessário (uma vez só)

- **Node.js** 20 ou mais novo: <https://nodejs.org>
- **Bun** (roda o projeto):
  ```bash
  npm install -g bun
  ```
  Para conferir, rode `bun --version`.

### 2. Pegue as chaves

| Serviço | O que fazer | Variável no `.env.local` |
|---|---|---|
| **Supabase** | Crie um projeto (região **South America (São Paulo)**). Clique em **Connect** e copie a URL do *Transaction pooler* (porta 6543) e a do *Session pooler* (porta 5432). Troque `[YOUR-PASSWORD]` pela senha do banco. | `DATABASE_URL` (6543) e `DATABASE_MIGRATION_URL` (5432) |
| **Supabase (login)** | *Project Settings* → *API Keys* → copie a URL do projeto e a **publishable key** (`sb_publishable_...`). São públicas. Nunca use a *secret key*. | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Daily.co** | dashboard.daily.co → *Developers* → copie a API key. | `DAILY_API_KEY` |
| **OpenAI** | platform.openai.com → *API keys* → crie uma chave. | `OPENAI_API_KEY` |
| Resend *(opcional)* | Sem ela, os e-mails são só simulados. | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Palabra *(opcional)* | Só se quiser testar a tradução por voz (escolhida no painel de administração). | `PALABRA_API_KEY` (chave `plbr_...`) |

### 3. Configure

Na pasta do projeto:

```bash
bun install
```

Copie o arquivo de exemplo e preencha as chaves:

```bash
Copy-Item .env.example .env.local
```

(Esse é o comando do PowerShell. No Mac ou Linux, use `cp .env.example .env.local`.)

Cada variável está explicada dentro do `.env.example`. O arquivo `.env.local`
**nunca** vai para o GitHub (ele está no `.gitignore`).

### 4. Crie as tabelas no banco (uma vez, e sempre que o esquema mudar)

```bash
bun db:migrate
```

Depois disso, em Supabase → *Table Editor* devem aparecer as tabelas
`rooms`, `participants`, `transcripts`, `team_members` e `app_settings`, cada
uma com a etiqueta "RLS enabled".

### 4b. Crie o primeiro acesso (uma vez)

1. Em Supabase → *Authentication* → *Sign In / Providers*, **desligue**
   "Allow new users to sign up". Assim ninguém cria conta sozinho.
2. Em *Authentication* → *Users* → *Add user* → *Create new user*, crie a sua
   conta com e-mail e senha (marque *Auto Confirm User*).
3. Libere essa conta como administradora, no *SQL Editor* do Supabase
   (troque o e-mail):

   ```sql
   insert into team_members (user_id, role)
   select id, 'admin' from auth.users where email = 'voce@r16.com.br';
   ```

Depois, novas pessoas da equipe são liberadas pelo próprio app, em
**Administração → Equipe**.

### 5. Inicie

```bash
bun dev
```

Abra <http://localhost:3000>.

### Como testar

1. Entre com o seu e-mail e senha. Na página inicial, clique em
   **Nova reunião**. Você vai para a página da sala.
2. Preencha seu nome e entre. Permita câmera e microfone. Aparece o link de
   convite: copie.
3. Abra o link de convite numa **janela anônima** (ou no celular), com outro
   nome. A tela deve estar em espanhol.
4. Confira que um vê **e ouve** o outro. Use fone para evitar eco se os dois
   estiverem no mesmo computador.
5. Confira que, sem o link de convite (ou com o link alterado), a janela
   anônima **não** consegue entrar.
6. Em Supabase → *Table Editor* → `rooms` e `participants`, devem aparecer a
   sala e os dois participantes.

Se algo der errado, a mensagem de erro aparece no terminal onde o `bun dev`
está rodando.

---

## Comandos úteis

| Comando | O que faz |
|---|---|
| `bun dev` | Inicia o app no seu computador |
| `bun run build` | Confere se tudo compila (é o mesmo que a Vercel faz) |
| `bun db:migrate` | Aplica as mudanças no banco de dados |
| `bun db:studio` | Abre um editor visual do banco |
| `bun lint` | Confere o estilo do código (Biome) |

## Licença

MIT (projeto original da Crafter Station).
