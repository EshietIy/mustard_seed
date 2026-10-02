-- Development/test seed: the sample items shown in docs/landing-page.pdf.
-- Prices are NULL ([PRICE] placeholder) and there are no photos until real
-- data is supplied. Applied by `supabase db reset`; never run against production
-- without the owner's approval.

insert into public.menu_items
  (slug, name, description, category, is_house_signature, is_fresh_juice, sort_order)
values
  ('edikang-ikong', 'Edikang Ikong',
   'Ugu and waterleaf soup, rich with periwinkle, kpomo, stockfish and assorted meat.',
   'calabar_classics', true, false, 10),
  ('afang-soup', 'Afang Soup',
   'Hand-shredded afang leaves and waterleaf, slow-cooked with palm oil and dried fish.',
   'calabar_classics', false, false, 20),
  ('ekpang-nkukwo', 'Ekpang Nkukwo',
   'Grated cocoyam and water yam wrapped in cocoyam leaves, simmered in a peppery palm-oil broth.',
   'calabar_classics', true, false, 30),
  ('atama-soup', 'Atama Soup',
   'Fragrant atama leaves in a palm-fruit base with fresh and smoked fish.',
   'calabar_classics', false, false, 40),
  ('fisherman-soup', 'Fisherman Soup',
   'The day''s catch with periwinkle and prawns in a hot, light broth.',
   'calabar_classics', false, false, 50),
  ('afia-efere', 'Afia Efere',
   'Efik white soup with goat meat, thickened with yam and spiced with uyayak.',
   'calabar_classics', false, false, 60),
  ('zobo', 'Zobo', '', 'drinks', false, true, 10),
  ('pineapple-ginger', 'Pineapple & ginger', '', 'drinks', false, true, 20),
  ('watermelon', 'Watermelon', '', 'drinks', false, true, 30);
