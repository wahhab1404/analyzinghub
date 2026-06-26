/*
  # Stop duplicate "WINNING TRADE" Telegram cards

  A winning-trade / $100-milestone alert is enqueued from several independent
  paths (indices-trade-tracker cron during the post-win window, the manual-price
  and edit-high API routes, the manual-trade route). Each only de-dupes against
  its own recent history, so the same trade's win card can be posted multiple
  times.

  A $100 milestone is a one-time event per trade, so enforce it at the single
  choke point every path goes through — telegram_outbox — with a BEFORE INSERT
  trigger that drops a winning_trade/milestone row when one already exists for
  the same trade (by trade id, found under any of the payload shapes the various
  callers use). Catches every path at once, no redeploy needed.
*/

CREATE OR REPLACE FUNCTION public.dedupe_win_outbox()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trade text;
begin
  if NEW.message_type not in ('winning_trade', 'milestone') then
    return NEW;
  end if;

  v_trade := coalesce(
    NEW.payload->'trade'->>'id',
    NEW.payload->>'tradeId',
    NEW.payload->>'trade_id'
  );
  if v_trade is null then
    return NEW;  -- no trade id to dedupe on — let it through
  end if;

  -- Already announced a win for this trade? Drop the duplicate.
  if exists (
    select 1 from telegram_outbox o
    where o.message_type in ('winning_trade', 'milestone')
      and coalesce(o.payload->'trade'->>'id', o.payload->>'tradeId', o.payload->>'trade_id') = v_trade
  ) then
    return null;  -- skip the insert silently
  end if;

  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_dedupe_win_outbox ON public.telegram_outbox;
CREATE TRIGGER trg_dedupe_win_outbox
  BEFORE INSERT ON public.telegram_outbox
  FOR EACH ROW
  EXECUTE FUNCTION dedupe_win_outbox();
