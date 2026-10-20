-- Phase 3: knowledge and retrieval.
--   * diacritic-insensitive text search (Serbian is often typed without č/ć/ž/š/đ)
--   * the full-text column weights the question above the answer
--   * match_faqs: optional language filter, stop words dropped from the text query, and
--     prefix matching so Serbian word endings ("povraćaj" / "povraćaja") still meet.
-- The numbers behind these choices are in docs/RETRIEVAL_REPORT.md.

create extension if not exists unaccent with schema extensions;

-- Mirrors normalizeForSearch() in src/lib/faqs/text.ts: lowercase, đ→dj, diacritics
-- folded, whitespace collapsed (same words; punctuation may differ, search ignores it). IMMUTABLE so a generated column can use it; that holds
-- because the dictionary is named explicitly and never changes at runtime.
-- In `public` (like is_valid_origin_list) because inserts by `authenticated` evaluate it
-- through the generated column.
create or replace function public.search_normalize(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(extensions.unaccent(
      'extensions.unaccent'::regdictionary,
      replace(replace(p_text, 'đ', 'dj'), 'Đ', 'dj')
    )),
    '\s+', ' ', 'g'
  ));
$$;

revoke all on function public.search_normalize(text) from public, anon;
grant execute on function public.search_normalize(text) to authenticated, service_role;

-- Rebuild the full-text column on normalized text, question weighted A, answer B.
drop index if exists public.faqs_fts_idx;
alter table public.faqs drop column fts;
alter table public.faqs add column fts tsvector generated always as (
  setweight(to_tsvector('simple', public.search_normalize(question)), 'A')
  || setweight(to_tsvector('simple', public.search_normalize(answer)), 'B')
) stored;
create index faqs_fts_idx on public.faqs using gin (fts);

-- Retrieval keeps one bot's FAQs in one language together.
create index if not exists faqs_bot_language_idx on public.faqs (bot_id, language);

-- The old signature is replaced (nothing calls it yet).
drop function if exists public.match_faqs(uuid, extensions.vector, text, integer, boolean);

-- ---------------------------------------------------------------------------------------
-- match_faqs: retrieval over one bot's FAQs (optionally one language).
-- Vector: cosine similarity on `embedding` (HNSW). Hybrid: reciprocal-rank fusion (k = 60)
-- of the vector ranking with a full-text ranking over normalized text.
--
-- Text query: the normalized query's words minus stop words, OR-ed. Words longer than five
-- letters lose their last two and match as a prefix ("povracaja" → "povrac:*"), a crude
-- stemmer that lets Serbian case endings meet. Lexemes are quote_literal-ed, so visitor
-- text never reaches tsquery syntax.
--
-- The text ranking changes the ORDER only when p_hybrid is set or there is no query
-- embedding (text-only fallback). `keyword_overlap` is the share of the query's content
-- words found in the FAQ's QUESTION (0..1, null without content words); callers use it as
-- corroboration when deciding whether to answer.
--
-- SECURITY INVOKER: the playground calls it as the owner (RLS applies); the widget API
-- calls it with the service role and the bot it resolved from the public key.
-- ---------------------------------------------------------------------------------------
create or replace function public.match_faqs(
  p_bot_id uuid,
  p_query_embedding extensions.vector(384),
  p_query_text text,
  p_k integer default 5,
  p_hybrid boolean default false,
  p_language text default null
)
returns table (
  id uuid,
  question text,
  answer text,
  language text,
  featured boolean,
  similarity double precision,
  vector_rank integer,
  text_rank integer,
  rrf_score double precision,
  keyword_overlap double precision
)
language sql
stable
security invoker
set search_path = ''
set hnsw.iterative_scan = 'relaxed_order'
as $$
  with params as (
    select least(greatest(coalesce(p_k, 5), 1), 50) as k
  ),
  raw_words as (
    select distinct w
      from unnest(tsvector_to_array(
             to_tsvector('simple', coalesce(public.search_normalize(left(p_query_text, 1000)), ''))
           )) as w
     where char_length(w) >= 2
       -- Too common to say anything about a question (already folded), EN then SR.
       and w <> all (array[
         'a', 'about', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'but', 'by', 'can',
         'could', 'do', 'does', 'for', 'from', 'get', 'have', 'how', 'i', 'if', 'in', 'into',
         'is', 'it', 'its', 'long', 'many', 'me', 'much', 'my', 'of', 'on', 'or', 'our', 'so',
         'than', 'that', 'the', 'their', 'there', 'this', 'to', 'was', 'we', 'what', 'when',
         'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
         'ako', 'ali', 'bi', 'da', 'ga', 'gde', 'ima', 'imate', 'iz', 'je', 'jos', 'ju',
         'kad', 'kada', 'kako', 'koja', 'koje', 'koji', 'koliko', 'li', 'mi', 'mogu', 'moze',
         'na', 'ne', 'nije', 'o', 'od', 'po', 'sa', 'se', 'si', 'sta', 'su', 'te', 'ti',
         'treba', 'u', 'uz', 'vam', 'vas', 'za', 'ze', 'zelim', 'biti', 'ce', 'cu', 'ste',
         'sam', 'smo', 'moj', 'moja', 'moje', 'vasa', 'vase', 'vasi'
       ]::text[])
  ),
  words as (
    -- `term` for the OR query; `question_term` restricted to the question (weight A).
    select w,
           case when char_length(w) > 5
             then quote_literal(left(w, char_length(w) - 2)) || ':*'
             else quote_literal(w)
           end as term,
           case when char_length(w) > 5
             then quote_literal(left(w, char_length(w) - 2)) || ':*A'
             else quote_literal(w) || ':A'
           end as question_term
      from raw_words
  ),
  text_query as (
    select case
      when count(*) = 0 then null
      else to_tsquery('simple', string_agg(term, ' | '))
    end as q
    from words
  ),
  vector_hits as (
    select f.id,
           f.embedding operator(extensions.<=>) p_query_embedding as distance
      from public.faqs f
     where f.bot_id = p_bot_id
       and (p_language is null or f.language = p_language)
       and f.embedding_status = 'ready'
       and p_query_embedding is not null
     order by f.embedding operator(extensions.<=>) p_query_embedding
     limit (select k * 4 from params)
  ),
  vector_ranked as (
    select vh.id, vh.distance, row_number() over (order by vh.distance)::integer as rnk
      from vector_hits vh
  ),
  text_ranked as (
    select f.id,
           -- Equal text scores are common; break ties by meaning, then id, so results are stable.
           row_number() over (
             order by ts_rank_cd(f.fts, tq.q) desc,
             f.embedding operator(extensions.<=>) p_query_embedding asc nulls last,
             f.id
           )::integer as rnk
      from public.faqs f, text_query tq
     where tq.q is not null
       and f.bot_id = p_bot_id
       and (p_language is null or f.language = p_language)
       and f.fts @@ tq.q
     order by ts_rank_cd(f.fts, tq.q) desc,
              f.embedding operator(extensions.<=>) p_query_embedding asc nulls last,
              f.id
     limit (select k * 4 from params)
  ),
  fused as (
    select coalesce(v.id, t.id) as id,
           v.distance,
           v.rnk as vector_rank,
           t.rnk as text_rank,
           coalesce(1.0 / (60 + v.rnk), 0) + coalesce(1.0 / (60 + t.rnk), 0) as rrf_score
      from vector_ranked v
      full outer join text_ranked t on t.id = v.id
  )
  select f.id,
         f.question,
         f.answer,
         f.language,
         f.featured,
         case when fu.distance is null then null else (1 - fu.distance)::double precision end,
         fu.vector_rank,
         fu.text_rank,
         fu.rrf_score::double precision,
         (select count(*) filter (where f.fts @@ to_tsquery('simple', w.question_term))::double precision
                 / nullif(count(*), 0)
            from words w)
    from fused fu
    join public.faqs f on f.id = fu.id
   order by case
              when p_hybrid or p_query_embedding is null then fu.rrf_score
              else 1 - fu.distance
            end desc nulls last,
            -- Fused ties are common (rank 1 + rank 2 vs rank 2 + rank 1): prefer meaning.
            fu.distance asc nulls last,
            f.id
   limit (select k from params);
$$;

revoke all on function public.match_faqs(uuid, extensions.vector, text, integer, boolean, text)
  from public, anon;
grant execute on function public.match_faqs(uuid, extensions.vector, text, integer, boolean, text)
  to authenticated, service_role;
