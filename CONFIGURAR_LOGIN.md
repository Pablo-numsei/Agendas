# Como ativar as contas e o Diário com IA

O site já tem a interface de entrar/criar conta e a integração com Supabase preparada. Para login e sincronização funcionarem para várias pessoas, é necessário conectar um projeto Supabase. O projeto não será criado sem conferir e confirmar o custo.

## 1. Preparar o projeto Supabase

1. Projeto criado: **Meu Progresso** (`aydwfcmxegcucmmspvib`), região São Paulo.
2. As tabelas do arquivo [setup-supabase.sql](setup-supabase.sql) já foram criadas no banco e protegidas por políticas para cada pessoa acessar somente os próprios dados.
3. A URL e a chave pública já foram conectadas em [index.html](index.html). A chave `sb_publishable_...` pode ficar no site; nunca use uma chave `service_role` ou `sb_secret_...` no navegador.
4. No painel do projeto, abra **Authentication → URL Configuration** e configure o **Site URL** com o endereço usado pelo Live Server (normalmente `http://127.0.0.1:5500`). Inclua também `http://127.0.0.1:5500/**` nas URLs de redirecionamento permitidas. Se o Live Server mostrar outra porta, use o endereço que aparece no navegador.
5. Quando publicar o site, atualize o **Site URL** e adicione também o endereço HTTPS publicado à lista de redirecionamentos permitidos.

## 2. Usar

Abra `index.html` com Live Server. Clique em **Entrar / Criar conta** para criar uma conta com e-mail e senha. Se a confirmação de e-mail estiver ligada no Supabase, confirme o e-mail antes de entrar. O progresso local deste navegador é importado para a primeira conta que entrar sem dados na nuvem; depois, novos registros e áreas são sincronizados.

## Segurança incluída

As tabelas têm Row Level Security e políticas que limitam cada conta às próprias áreas, registros e anotações. O site usa apenas a chave Publishable no navegador; nunca cole uma chave `service_role` neste arquivo.

## 3. Ativar respostas de IA no Diário

O diário guarda anotações neste navegador sem conta. Para sincronizar e solicitar respostas reais da IA, conecte a conta primeiro. A chave da IA fica no servidor, nunca no `index.html`.

1. Crie uma chave de API na plataforma da OpenAI e guarde-a em local seguro. O uso da API pode gerar cobrança. Antes de publicar, configure limites de uso e cobrança no painel da OpenAI.
2. Instale o Supabase CLI e entre na sua conta. Abra um terminal na pasta `outputs`, vincule o projeto Supabase e publique a função `journal-response` que está em `supabase/functions/journal-response/index.ts`.
3. Cadastre a chave como segredo do projeto Supabase, nunca no site: `supabase secrets set OPENAI_API_KEY=sua-chave`.
4. Publique a função com `supabase functions deploy journal-response`. Mantenha a verificação JWT ativada; a função exige uma sessão válida.
5. Execute `setup-supabase.sql` no SQL Editor para criar também a tabela privada `journal_entries`. Se você já executou o arquivo antes, execute-o novamente para aplicar as instruções novas.
6. Abra o Diário, escreva, marque a autorização de envio e escolha **Guardar e pedir resposta da IA**.

A pessoa só envia o texto à IA quando marca a autorização e pede uma resposta. A IA oferece apoio geral, pode errar e não substitui profissional de saúde ou atendimento urgente. Não escreva senhas, endereço, documentos ou dados identificáveis de outras pessoas. Para emergência no Brasil, ligue 192; para apoio emocional, CVV 188.

**Estado atual:** o projeto Supabase, as tabelas seguras e a conexão pública do site já estão configurados. Falta liberar a URL de redirecionamento em Authentication. A IA e as notificações push continuam aguardando as respectivas chaves secretas no servidor.

## 4. Ativar notificações na barra do dispositivo

O site agora tem manifest, ícone, service worker e controles para inscrever/remover um dispositivo. Para receber notificações com a página fechada, é preciso hospedar o site em HTTPS, entrar numa conta, permitir notificações no navegador e configurar o servidor push. O suporte depende do navegador e do sistema; em celulares, pode ser necessário instalar o site na tela inicial. O lembrete envia somente uma mensagem genérica, nunca o humor nem texto do diário.

1. Hospede **todos** os arquivos dentro de `outputs` no mesmo domínio HTTPS, incluindo `manifest.webmanifest`, `icon.svg` e `sw.js`. O site aberto por `file://` não consegue usar service worker; localhost serve para desenvolvimento.
2. Gere um par VAPID uma única vez com Deno, executando na pasta `outputs`: `deno run --allow-net supabase/generate-vapid-keys.ts`. Guarde a saída `keyPair` como segredo; não gere outro par depois que os dispositivos estiverem inscritos. Copie somente `publicKey` para `PUSH_VAPID_PUBLIC_KEY` em `index.html`.
3. No Supabase, execute `setup-supabase.sql` para criar a tabela de inscrições push. Em **Edge Function Secrets**, configure `PUSH_VAPID_KEYS_JSON` (o objeto `keyPair` inteiro gerado), `PUSH_VAPID_SUBJECT` (por exemplo, `mailto:seu-email@exemplo.com`), `PUSH_CRON_SECRET` (um valor aleatório e longo) e `PUSH_SUPABASE_SECRET_KEY` (chave secreta do projeto). Essas chaves ficam só no servidor.
4. Publique as funções `journal-response` e `send-due-push` com a configuração de `supabase/config.toml`. A função agendada valida o segredo interno do Cron e usa a chave secreta somente no servidor.
5. Ative `pg_cron` e `pg_net` em **Integrations**. No **Vault**, crie os segredos `push_function_url` com `https://SEU-PROJETO.supabase.co/functions/v1/send-due-push` e `push_cron_secret` com o mesmo valor configurado como `PUSH_CRON_SECRET`.
6. Execute uma vez `setup-push-cron.sql` para chamar a função a cada minuto. Depois entre no site e escolha **Ativar notificações neste dispositivo** em “Meu dia”. A autorização é por dispositivo e pode ser revogada nas configurações do navegador ou pelo botão de desativar.

O lembrete respeita horário, dias escolhidos e fuso do dispositivo, e não envia notificação se a pessoa já fez o check-in naquele dia. O site precisa estar publicado em HTTPS; a página aberta em Live Server não permite que o Supabase envie push até esse agendamento estar configurado.

## 5. Preparar o mural da comunidade

O mural exige que a pessoa entre na conta para publicar. Os relatos têm temas, filtros por tema e sentimento, reações acolhedoras e opção para apagar uma publicação própria. As reações não expõem quem reagiu. Relatos e fotos entram como **pendentes** e só ficam visíveis para outras pessoas depois da revisão. Para um projeto novo, execute `community-setup.sql` e depois `community-enhancements.sql` no SQL Editor. O segundo arquivo cria as reações e os temas. A foto aceita JPG, PNG ou WebP de até 4 MB; endereço exato e localização automática não são coletados.

Antes de salvar, a função `community-submit` envia o texto e, se houver, a foto à API de moderação da OpenAI. Ela bloqueia mensagens sinalizadas por assédio, discurso de ódio, ameaças ou instruções perigosas. A análise separada das fotos bloqueia conteúdo sexualizado, violento ou de automutilação. A interface proíbe imagens de menores e exige confirmação ao anexar uma foto. Se a análise falhar, o envio também é interrompido. A função está publicada no projeto conectado e exige login. Para ativar a revisão, crie uma chave de API na plataforma da OpenAI e adicione `OPENAI_API_KEY` em **Supabase → Edge Functions → Secrets**. Nunca coloque essa chave em `index.html`. Sem o segredo, nenhum relato é salvo. Conteúdos que passam pela IA ainda ficam pendentes para revisão humana: a IA não publica por conta própria. A moderação aceita texto e imagem, mas não é infalível. Não envie material que possa envolver abuso sexual infantil: a API não foi feita para detectar nem tratar esse material. A OpenAI informa que a API de moderação é gratuita atualmente; confira as condições vigentes antes de publicar. Para revisar publicações, entre no site com a conta autorizada e abra **Comunidade → Revisão da comunidade**. A tela mostra o texto completo e a foto; use **Aprovar e publicar** ou **Remover relato**. A função `community-review` valida a conta no servidor e disponibiliza imagens por links temporários. A conta autorizada está definida para este projeto. O código não publica automaticamente: é necessário revisar os relatos antes de abrir o mural para outras pessoas. O apelido e a aparência são opcionais; o e-mail e o identificador da conta não aparecem no mural. Mesmo com o anonimato ativado, a pessoa deve evitar incluir dados pessoais no texto ou nas fotos.
