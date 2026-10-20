# Guia do projeto — Meu Progresso

Este site ajuda uma pessoa a acompanhar pequenas metas, registrar atividades e refletir sobre o próprio dia. Também tem uma área de comunidade com relatos revisados antes da publicação e informações para buscar apoio em saúde mental.

## Como abrir

1. Abra a pasta `outputs` no Visual Studio Code.
2. Abra o arquivo `index.html` com a extensão **Live Server** (clique com o botão direito e escolha **Open with Live Server**).
3. O site abrirá no navegador, normalmente em `http://127.0.0.1:5500`.

Mantenha todos os arquivos da pasta juntos. O `index.html` usa os outros arquivos de JavaScript, o ícone e o service worker.

## Arquivos principais

- `index.html` — estrutura e aparência das páginas, navegação, painel de evolução, registros, diário, dicas e acesso ao Supabase.
- `community.js` — formulário de relatos, prévia e cancelamento de foto, mural, reações e perfil da comunidade.
- `community-review.js` — tela para a conta de moderação conferir o texto e a foto e aprovar ou remover relatos.
- `supabase/functions/community-submit/index.ts` — valida o relato, envia texto e foto para a verificação automática e guarda os aprovados pela triagem como pendentes.
- `supabase/functions/community-review/index.ts` — entrega a fila de relatos à conta de moderação e salva a decisão humana. As fotos são mostradas por links temporários.
- `supabase/functions/journal-response/index.ts` — função de respostas de IA para o diário.
- `supabase/functions/send-due-push/index.ts` — envio de lembretes push, quando o servidor push estiver configurado.
- `community-setup.sql`, `community-enhancements.sql` e `setup-supabase.sql` — instruções que criam tabelas, regras de acesso e recursos do banco.
- `supabase/config.toml` — configurações das funções do Supabase.
- `sw.js`, `manifest.webmanifest` e `icon.svg` — suporte de instalação e notificações do site.
- `CONFIGURAR_LOGIN.md` — guia detalhado de configuração do Supabase e recursos conectados.

## Como explicar a revisão dos relatos

1. A pessoa envia um relato e, se quiser, uma foto.
2. O servidor pede uma triagem automática à OpenAI. Se a análise não puder ser concluída, o envio é interrompido.
3. Se passar pela triagem, o relato fica **pendente**. A IA não o publica sozinha.
4. A conta autorizada abre **Comunidade → Revisão da comunidade**, lê o texto, confere a foto e escolhe **Aprovar e publicar** ou **Remover relato**.

A triagem automática pode errar. A revisão humana continua necessária, e o mural não substitui atendimento profissional ou de emergência.

## Tecnologias usadas

- HTML, CSS e JavaScript no site.
- Supabase Auth para contas; banco Postgres para registros; Storage para fotos; Edge Functions para operações protegidas.
- API de moderação da OpenAI chamada apenas pelo servidor.

## Antes de compartilhar

- Para mostrar o projeto, envie a pasta `outputs` inteira; não envie apenas `index.html`.
- O site está conectado ao projeto Supabase usado no desenvolvimento. Uma pessoa que abrir a página poderá ver conteúdo público do mural. Não peça para ela enviar relatos de teste ou usar sua conta.
- A URL do Supabase e a chave **Publishable** no `index.html` são destinadas ao navegador. Mesmo assim, não compartilhe senhas, chaves secretas do Supabase, `OPENAI_API_KEY` nem arquivos com dados pessoais.
- A função de revisão está configurada para a conta de moderação do projeto atual. Em uma cópia do projeto, o responsável precisará configurar a própria conta autorizada no servidor antes de usar a revisão.
- Se for publicar o site para outras pessoas, revise primeiro as políticas de privacidade, segurança, moderação e suporte. O mural trata de relatos pessoais.

## Como apresentar o código

Uma forma simples de explicar é: “O HTML organiza as páginas; o CSS define o visual; o JavaScript faz os botões e formulários funcionarem; e o Supabase guarda as contas e os dados. As funções do servidor protegem as chaves e fazem a triagem dos relatos.”

O `index.html` ainda reúne bastante código em um único arquivo. Por isso pode parecer longo; aos poucos, partes maiores podem ser separadas em arquivos próprios.
