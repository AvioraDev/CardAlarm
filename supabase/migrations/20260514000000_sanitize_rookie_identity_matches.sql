update public.product_card_matches
set
  matched_player_name = null,
  matched_player_id = null,
  matched_fields = case
    when jsonb_typeof(coalesce(matched_fields, '[]'::jsonb)) = 'array'
      then coalesce((
        select jsonb_agg(field)
        from jsonb_array_elements_text(coalesce(matched_fields, '[]'::jsonb)) as fields(field)
        where lower(field) <> 'player'
      ), '[]'::jsonb)
    else matched_fields
  end,
  match_reasons = case
    when jsonb_typeof(coalesce(match_reasons, '[]'::jsonb)) = 'array'
      then coalesce((
        select jsonb_agg(reason)
        from jsonb_array_elements_text(coalesce(match_reasons, '[]'::jsonb)) as reasons(reason)
        where reason <> 'Watchlist player name found in title'
      ), '[]'::jsonb)
    else match_reasons
  end,
  updated_at = now()
where lower(trim(coalesce(matched_player_name, ''))) in ('rookie', 'rookies', 'rc');
