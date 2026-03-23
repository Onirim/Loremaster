-- Table des tags de documents (propres à chaque user)
create table doc_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  color text not null,
  created_at timestamptz default now()
);
alter table doc_tags enable row level security;
create policy "Users manage own doc tags" on doc_tags
  for all using (auth.uid() = user_id);

-- Liaison document ↔ tag
create table document_tags (
  document_id uuid references documents(id) on delete cascade not null,
  tag_id uuid references doc_tags(id) on delete cascade not null,
  primary key (document_id, tag_id)
);
alter table document_tags enable row level security;
create policy "Users manage own document tags" on document_tags
  for all using (
    exists (
      select 1 from documents d where d.id = document_id and d.user_id = auth.uid()
    )
  );

-- Tags locaux pour documents suivis
create table followed_document_tags (
  user_id uuid references auth.users(id) on delete cascade not null,
  document_id uuid references documents(id) on delete cascade not null,
  tag_id uuid references doc_tags(id) on delete cascade not null,
  primary key (user_id, document_id, tag_id)
);
alter table followed_document_tags enable row level security;
create policy "Users manage own followed doc tags" on followed_document_tags
  for all using (auth.uid() = user_id);