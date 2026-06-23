-- Tracks the Telegram messages produced when an index analysis is published,
-- so the author can edit or delete them from the platform within the allowed window.
create table if not exists public.index_analysis_telegram_messages (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.index_analyses(id) on delete cascade,
  chat_id text not null,
  message_id bigint not null,
  kind text not null default 'caption', -- 'caption' = photo caption, 'text' = standalone text message
  created_at timestamptz not null default now()
);

create index if not exists idx_iatm_analysis on public.index_analysis_telegram_messages(analysis_id);

-- Service role only (publisher records, API routes manage via service-role client).
alter table public.index_analysis_telegram_messages enable row level security;
