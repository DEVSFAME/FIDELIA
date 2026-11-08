/* ============================================================================
   Adhésion — le choix de la caisse, décidé une fois pour toutes

   MESURÉ, deux artefacts (`01_REA_Fidelix/_captures/2026-10-26/raw/`) :

     `pages/p17-join.html`
       <label id="qui-vous-a-servi">Qui vous a servi ?
         <span class="font-medium text-ink/40">(facultatif)</span></label>
       <div role="group" aria-labelledby="qui-vous-a-servi" class="flex flex-wrap gap-2">
         <button type="button" aria-pressed="false" class="min-h-11 rounded-xl border-2
           px-3.5 text-sm font-semibold transition-colors border-ink/10 bg-white text-ink
           hover:border-coral/40">Youssef</button>
         … Salma, Karim, anas, Reda, yassin

     `assets/_next_static_chunks_app_join_%5Bslug%5D_page-5ffb58c0ed9fd59d.js`
       A.length>0 && (… {A.map(e => <button aria-pressed={O===e.id}
         onClick={() => D(O===e.id ? void 0 : e.id)} …)})
       choisi : "border-coral bg-coral text-white"
       libre  : "border-ink/10 bg-white text-ink hover:border-coral/40"

   Trois règles en sortent, et ce module est leur seule copie :

     1. **la sélection est unique et se défait.** Cliquer la caisse déjà choisie
        la retire (`void 0`) : il n'y a pas de puce « Aucun », et il ne doit pas
        y en avoir — le geste de renoncement est le même clic. `basculerCaisse`
        est cette ligne, et rien d'autre ;
     2. **le champ disparaît quand la liste est vide** (`A.length>0 &&`). Cette
        décision n'appartient pas au JSX : `lireCaissesPubliques` rend `[]` pour
        « aucune caisse active » — un fait — et `null` pour une réponse qu'on ne
        comprend pas. Les deux n'affichent rien ici, mais les confondre
        interdirait un jour de dire *pourquoi* il n'y a rien, ce que ce socle
        refuse partout ailleurs (`lesson-learned` §22.3) ;
     3. **une caisse proposée est une caisse acceptée.** L'écran n'envoie jamais
        un identifiant qu'il n'a pas affiché : `caisseChoisie` le cherche dans la
        liste relue au moment du geste. Un formulaire falsifié, ou une caisse
        supprimée entre l'affichage et l'envoi, n'atteint donc pas la fonction.

   ET UNE RÈGLE QUI N'EST PAS DANS LA CAPTURE, MAIS DANS `0007` : la désignation
   est une **préférence**, pas un droit d'accès. Une caisse inconnue fait lever
   `STAFF_NOT_FOUND` — et une inscription perdue pour un prénom serait la faute
   que `0006` a déjà refusé de commettre avec `not null`. `repriseSansCaisse`
   nomme le seul cas où l'on rejoue sans la désignation, `designationPerdue`
   nomme le seul cas où on le dit à l'écran.
   ========================================================================== */

/** Forme d'un identifiant rendu par `staff.id` (uuid, minuscules en base). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i


/**
 * Les caisses proposées, telles que `caisses_publiques()` (`0009`) les rend.
 *
 * `[]` = aucune caisse active — un fait, et l'écran n'affiche rien (mesuré).
 * `null` = réponse d'une autre forme — l'écran n'affiche rien non plus, mais la
 * distinction est conservée : une lecture ratée et une équipe vide n'ont pas le
 * même remède.
 *
 * Une réponse est refusée **en bloc** dès qu'un élément est inutilisable : un
 * bouton sans prénom, ou deux boutons pour la même caisse, serait un défaut
 * d'affichage qu'aucun test ne verrait passer.
 *
 * @param {unknown} donnees
 * @returns {{id: string, prenom: string}[] | null}
 */
export function lireCaissesPubliques(donnees) {
  if (!donnees || typeof donnees !== 'object') return null
  if (!Array.isArray(donnees.caisses)) return null

  const caisses = []
  const vues = new Set()

  for (const brute of donnees.caisses) {
    if (!brute || typeof brute !== 'object') return null
    if (typeof brute.id !== 'string' || !UUID.test(brute.id.trim())) return null
    if (typeof brute.prenom !== 'string' || brute.prenom.trim() === '') return null

    // Deux boutons pour la même caisse : la clé de liste serait dupliquée, et
    // un clic désignerait deux choses à la fois.
    const id = brute.id.trim().toLowerCase()
    if (vues.has(id)) return null
    vues.add(id)

    caisses.push({ id, prenom: brute.prenom.trim() })
  }

  return caisses
}

/**
 * L'identifiant **demandé**, réduit à sa forme — ou `null`.
 *
 * Un champ vide (`''`), absent (`null`) ou altéré ne devient pas un
 * identifiant : la fonction refuserait, et le client perdrait sa carte pour un
 * paramètre d'URL.
 *
 * @param {unknown} valeur
 * @returns {string | null}
 */
export function caisseDemandee(valeur) {
  if (typeof valeur !== 'string') return null
  const propre = valeur.trim()
  return UUID.test(propre) ? propre.toLowerCase() : null
}

/**
 * La caisse **choisie**, c'est-à-dire demandée *et* présente dans la liste
 * affichée. `null` sinon.
 *
 * C'est la règle « une caisse proposée est une caisse acceptée » : la liste est
 * relue au moment du geste, et un identifiant qui n'y est plus (caisse
 * supprimée, formulaire falsifié) n'est pas transmis.
 *
 * @param {{id: string}[] | null} caisses
 * @param {unknown} valeur
 * @returns {string | null}
 */
export function caisseChoisie(caisses, valeur) {
  const demandee = caisseDemandee(valeur)
  if (demandee === null || !Array.isArray(caisses)) return null
  const trouvee = caisses.find(
    (c) => c && typeof c.id === 'string' && c.id.toLowerCase() === demandee
  )
  return trouvee ? trouvee.id : null
}

/**
 * La bascule d'un clic sur une puce — **unique et réversible** (mesuré).
 *
 * @param {string | null} courante
 * @param {string | null | undefined} id
 * @returns {string | null}
 */
export function basculerCaisse(courante, id) {
  return courante === id ? null : (id ?? null)
}

/**
 * Vrai quand une caisse a été demandée et n'a pas été retenue : la carte se
 * fait, la désignation se perd — et cela se dit (l'écran le rend).
 *
 * @param {string | null} demandee
 * @param {string | null} choisie
 * @returns {boolean}
 */
export function designationPerdue(demandee, choisie) {
  return demandee !== null && choisie === null
}

/**
 * Vrai quand l'inscription doit être rejouée **sans** la caisse.
 *
 * Un seul cas, et il est nommé : `STAFF_NOT_FOUND`. La fonction (`0007`) refuse
 * alors avant d'écrire quoi que ce soit, donc aucune carte n'existe encore. Un
 * autre refus (`PROGRAM_NOT_FOUND`) ne se rejoue pas : la seconde tentative
 * échouerait de la même façon, et l'écran afficherait une panne après un succès
 * silencieux.
 *
 * @param {{etat?: string, code?: string | null} | null | undefined} resultat
 * @returns {boolean}
 */
export function repriseSansCaisse(resultat) {
  return resultat?.etat === 'refuse' && resultat?.code === 'STAFF_NOT_FOUND'
}
