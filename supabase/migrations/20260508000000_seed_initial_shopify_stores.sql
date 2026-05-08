insert into public.stores (
  slug,
  name,
  base_url,
  source_type,
  country_code,
  currency,
  is_active,
  scan_frequency_minutes
) values
  ('topplay', 'TopPlay Sports Cards', 'https://topplaysportscards.co.nz', 'shopify', 'NZ', 'NZD', true, 1440),
  ('dime-city-cards', 'Dime City Cards', 'https://dimecitycards.com', 'shopify', 'US', 'USD', true, 1440),
  ('sports-cards-nz', 'Sports Cards NZ', 'https://sportscards.co.nz', 'shopify', 'NZ', 'NZD', true, 1440),
  ('Icons of Sport', 'Icons of Sport AU', 'https://iconsofsport.com.au', 'shopify', 'AU', 'AUD', true, 1440)
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  source_type = excluded.source_type,
  country_code = excluded.country_code,
  currency = excluded.currency,
  is_active = excluded.is_active,
  scan_frequency_minutes = excluded.scan_frequency_minutes,
  updated_at = now();
