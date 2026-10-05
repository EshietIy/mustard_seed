-- Development/test seed: the sample items shown in docs/landing-page.pdf.
-- There are no photos until real ones are supplied. Applied by `supabase db reset`;
-- NEVER run against production.
--
-- PRICES BELOW ARE FAKE TEST VALUES (₦1,234 / ₦2,345 / ...), only so checkout can be
-- tried locally. They are not the restaurant's prices; real prices are set by the owner.

insert into public.menu_items
  (slug, name, description, category, is_house_signature, is_fresh_juice, sort_order, price_kobo)
values
  ('edikang-ikong', 'Edikang Ikong',
   'Ugu and waterleaf soup, rich with periwinkle, kpomo, stockfish and assorted meat.',
   'calabar_classics', true, false, 10, 123400),
  ('afang-soup', 'Afang Soup',
   'Hand-shredded afang leaves and waterleaf, slow-cooked with palm oil and dried fish.',
   'calabar_classics', false, false, 20, 234500),
  ('ekpang-nkukwo', 'Ekpang Nkukwo',
   'Grated cocoyam and water yam wrapped in cocoyam leaves, simmered in a peppery palm-oil broth.',
   'calabar_classics', true, false, 30, 345600),
  ('atama-soup', 'Atama Soup',
   'Fragrant atama leaves in a palm-fruit base with fresh and smoked fish.',
   'calabar_classics', false, false, 40, 456700),
  ('fisherman-soup', 'Fisherman Soup',
   'The day''s catch with periwinkle and prawns in a hot, light broth.',
   'calabar_classics', false, false, 50, 567800),
  ('afia-efere', 'Afia Efere',
   'Efik white soup with goat meat, thickened with yam and spiced with uyayak.',
   'calabar_classics', false, false, 60, 678900),
  ('zobo', 'Zobo', '', 'drinks', false, true, 10, 12300),
  ('pineapple-ginger', 'Pineapple & ginger', '', 'drinks', false, true, 20, 23400),
  ('watermelon', 'Watermelon', '', 'drinks', false, true, 30, 34500),
  -- Swallow & sides (fake test prices; the owner will supply the real list and prices).
  ('pounded-yam', 'Pounded Yam', 'Smooth pounded yam, to go with any soup.', 'swallow_sides', false, false, 10, 78900),
  ('eba', 'Eba', 'Garri swallow, to go with any soup.', 'swallow_sides', false, false, 20, 45600),
  ('fufu', 'Fufu', 'Cassava fufu, to go with any soup.', 'swallow_sides', false, false, 30, 56700),
  ('semo', 'Semo', 'Semovita swallow, to go with any soup.', 'swallow_sides', false, false, 40, 67800),
  ('wheat', 'Wheat', 'Wheat swallow, to go with any soup.', 'swallow_sides', false, false, 50, 34500);

-- Soup protein choice (group and options come from the option-groups migration).
-- Fisherman Soup is seafood, so Beef is not offered on it.
insert into public.menu_item_option_groups (menu_item_id, group_id, sort_order)
select m.id, g.id, 10
  from public.menu_items m
  cross join public.option_groups g
 where g.name = 'Soup protein'
   and m.slug in ('edikang-ikong', 'afang-soup', 'atama-soup', 'fisherman-soup', 'afia-efere');

insert into public.menu_item_option_overrides (menu_item_id, option_id, is_excluded)
select m.id, o.id, true
  from public.menu_items m
  join public.option_groups g on g.name = 'Soup protein'
  join public.options o on o.group_id = g.id and o.name = 'Beef'
 where m.slug = 'fisherman-soup';
