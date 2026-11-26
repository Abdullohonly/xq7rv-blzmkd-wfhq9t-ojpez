-- Lahzam: Neon (Postgres) sxemasi
create table if not exists users (
  id            bigserial primary key,
  username      text not null unique check (username ~ '^[a-z0-9._]{3,20}$' and username !~ '^\.|\.$|\.\.'),
  name          text not null check (char_length(name) between 1 and 40),
  bio           text not null default '' check (char_length(bio) <= 160),
  color         text not null default '#FFD9C7',
  email         text unique,
  google_sub    text unique,
  password_hash text,
  is_system     boolean not null default false,
  is_blocked    boolean not null default false,
  warns         int not null default 0,
  photo         text,
  created_at    timestamptz not null default now()
);
-- Bloklangan Gmail'lar: qayta ro'yxatdan o'ta olmaydi
create table if not exists banned_emails (email text primary key, created_at timestamptz not null default now());
-- Asoschi: ro'yxatdan o'tish tartibida birinchi 50 kishi (tizim akkauntlarisiz)
create or replace view founders as
  select id from users where not is_system order by id limit 50;

create table if not exists follows (
  follower_id bigint not null references users(id) on delete cascade,
  followee_id bigint not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table if not exists posts (
  id         bigserial primary key,
  user_id    bigint not null references users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  body_hash  text not null,
  is_lahza   boolean not null default false,        -- 24 soatdan keyin ko'rinmaydi
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_user_idx on posts (user_id, created_at desc);

create table if not exists post_likes (
  post_id bigint not null references posts(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  primary key (post_id, user_id)
);
create table if not exists post_views (
  post_id bigint not null references posts(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  primary key (post_id, user_id)
);
create table if not exists replies (
  id         bigserial primary key,
  post_id    bigint not null references posts(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create table if not exists reports (
  post_id     bigint not null references posts(id) on delete cascade,
  reporter_id bigint not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

create table if not exists chats (
  id           bigserial primary key,
  kind         text not null check (kind in ('dm', 'group')),
  name         text,
  description  text not null default '',
  category     text,
  access       text check (access in ('open', 'ask', 'closed')),
  color        text not null default '#BDEBD6',
  admin_id     bigint references users(id),
  flappy_score int,
  flappy_user  bigint references users(id),
  created_at   timestamptz not null default now()
);
create table if not exists chat_members (
  chat_id   bigint not null references chats(id) on delete cascade,
  user_id   bigint not null references users(id) on delete cascade,
  status    text not null default 'member' check (status in ('member', 'pending')),
  last_read timestamptz not null default now(),
  primary key (chat_id, user_id)
);
create table if not exists messages (
  id         bigserial primary key,
  chat_id    bigint not null references chats(id) on delete cascade,
  user_id    bigint references users(id) on delete set null,   -- null = tizim xabari
  body       text not null check (char_length(body) between 1 and 2000),
  is_game    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_idx on messages (chat_id, created_at);
create table if not exists reactions (
  message_id bigint not null references messages(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️','👎','⭐','🫶','😂','😮','😢','🤲')),
  primary key (message_id, user_id)
);
-- ⭐ Foydali: profilda bitta odamdan faqat bittasi hisoblanadi
create table if not exists foydali (
  giver_id    bigint not null references users(id) on delete cascade,
  receiver_id bigint not null references users(id) on delete cascade,
  primary key (giver_id, receiver_id),
  check (giver_id <> receiver_id)
);

create table if not exists notifications (
  id         bigserial primary key,
  user_id    bigint not null references users(id) on delete cascade,
  body       text not null,
  link       text not null default '/',
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, is_read, created_at desc);

create table if not exists spam_log (
  id         bigserial primary key,
  user_id    bigint references users(id) on delete cascade,
  reason     text not null,
  created_at timestamptz not null default now()
);

-- @flappy tizim akkaunti: hech kimni kuzatmaydi, faqat kuzatuvchilari bor
insert into users (username, name, bio, color, is_system)
values ('flappy', 'Flappy', 'Istalgan chat yoki guruhda @flappy deb yozing va o‘ynang.', '#FFC531', true)
on conflict (username) do nothing;

-- Urinishlarni cheklash (login, admin fraza, ro'yxatdan o'tish)
create table if not exists rate_limits (k text primary key, n int not null default 0, reset_at timestamptz not null);
-- Admin sirli frazasi: faqat scrypt+pepper xeshi saqlanadi, fraza o'zi hech qayerda yo'q
create table if not exists admin_secrets (id text primary key, hash text not null, created_at timestamptz not null default now());

-- Lahzam Updates: faqat ega yozadi, hamma o'qiydi
create table if not exists updates (
  id         bigserial primary key,
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- v1.0.0: postlar, guruhlar va chatlar serverda (Telegram uslubidagi chat)
alter table messages drop constraint if exists messages_body_check;
alter table messages add constraint messages_body_check check (char_length(body) <= 2000);
alter table messages add column if not exists reply_to bigint, add column if not exists edited boolean not null default false,
  add column if not exists img text, add column if not exists poll jsonb, add column if not exists fwd_user bigint,
  add column if not exists is_sys boolean not null default false;
alter table chats add column if not exists pin_id bigint;
create table if not exists poll_votes (message_id bigint not null references messages(id) on delete cascade, user_id bigint not null references users(id) on delete cascade, opt int not null, primary key (message_id, user_id));
alter table users add column if not exists dm_from text not null default 'all', add column if not exists notif_off boolean not null default false, add column if not exists rr_off boolean not null default false;
create index if not exists replies_post_idx on replies (post_id, created_at);
create index if not exists chat_members_user_idx on chat_members (user_id);
create index if not exists reactions_msg_idx on reactions (message_id);
-- Guruh admini yoki rekordchi o'chirilsa, guruh saqlanib qoladi
alter table chats drop constraint if exists chats_admin_id_fkey;
alter table chats add constraint chats_admin_id_fkey foreign key (admin_id) references users(id) on delete set null;
alter table chats drop constraint if exists chats_flappy_user_fkey;
alter table chats add constraint chats_flappy_user_fkey foreign key (flappy_user) references users(id) on delete set null;
-- Postga rasm (Cloudflare R2 havolasi yoki zaxira sifatida dataURL)
alter table posts add column if not exists img text;
alter table posts drop constraint if exists posts_body_check;
alter table posts add constraint posts_body_check check (char_length(body) <= 500);
-- Kommentga javob
alter table replies add column if not exists parent_id bigint references replies(id) on delete set null;
-- Tetris rekordi (har chatda)
alter table chats add column if not exists tetris_score int, add column if not exists tetris_user bigint references users(id) on delete set null;
-- 1.1.0: onlayn holat, yozmoqda, 2048 rekordi, push obunalari
alter table users add column if not exists last_seen timestamptz;
alter table chat_members add column if not exists typing_at timestamptz;
alter table chats add column if not exists g2048_score int, add column if not exists g2048_user bigint references users(id) on delete set null;
create table if not exists push_subs (id bigserial primary key, user_id bigint not null references users(id) on delete cascade, endpoint text not null unique, p256dh text not null, auth text not null, created_at timestamptz not null default now());
create index if not exists push_subs_user on push_subs(user_id);
-- 1.1.7: guruh admini a'zoni chetlatishi (ban) mumkin
do $$ declare k text; begin
  select conname into k from pg_constraint where conrelid = 'chat_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%pending%' and pg_get_constraintdef(oid) not like '%banned%';
  if k is not null then execute 'alter table chat_members drop constraint ' || quote_ident(k);
    alter table chat_members add constraint chat_members_status_check check (status in ('member', 'pending', 'banned')); end if;
end $$;
-- 1.2.0: foydalanish shartlari va maxfiylik siyosatiga rozilik (13+)
alter table users add column if not exists terms_ver int not null default 0, add column if not exists terms_at timestamptz;
-- 1.3.0: @tetris va @2048 tizim akkauntlari (Flappy kabi)
insert into users (username, name, bio, color, is_system, terms_ver) values
  ('tetris', 'Tetris', 'Istalgan chat yoki guruhda @tetris deb yozing va o‘ynang. Har chatning o‘z rekordi bor!', '#B07CFF', true, 1),
  ('2048', '2048', 'Istalgan chat yoki guruhda @2048 deb yozing va o‘ynang. Bir xil sonlarni qo‘shib, 2048 ga yeting!', '#FFC531', true, 1)
on conflict (username) do nothing;
alter table posts add column if not exists edited boolean not null default false;
-- 1.5.0: statistika, rejalashtirilgan xabarlar, ilova ikonkasi
alter table post_views add column if not exists created_at timestamptz not null default now();
alter table messages add column if not exists scheduled boolean not null default false;
alter table users add column if not exists app_icon text;
