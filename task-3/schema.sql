create table materials (
  id bigserial primary key,
  chat_id bigint not null,
  url text,
  title text,
  content text,
  summary text,
  key_points jsonb,
  main_concepts jsonb,
  difficulty text,
  added_date timestamptz default now()
);

create table questions (
  id bigserial primary key,
  material_id bigint references materials(id) on delete cascade,
  idx int,
  question text,
  options jsonb,
  correct_answer text,
  explanation text
);

create table user_state (
  chat_id bigint primary key,
  current_material_id bigint,
  current_question_idx int default 0,
  correct_count int default 0,
  answers jsonb default '[]'::jsonb
);
