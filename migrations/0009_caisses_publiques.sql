-- ============================================================================
--  0009 — LE CHOIX DE LA CAISSE SUR LA PAGE PUBLIQUE D'ADHÉSION
--
--  POURQUOI CETTE MIGRATION EXISTE, ET POURQUOI ELLE EST PUBLIQUE
--  --------------------------------------------------------------
--  `0007` a livré le chemin d'écriture : `join_loyalty_program(p_slug,
--  p_staff_id)` écrit `clients.designated_staff_id`. Aucune page ne l'envoyait
--  (`donnees.mjs` appelait `{ p_slug }`), donc « Cartes » valait **0, exactement
--  et inutilement**, sur chaque écran Équipe.
--
--  La question posée avant d'écrire était : *la cible propose-t-elle ce choix sur
--  sa page publique, ou l'inventerait-on ?* Elle le propose. Mesuré, deux
--  artefacts, tous deux dans `01_REA_Fidelix/_captures/2026-10-26/raw/` :
--
--    `pages/p17-join.html`  (offset ≈ 21 050)
--        <label id="qui-vous-a-servi">Qui vous a servi ?
--          <span class="font-medium text-ink/40">(facultatif)</span></label>
--        <div role="group" aria-labelledby="qui-vous-a-servi" class="flex flex-wrap gap-2">
--          <button type="button" aria-pressed="false" class="min-h-11 rounded-xl border-2
--            px-3.5 text-sm font-semibold … border-ink/10 bg-white text-ink
--            hover:border-coral/40">Youssef</button>   … six prénoms
--
--    `assets/_next_static_chunks_app_join_%5Bslug%5D_page-5ffb58c0ed9fd59d.js`
--        A.length>0 && (<div …><Label id="qui-vous-a-servi">…</Label>
--          <div role="group" aria-labelledby="qui-vous-a-servi">
--            {A.map(e => <button aria-pressed={O===e.id}
--              onClick={() => D(O===e.id ? void 0 : e.id)}
--              className={… O===e.id ? "border-coral bg-coral text-white"
--                                     : "border-ink/10 bg-white text-ink hover:border-coral/40"}
--            >{e.label}</button>)}</div></div>)
--
--  Trois faits en sortent, et chacun est une ligne de ce fichier :
--
--    * **le choix est rendu par une page sans session.** Les six prénoms de
--      l'équipe sont donc une lecture publique sur la cible. Ce n'est pas une
--      ouverture qu'on s'accorde : c'est celle qu'on reproduit ;
--    * **il est facultatif et désélectionnable** (`void 0`) : la désignation
--      n'est jamais une condition d'obtention de la carte ;
--    * **il disparaît quand la liste est vide** (`A.length>0 &&`). Un groupe
--      vide, ou une phrase d'excuse, serait un état que la cible n'a pas.
-- ============================================================================

begin;

--  CE QUE LA FONCTION REND — ET CE QU'ELLE NE REND PAS
--  ---------------------------------------------------
--  `id` et `prenom`, pour les caisses **actives**, et rien d'autre.
--
--    * `role`, `actif`, `cartes`, `scans`, `points`, `ca` restent dehors :
--      `equipe_du_commerce()` les porte déjà, et elle n'est **pas** accordée à
--      `anon` — elle donne le prénom *avec* le chiffre d'affaires. Une page
--      publique n'a besoin que du prénom : ouvrir le classement pour dessiner
--      six boutons serait une fuite gratuite, et l'écart entre les deux
--      fonctions est exactement la ligne de partage à tenir ;
--    * **les caisses désactivées ne sont pas proposées.** Décision, pas mesure :
--      la capture montre l'équipe du jour. Proposer une caisse partie ferait
--      désigner quelqu'un qui ne sert plus, pour un chiffre qui ne remonterait
--      jamais. L'**écriture**, elle, continue d'accepter une caisse inactive
--      (`0007`) — un onglet resté ouvert deux heures ne doit pas coûter sa
--      carte au client. Montré ⊆ accepté, et c'est le bon sens ;
--    * **l'ordre n'est pas mesuré.** La capture rend six prénoms dans un ordre
--      d'insertion qu'aucune donnée ne reproduit ici. On impose donc un ordre
--      **total** (prénom, puis id) pour qu'une liste ne bouge pas d'un appel à
--      l'autre (`lesson-learned` §31.5) ;
--    * **aucun libellé.** Ni « Qui vous a servi ? », ni « (facultatif) » : le
--      dictionnaire les porte, et une chaîne d'affichage dans le SQL échapperait
--      au test de copie mesurée (§31.6).
--
--  CE QUE CETTE MIGRATION NE FAIT PAS — dettes nommées
--  ---------------------------------------------------
--    * **aucune portée par programme** : `staff` n'a pas de `program_id`
--      (même limite que `0004`, `0005`, `0007`). Le slug sert donc à *valider*
--      qu'un programme existe et à refuser `PROGRAM_NOT_FOUND`, pas à filtrer ;
--    * **aucun chemin d'écriture de l'équipe** (créer / désactiver une caisse) :
--      la dette « Nouvelle caisse » reste ouverte, avec son écran ;
--    * **aucune table n'est rouverte** : `staff` reste sous RLS sans politique,
--      `anon` n'obtient toujours aucun privilège de table — seulement
--      `EXECUTE` sur cette fonction `SECURITY DEFINER`.
--
--  IDEMPOTENCE
--  -----------
--  `create or replace`, `revoke`/`grant` rejouables : rejouer le fichier ne
--  lève rien et ne retire rien.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. La lecture publique : qui peut-on désigner ?
-- ---------------------------------------------------------------------------

create or replace function public.caisses_publiques(p_slug varchar default null)
returns json
language plpgsql
security definer
set search_path = public
as $fonction$
declare
  v_programme uuid;
  v_caisses   json;
begin
  -- Le même départage que `join_loyalty_program` (`0007`) et `programme_public`
  -- (`0003`) : deux programmes actifs ne doivent pas rendre un slug différent
  -- d'un appel à l'autre. `p_slug` nul reste accepté, comme à l'inscription.
  select p.id into v_programme
    from public.loyalty_programs p
   where p.active
     and (p_slug is null or p.slug = lower(trim(p_slug)))
   order by p.created_at, p.id
   limit 1;

  if v_programme is null then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(json_agg(json_build_object(
           'id',     s.id,
           'prenom', s.first_name
         ) order by s.first_name asc, s.id asc), '[]'::json)
    into v_caisses
    from public.staff s
   where s.active;

  return json_build_object('caisses', v_caisses);
end;
$fonction$;

-- ---------------------------------------------------------------------------
--  2. Les droits — `anon` lit des prénoms, pas un classement
--
--  Même piège que `0004`/`0005`/`0007` : un `REVOKE … FROM PUBLIC` seul ne
--  révoque rien, parce que `create function` hérite des privilèges par défaut du
--  schéma. Le `REVOKE` nomme donc les trois rôles, puis le `GRANT` rend
--  exactement ce qui est nécessaire.
--
--  `anon` est **accordé** ici, et c'est le seul écart avec `0007` : la page
--  d'adhésion n'a pas de session (mesuré). La fonction ne rend ni rôle, ni
--  chiffre, ni identifiant de programme — seulement de quoi dessiner six
--  boutons.
-- ---------------------------------------------------------------------------

revoke execute on function public.caisses_publiques(varchar) from public, anon, authenticated;
grant  execute on function public.caisses_publiques(varchar) to anon, authenticated, service_role;


commit;

