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
| **Daily.co** | dashboard.daily.co → *Developers* → copie a API key. | `DAILY_API_KEY` |
| **OpenAI** | platform.openai.com → *API keys* → crie uma chave. | `OPENAI_API_KEY` |
| Resend *(opcional)* | Sem ela, os e-mails são só simulados. | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Palabra *(opcional)* | Só se quiser testar com `TRANSLATION_PROVIDER=palabra`. | `PALABRA_CLIENT_ID`, `PALABRA_CLIENT_SECRET` |

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
`rooms`, `participants` e `transcripts`, cada uma com a etiqueta
"RLS enabled".

### 5. Inicie

```bash
bun dev
```

Abra <http://localhost:3000>.

### Como testar

1. Na página inicial, clique em **Start Call** (ou **Create Room**). Você vai
   para a página da sala.
2. Preencha seu nome e entre. Permita câmera e microfone.
3. Copie o link da sala e abra em **outro navegador** (ou no celular/outro
   computador), com outro nome.
4. Confira que um vê **e ouve** o outro. Use fone para evitar eco se os dois
   estiverem no mesmo computador.
5. Em Supabase → *Table Editor* → `rooms` e `participants`, devem aparecer a
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
