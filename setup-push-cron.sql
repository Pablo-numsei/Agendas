-- Execute once after replacing the project URL and creating the two Vault secrets.
-- Enable pg_cron and pg_net in Supabase Dashboard > Integrations first.
-- In Vault, save:
--   Name: push_function_url  Value: https://SEU-PROJETO.supabase.co/functions/v1/send-due-push
--   Name: push_cron_secret   Value: the same long random value as PUSH_CRON_SECRET
-- Never put PUSH_CRON_SECRET in the website or commit it to source control.

select cron.schedule(
  'send-daily-push-reminders',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret' limit 1)
      ),
      body := '{}'::jsonb
    );
  $$
);
