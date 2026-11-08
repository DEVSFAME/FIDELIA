/* ============================================================================
   Dictionnaire FR — **une seule langue servie**.

   La cible sert trois locales (`/`, `/en`, `/ar`, mesuré sur `sitemap.xml` et
   les captures `p02-home-en.html`, `p03-home-ar.html`). Nous n'en servons
   qu'une : décision humaine du 2026-10-31, « pas de version EN, que du FR ».

   Pourquoi supprimer les dictionnaires au lieu de les laisser en place : un
   dictionnaire `en` à moitié traduit ne se voit pas. `traduire()` lève sur une
   clé absente, donc un écran anglais incomplet casse au premier rendu — mais
   seulement si quelqu'un ouvre `/en`. Un `en` figé au niveau de R1, pendant que
   R2 et R3 ajoutent des écrans, n'aurait produit que des pages mortes que
   personne ne regarde. On préfère une langue juste à trois dont deux fantômes.

   Clés **plates** (`domaine.cle`) : elles se comparent d'un coup d'œil et se
   balaient sans parcourir un arbre. `tools/rea/tests/i18n-ui.test.mjs` vérifie
   que toute clé affichée existe réellement ici.

   Ce que ces textes ne sont pas : une traduction de la cible. La cible n'a pas
   de dictionnaire lisible (son i18n vit dans les bundles, cf. `contrats.json`
   §locales : `balises: [["fr", 17]]`, aucun dictionnaire extrait). Ces libellés
   décrivent **notre** socle.

   **Marque — arbitrage rendu le 2026-10-30 : `Fidelia`.**
   Le scrape public écrit « Fidelix » partout (`fidelix.ma`, titres, JSON-LD,
   texte CNDP du bundle d'inscription, `contact@fidelix.ma`) — c'est normal :
   il a mesuré **la cible**, pas le clone. La décision D-1 = A (2026-10-28,
   03:10) et `basal-knowledge.md` §14 « Note de nommage » tranchent l'inverse :
   « Le nom “Fidelix” et ses marques ne doivent pas être réutilisés dans le
   clone (interface, métadonnées, `organizationName` du pass, PWA). »
   Le nom a donc **une seule source** — `marque.nom` — et plus aucune autre clé
   ne l'écrit en dur (`meta.titre` l'interpole, cf. test `i18n-ui`).

   Les textes d'interface des écrans d'authentification **sont** mesurés
   (`_captures/2026-10-26/raw/assets/_next_static_chunks_app__auth__*`) : la
   version française reprend la chaîne exacte du bundle.
   ========================================================================== */


export const fr = {
  'meta.titre': '{marque} — la fidélité de vos clients, sans tableur',
  'meta.description':
    "Carte de fidélité par QR code, caisse qui fonctionne hors ligne, récompenses et pass Apple/Google. Pour les commerçants marocains.",
  'marque.nom': 'Fidelia',
  /* Le lien d'évitement est invisible tant qu'il n'a pas le focus : c'est la
     seule chaîne du produit qui ne s'adresse qu'aux lecteurs d'écran et au
     clavier, et elle doit donc dire exactement ce qu'elle fait. */
  'a11y.allerAuContenu': 'Aller au contenu',
  /* Domaine de contact affiché dans le texte CNDP. `contact@fidelix.ma` est ce
     qu'écrit la cible ; on ne peut pas le reprendre (§14), donc c'est le
     domaine **réellement détenu** qui s'affiche depuis le 2026-11-08.
     `REFERENCE_CNDP` reste, lui, provisoire (déclaration non déposée). */
  'marque.domaine': 'fideliatest.site',
  'accueil.surtitre': 'Programme de fidélité',
  'accueil.titre': 'Vos clients reviennent. Vous le voyez.',
  'accueil.sousTitre':
    "Une carte digitale scannée en caisse, des points qui se cumulent tout seuls, et des récompenses qui se déclenchent sans que personne n'ait à compter.",
  'accueil.ctaPrimaire': 'Démarrer',
  'accueil.ctaSecondaire': 'Voir les récompenses',
  'verre.titre': 'Le design system est mesuré, pas choisi',
  'verre.texte':
    "Chaque token de cette page vient du CSS de la cible : la valeur est vérifiée contre l'empreinte de la capture, pas recopiée à l'œil.",
  'verre.legende': 'Trois axes — teinte, densité, diffusion — et deux arêtes opposées.',
  'navigation.connexion': 'Se connecter',
  'navigation.creerCompte': 'Créer un compte',
  'pied.droits': 'Tous droits réservés.',
  'langue.libelle': 'Français',

  /* --- Champs de formulaire (libellés et exemples mesurés) ---------------- */
  'champ.email': 'Email',
  'champ.emailProfessionnel': 'Email professionnel',
  'champ.motDePasse': 'Mot de passe',
  'champ.motDePasseOublie': 'Mot de passe oublié ?',
  'champ.confirmerMotDePasse': 'Confirmer le mot de passe',
  'champ.nomComplet': 'Nom complet',
  'champ.telephone': 'Numéro de téléphone',
  'champ.exempleEmail': 'vous@moncommerce.ma',
  'champ.exempleNom': 'Karim Benjelloun',
  'champ.exempleTelephone': '06 12 34 56 78',
  'champ.motDePasseMasque': '••••••••',
  'champ.afficherMotDePasse': 'Afficher le mot de passe',
  'champ.masquerMotDePasse': 'Masquer le mot de passe',

  /* --- Messages de validation (mesurés, schéma Zod du bundle) ------------- */
  'auth.email.invalide': 'Email invalide',
  'auth.motDePasse.minimum': '8 caractères minimum',
  'auth.motDePasse.majuscule': 'Une majuscule',
  'auth.motDePasse.chiffre': 'Un chiffre',
  'auth.motDePasse.majusculeRequise': 'Une majuscule requise',
  'auth.motDePasse.chiffreRequis': 'Un chiffre requis',
  'auth.motDePasse.tropCourt': 'Mot de passe trop court',
  'auth.nom.requis': 'Nom complet requis',
  'auth.telephone.incomplet': 'Écrivez votre numéro en entier. Exemple : 06 12 34 56 78.',
  'auth.confirmation.differente': 'Les mots de passe ne correspondent pas',
  'auth.consentement.requis': 'Vous devez accepter pour créer un compte',
  'auth.erreurConfiguration':
    "Supabase n'est pas configuré (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",

  /* --- Connexion ---------------------------------------------------------- */
  'auth.connexion.metaTitre': 'Connexion',
  'auth.connexion.titreLigne1': 'BON',
  'auth.connexion.titreLigne2': 'RETOUR',
  'auth.connexion.sousTitre': 'Connectez-vous à votre espace commerçant',
  'auth.connexion.action': 'Se connecter',
  'auth.connexion.actionEnCours': 'Connexion…',
  'auth.connexion.pied': 'Pas encore de compte ?',
  /* Écart assumé : la cible énumère les motifs (compte non confirmé, adresse
     déjà prise…). Un message unique ferme l'oracle d'énumération de comptes. */
  'auth.connexion.champsVides': 'Renseignez votre email et votre mot de passe.',
  'auth.connexion.refuses': 'Identifiants refusés.',
  /* `?etat=configuration` — produit par la garde du tableau de bord quand le
     client Supabase ne peut pas être construit. Décision de copie : cet écran
     est lu par un commerçant, donc **aucun nom de variable** ici (contrairement
     à `auth.erreurConfiguration`, qui s'adresse à qui installe le projet), et
     aucune promesse de réessai — une configuration absente ne se répare pas en
     rechargeant la page. */
  'auth.connexion.etatConfiguration':
    "La connexion n'est pas disponible : ce service n'est pas configuré. Contactez l'administrateur du site.",

  /* --- Inscription -------------------------------------------------------- */
  'auth.inscription.metaTitre': 'Créer un compte',
  'auth.inscription.titreLigne1': 'CRÉEZ',
  'auth.inscription.titreLigne2': 'VOTRE ESPACE',
  'auth.inscription.sousTitre': 'Programme de fidélité en 2 minutes',
  'auth.inscription.action': 'Créer mon compte gratuitement',
  'auth.inscription.actionEnCours': 'Création du compte…',
  'auth.inscription.pied': 'Déjà un compte ?',
  'auth.inscription.succesTitre': 'Vérifiez votre email',
  'auth.inscription.succesTexte':
    'Un lien de confirmation a été envoyé à {email}. Cliquez dessus pour activer votre compte.',
  /* Message **unique** pour tout échec de `signUp` : c'est celui de la cible,
     et il évite de transformer le formulaire en oracle (« adresse déjà
     utilisée »). */
  'auth.inscription.erreurGenerique':
    'Impossible de créer le compte avec ces informations. Si vous avez déjà un compte, connectez-vous ou réinitialisez votre mot de passe.',
  'auth.inscription.consentement':
    "J'accepte les conditions d'utilisation et la politique de confidentialité.",
  'auth.inscription.cndp':
    "Par le biais de ce formulaire, {marque} collecte vos données personnelles en vue de la création et la gestion de votre compte commerçant, de la facturation de votre abonnement et du fonctionnement de votre programme de fidélité. Ce traitement a fait l'objet d'une déclaration auprès de la CNDP. Les données personnelles collectées peuvent être transmises à ses prestataires d'hébergement, d'envoi de courriels, de cartes de fidélité numériques et de notifications, situés à l'étranger, conformément à la demande de transfert déposée auprès de la CNDP. Vous pouvez vous adresser à contact@{domaine} pour exercer vos droits d'accès, de rectification et d'opposition conformément aux dispositions de la loi 09-08.",

  'auth.inscription.cndpResume': 'Données personnelles (CNDP)',

  /* --- Mot de passe oublié ------------------------------------------------ */
  'auth.oubli.metaTitre': 'Mot de passe oublié',
  'auth.oubli.titreLigne1': 'MOT DE PASSE',
  'auth.oubli.titreLigne2': 'OUBLIÉ ?',
  'auth.oubli.sousTitre': 'Entrez votre email, on vous envoie un lien de réinitialisation',
  'auth.oubli.action': 'Envoyer le lien',
  'auth.oubli.actionEnCours': 'Envoi…',
  'auth.oubli.lienRetour': 'Retour à la connexion',
  'auth.oubli.succesTitre': 'Email envoyé',
  /* Réponse neutre : elle ne dit pas si le compte existe. */
  'auth.oubli.succesTexte':
    'Si un compte existe avec cet email, vous recevrez un lien pour réinitialiser votre mot de passe.',
  'auth.oubli.tropDeDemandes':
    'Trop de demandes en peu de temps. Patientez une minute et réessayez.',
  'auth.oubli.echecExpire':
    'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau, il arrive tout de suite.',
  'auth.oubli.echecAppareil':
    "Ce lien avait été émis pour un autre appareil. Demandez-en un nouveau : les liens actuels s'ouvrent où vous voulez.",
  'auth.oubli.echecInvalide': "Ce lien n'est pas valide. Demandez-en un nouveau ci-dessous.",

  /* --- Nouveau mot de passe (retour de lien `type=recovery`) --------------
     Copie **non mesurée** : la cible n'a jamais été capturée sur cet écran (le
     socle refusait `type=recovery`, voir `docs/design-system.md` §3). Les trois
     libellés de champ, eux, sont ceux du schéma mesuré — ils sont réutilisés,
     pas réécrits. Écart déclaré : à rejouer sur une capture le jour où elle
     existe. */
  'auth.nouveau.metaTitre': 'Nouveau mot de passe',
  'auth.nouveau.titreLigne1': 'NOUVEAU',
  'auth.nouveau.titreLigne2': 'MOT DE PASSE',
  'auth.nouveau.sousTitre': 'Choisissez votre nouveau mot de passe',
  /* Ces deux libellés sont **mesurés**, et ils diffèrent de ceux de
     l'inscription : le formulaire de mot de passe de la cible
     (`_next_static_chunks_app__dashboard__settings_page-….js`) porte
     « Nouveau mot de passe » et « Confirmer le nouveau mot de passe », là où
     `/register` dit « Mot de passe ». Les réutiliser tels quels depuis
     `champ.*` aurait affiché « Mot de passe » sur un écran où le champ n'est
     pas le mot de passe actuel — deux situations, deux libellés.
     `copie-mesuree.test.mjs` confronte les deux valeurs au chunk capturé. */
  'auth.nouveau.champMotDePasse': 'Nouveau mot de passe',
  'auth.nouveau.champConfirmation': 'Confirmer le nouveau mot de passe',
  'auth.nouveau.action': 'Enregistrer le mot de passe',
  'auth.nouveau.actionEnCours': 'Enregistrement…',
  /* `?etat=session` — produit par l'action quand `updateUser` échoue : la
     session ouverte par le lien n'existe plus (ou n'a jamais existé, si l'URL a
     été ouverte à la main). Le message dit l'issue (rien n'a été enregistré) et
     la seule action possible (un nouveau lien) — pas « réessayez », qui
     échouerait à l'identique. */
  'auth.nouveau.etatSession':
    "Votre lien n'est plus actif : le mot de passe n'a pas été enregistré. Demandez un nouveau lien, il arrive tout de suite.",
  'auth.nouveau.nouveauLien': 'Demander un nouveau lien',

  /* --- Tableau de bord ---------------------------------------------------- */
  'tableau.nav.titre': 'Tableau de bord',
  'tableau.nav.caisse': 'Caisse',
  'tableau.nav.deconnexion': 'Déconnexion',
  'tableau.nav.ariaLabel': 'Navigation du tableau de bord',
  'tableau.nav.ariaLabelMobile': 'Navigation du tableau de bord (barre basse)',
  'tableau.nav.plus': 'Plus',
  'tableau.apercu.email': 'aperçu local',
  'tableau.surtitre': 'Votre commerce, en un regard.',
  'tableau.titre': 'Tableau de bord',
  'tableau.nonBranche': 'Données non branchées — R2',
  'tableau.indicateurs.ariaLabel': 'Indicateurs',
  /* --- Écran d'accueil alimenté (0005) ------------------------------------
     Les quatre libellés et leurs sous-titres sont **mesurés** sur la capture
     authentifiée `_captures/2026-10-27-auth-s3/raw/pages/a01-dashboard.html` :
     « Clients | +1 ce mois », « Visites | 30 derniers jours »,
     « Reviennent | au moins 2 visites », « CA (€) | 30 j · total 40 »,
     puis « Transactions au total », « Récompenses distribuées »,
     « Transactions récentes » et les colonnes « Client », « Type »,
     « Pts / Tampons », « Montant », « Date ».

     Une seule valeur n'est **pas** recopiée : l'unité du chiffre d'affaires.
     La cible écrit « CA (€) » parce que son programme est en euros ; ici la
     devise est une donnée (`loyalty_programs.devise`, `MAD` par défaut), donc
     le gabarit porte `{devise}`. Écart déclaré dans `docs/design-system.md` §3,
     et `tableau-lecture.test.mjs` interdit d'y réintroduire « € ». */
  'tableau.indicateur.clients': 'Clients',
  'tableau.indicateur.visites': 'Visites',
  'tableau.indicateur.reviennent': 'Reviennent',
  'tableau.indicateur.ca': 'CA ({devise})',
  'tableau.indicateur.caSansDevise': 'CA',
  'tableau.sous.ceMois': '+{n} ce mois',
  'tableau.sous.trenteJours': '30 derniers jours',
  'tableau.sous.deuxVisites': 'au moins 2 visites',
  'tableau.sous.caTrenteJours': '30 j · total {total}',
  'tableau.total.titre': 'Totaux',
  'tableau.total.transactions': 'Transactions au total',
  'tableau.total.recompenses': 'Récompenses distribuées',
  'tableau.recentes.titre': 'Transactions récentes',
  'tableau.recentes.colonneClient': 'Client',
  'tableau.recentes.colonneType': 'Type',
  'tableau.recentes.colonnePoints': 'Pts / Tampons',
  'tableau.recentes.colonneMontant': 'Montant',
  'tableau.recentes.colonneDate': 'Date',
  /* Mesuré : c'est le **seul** libellé de type que la cible écrit. Une
     récompense remise n'a pas de libellé générique mesuré — on affiche donc le
     sien (`reward_label`), pas un « Récompense remise » inventé. */
  'tableau.recentes.typePoints': 'Points gagnés',
  /* Ces deux phrases sont **écrites**, pas relevées : la cible avait une
     opération, donc ni son état vide de transactions ni sa réponse illisible
     n'ont été capturés. Même statut que les états vides de `/customers`. */
  'tableau.recentes.vide': 'Aucune opération pour l’instant.',
  'tableau.illisibleTitre': 'Réponse inattendue',
  'tableau.illisible':
    'La base a répondu, mais pas dans la forme attendue : aucun indicateur n’a pu être lu. Ce n’est pas un commerce sans activité.',
  'tableau.aucuneDonnee': 'Aucune donnée',
  'tableau.garanties.titre': 'Ce que ce socle garantit déjà',
  'tableau.garanties.garde':
    'Accès refusé sans session : la garde est côté serveur, pas côté écran.',
  'tableau.garanties.mesure': 'Surfaces et polices transcrites de la cible, pas imitées.',
  'tableau.garanties.nuit':
    'Peau claire « Unicity » : jetons recopiés à l’octet, aucune couleur en dur.',
  'tableau.nav.scanner': 'Scanner un client',
  'tableau.nav.clients': 'Clients',
  'tableau.nav.programme': 'Programme',
  'tableau.nav.messages': 'Messages',
  'tableau.nav.avis': 'Avis Google',
  'tableau.nav.equipe': 'Équipe',
  'tableau.nav.qrcode': 'QR Code',
  'tableau.nav.apparence': 'Apparence',
  /* Mesuré : le rail de la cible porte « Mon compte » → `/settings`. Il ne
     pouvait entrer ici tant que la route n'existait pas (`navigation.test`). */
  'tableau.nav.compte': 'Mon compte',
  /* --- Section « Programme » : ses deux onglets ---------------------------
     Mesuré sur les deux pages de la section (`a02-program.html` et
     `a03-rewards.html`) : la barre porte « Récompenses » → `/rewards` et
     « Règles » → `/program`, cette dernière en `aria-current="page"` quand on
     est sur `/program`. Le rail, lui, continue de dire « Programme » :
     `tableau.nav.programme` reste le libellé de la destination, ces deux clés
     ne sont que les onglets. */
  'tableau.programme.ongletsAria': 'Sections du programme',
  'tableau.programme.ongletRecompenses': 'Récompenses',
  'tableau.programme.ongletRegles': 'Règles',
  'tableau.page.source': 'Source mesurée : {source}',
  'tableau.page.sourceAria': 'Source des données',
  'tableau.rpc.carteInconnue':
    'Cette carte n’existe pas. Vérifiez le jeton, ou inscrivez le client d’abord.',
  'tableau.rpc.coutInvalide': 'Coût refusé par la base : il doit être strictement positif.',
  'tableau.rpc.configuration':
    'Supabase n’est pas configuré sur ce serveur : l’appel ne peut pas aboutir.',
  'tableau.rpc.indisponible': 'La base n’a pas répondu. Réessayez quand la connexion revient.',
  'tableau.rpc.inconnu': 'La base a refusé l’opération avec un motif non reconnu.',

  /* --- Pages du tableau de bord (R2) -------------------------------------- */
  /* Clients — libellés **mesurés** sur la capture authentifiée
     `_captures/2026-10-27-auth-s3/raw/pages/a17-customers.html` : le `<h1>`
     rendu est « Clients » (« Mes clients » est l'onglet voisin, pas le titre),
     la section « Liste des membres », les colonnes « Code client »,
     « Points / Tampons », « Récompenses », « Inscrit le », et le compteur
     « 1 client inscrit ».
     `clients-lecture.test.mjs` confronte ces valeurs à la capture — pas à une
     constante partagée. */
  'page.clients.surtitre': 'Fidélité',
  'page.clients.titre': 'Clients',
  'page.clients.liste': 'Liste des membres',
  'page.clients.colonneCode': 'Code client',
  'page.clients.colonnePoints': 'Points / Tampons',
  'page.clients.colonneRecompenses': 'Récompenses',
  'page.clients.colonneInscription': 'Inscrit le',
  'page.clients.compteUn': '{n} client inscrit',
  'page.clients.comptePlusieurs': '{n} clients inscrits',
  'page.clients.tronquee':
    'Seules les {limite} cartes les plus récentes sont affichées.',
  /* Les trois phrases ci-dessous sont **écrites**, pas relevées : la cible
     avait un client, donc ni son état vide ni sa réponse illisible n'ont été
     capturés. Déclaré dans `docs/design-system.md` §3. */
  'page.clients.videTitre': 'Aucune carte pour l’instant',
  'page.clients.vide':
    'Les cartes apparaissent ici dès qu’un client s’inscrit avec le QR code du commerce.',
  'page.clients.illisibleTitre': 'Réponse inattendue',
  'page.clients.illisible':
    'La base a répondu, mais pas dans la forme attendue : aucune liste n’a pu être lue. Ce n’est pas un commerce sans client.',

  'page.programme.surtitre': 'Réglages',
  'page.programme.titre': 'Programme',
  'page.programme.resume':
    'Le type de programme, le seuil de récompense et les paliers. La cible les lit dans `loyalty_programs` et `reward_tiers`.',
  'page.programme.vide':
    'Aucun programme : ces deux tables existent sur la cible, pas encore dans ce socle.',

  'page.messages.surtitre': 'Relation client',
  'page.messages.titre': 'Messages',
  /* P0-4 — l'écran « Messages », onglet Notifications. Les bornes (3–50, 10–150)
     et le quota (3) sont **mesurés** ; les phrases reprennent celles de la cible
     quand elles existent, et disent la file quand elle ne la connaît pas. */
  'page.messages.nouvelle': 'Nouvelle notification',
  'page.messages.ariaQuota': 'Messages du jour sur le quota',
  'page.messages.compteur': '{aujourdhui} / {limite} aujourd’hui',
  'page.messages.aide':
    'Jusqu’à {limite} messages par jour. Au-delà, les clients se lassent et suppriment leur carte.',
  'page.messages.aideAtteint': 'Vous avez atteint la limite de {limite} messages par jour.',
  'page.messages.prochaineDemain': 'Prochain message demain.',
  'page.messages.champTitre': 'Titre',
  'page.messages.borneTitre': '{min} à {max} caractères.',
  'page.messages.champMessage': 'Message',
  'page.messages.borneMessage': '{min} à {max} caractères.',
  'page.messages.champLien': 'Lien (optionnel)',
  'page.messages.placeholderTitre': 'Ex : Offre spéciale ce weekend !',
  'page.messages.placeholderMessage':
    'Profitez de -20 % sur votre prochaine visite. Valable jusqu’au 30 juin.',
  'page.messages.placeholderLien': 'https://votre-site.ma/offre',
  'page.messages.lienAide':
    'Le lien devient un bouton dans le message. Il doit commencer par https://',
  'page.messages.action': 'Mettre le message en file',
  'page.messages.enfile': 'Message mis en file.',
  'page.messages.fileAide':
    'Aucun canal d’envoi n’est configuré dans ce socle : les messages restent en file d’attente et ne partent pas encore.',
  'page.messages.joignables': '{joignables} clients ont une adresse email.',
  'page.messages.joignablesUn': '1 client a une adresse email.',
  'page.messages.historique': 'Historique des notifications',
  'page.messages.historiqueVide': 'Aucun message dans la file.',
  'page.messages.statutEnAttente': 'En attente',
  'page.messages.statutEnvoye': 'Envoyé',
  'page.messages.erreur.titre': 'Le titre doit faire au moins 3 caractères.',
  'page.messages.erreur.titreLong': 'Le titre doit faire au plus 50 caractères.',
  'page.messages.erreur.corps': 'Le message doit faire au moins 10 caractères.',
  'page.messages.erreur.corpsLong': 'Le message doit faire au plus 150 caractères.',
  'page.messages.erreur.lien': 'Le lien doit être une adresse commençant par https://',
  'page.messages.erreur.quota': 'La limite de messages du jour est déjà atteinte.',
  'page.messages.erreur.refus': 'Le message n’a pas été enregistré. Réessayez.',

  'page.avis.surtitre': 'Réputation',
  'page.avis.titre': 'Avis Google',
  'page.avis.resume':
    'Le bonus accordé quand un client laisse un avis, validé au comptoir. La cible l’expose en `POST /api/caisse/reviews`.',
  'page.avis.vide':
    'Aucun avis enregistré : cette route est en écriture seule et n’a jamais été appelée ici.',

  'page.equipe.surtitre': 'Point de vente',
  'page.equipe.titre': 'Équipe',
  /* Ci-dessous : les libellés de `a09-caisses.html`, **mesurés** et repris tels
     quels (portées, périodes, sept `th`, « Titulaire », « Vous », les deux
     paragraphes de définition, « Caisses actives » et son état vide).
     Les phrases marquées « écrite » n'ont pas de capture : la cible n'avait
     aucune caisse, donc ni son état filtré ni ses états d'échec n'ont d'image.
     Déclarées dans `docs/design-system.md` §3. */
  'page.equipe.portees': 'Portée des caisses',
  'page.equipe.porteeCaisse': 'Caisses employé',
  'page.equipe.porteeResponsable': 'Responsables',
  'page.equipe.porteeCaisseDesc':
    'Un accès limité au scan pour chaque employé — sans vos chiffres ni vos réglages.',
  'page.equipe.periodes': 'Période du classement',
  'page.equipe.periode7j': '7 jours',
  'page.equipe.periode30j': '30 jours',
  'page.equipe.periodeDepuis': 'Depuis le début',
  'page.equipe.periodeJour': 'Un jour précis',
  'page.equipe.champJour': 'Jour',
  'page.equipe.voirJour': 'Voir ce jour',
  'page.equipe.classement': "Classement de l'équipe",
  'page.equipe.colonneRang': '#',
  'page.equipe.colonneCaissier': 'Caissier',
  'page.equipe.colonneCartes': 'Cartes',
  'page.equipe.colonneScans': 'Scans',
  'page.equipe.colonnePoints': 'points',
  'page.equipe.colonneCa': 'CA',
  'page.equipe.colonneAvis': 'Avis',
  'page.equipe.titulaire': 'Titulaire',
  'page.equipe.vous': 'Vous',
  'page.equipe.desactivee': 'Désactivée',
  'page.equipe.rang': 'Rang {rang}',
  /* Le paragraphe est mesuré mot pour mot, sauf le nom de la marque : la cible
     écrit le sien, et la décision de nommage (`basal-knowledge.md` §14) interdit
     de le réutiliser. D'où `{marque}`, comme `meta.titre`. */
  'page.equipe.cartesDefinition':
    "Les cartes comptent les clients qui ont désigné ce caissier sur la page d'inscription. C'est le geste qui installe {marque} dans votre commerce — et celui qui mérite d'être récompensé.",
  'page.equipe.tableauDefinition':
    'Ce tableau compte toutes les opérations du point de vente : les caisses employé, et ce que vous ou vos responsables encaissez depuis le tableau de bord.',
  'page.equipe.actives': 'Caisses actives',
  'page.equipe.aucuneCaisse':
    "Aucune caisse pour l'instant. Vous continuez à encaisser normalement depuis votre propre compte.",
  /* Écrite : la cible avait zéro caisse, donc son état vide **filtré** par une
     portée n'a jamais été rendu. Ce n'est pas la même phrase que ci-dessus —
     celle-là parle du commerce entier, celle-ci d'une portée. */
  'page.equipe.aucunePortee': 'Aucune caisse dans cette portée pour l’instant.',
  /* Écrite : aucune table d'avis n'existe dans ce socle (`0007`), donc « Avis »
     est une absence **déclarée**, jamais un zéro. La phrase dit pourquoi. */
  'page.equipe.avisAbsent':
    'Les avis ne sont pas comptés : aucune source d’avis n’est branchée dans ce socle.',
  /* Écrite : la création d'une caisse n'a aucune fonction d'écriture (`staff`
     n'est ouverte qu'à `service_role`). Afficher un formulaire mort serait pire
     que de dire qu'il n'existe pas. */
  'page.equipe.formulaireAbsent':
    'La création d’une caisse n’est pas encore branchée : aucune fonction d’écriture n’existe dans ce socle.',
  /* Écrite : la fenêtre **appliquée** par la fonction, affichée pour que l'écran
     ne redéfinisse rien — c'est la migration qui tranche, l'écran qui répète. */
  'page.equipe.fenetre': 'Fenêtre appliquée : du {debut} au {fin} ({fuseau}).',
  /* Écrite : `depuis_le_debut` n'a pas de borne basse — la fonction rend
     `debut: null`, et « du — au … » serait un tiret de plus, pas une mesure. */
  'page.equipe.fenetreOuverte':
    'Fenêtre appliquée : tout l’historique jusqu’au {fin} ({fuseau}).',
  /* Écrites : la lecture du classement n'a pas d'image d'échec. On n'emprunte
     pas `tableau.etat.refus`, qui parle d'un solde inchangé — donc d'une
     écriture — ni `tableau.etat.migrationTexte`, qui accuserait la migration
     alors que la base a répondu. */
  'page.equipe.refusTitre': 'Lecture refusée',
  'page.equipe.refus':
    'La base a refusé la lecture du classement. Aucun chiffre n’a été lu : ce n’est pas une équipe sans caisse.',
  'page.equipe.illisibleTitre': 'Réponse inattendue',
  'page.equipe.illisible':
    'La base a répondu, mais pas dans la forme attendue : aucun chiffre n’a pu être lu. Ce n’est pas une équipe sans caisse.',
  'page.equipe.jourManquantTitre': 'Jour manquant',
  'page.equipe.jourManquant':
    'La période « Un jour précis » demande une date. Aucune lecture n’a été faite : ce n’est pas une équipe vide.',

  'page.qrcode.surtitre': 'Acquisition',
  'page.qrcode.titre': 'QR Code',
  'page.qrcode.resume':
    'Le QR posé sur le comptoir renvoie vers la page publique d’adhésion `/join/<slug>` ; la vitrine du programme est `/recompenses/<slug>`.',
  'page.qrcode.vide':
    'Aucun QR à générer : le slug public dépend d’un programme qui n’existe pas encore ici.',

  /* -------------------------------------------------------------------------
     `/branding` — module Apparence (P0-5 du plan de parité, `0015`).
     Les libellés de sections (« 1 · Votre commerce », « 2 · Votre couleur »,
     « 3 · Le haut de la carte ») sont ceux du DOM mesuré, à la lettre, y
     compris le point médian.
     ---------------------------------------------------------------------- */
  'page.apparence.surtitre': 'Votre DA',
  'page.apparence.titre': 'Apparence',
  'page.apparence.chapeau':
    'Tout ce que vous changez ici apparaît aussitôt sur la carte, telle que vos clients la verront dans leur téléphone.',
  'page.apparence.section1': '1 · Votre commerce',
  'page.apparence.nom': 'Nom affiché sur la carte',
  'page.apparence.nomExemple': 'Le nom que vos clients connaissent',
  'page.apparence.logo': 'Logo',
  'page.apparence.logoChamp': 'Adresse de l’image du logo',
  'page.apparence.logoAide': 'Carré de préférence · redimensionné automatiquement.',
  'page.apparence.imageChamp': 'Adresse de l’image de fond',
  'page.apparence.envoiAbsent':
    'L’envoi d’un fichier n’est pas branché : ce socle n’a pas d’espace de stockage. Le champ attend l’adresse d’une image déjà en ligne, ou d’une image du site (commençant par « / »).',
  'page.apparence.type': 'Type d’établissement',
  'page.apparence.typeAide': 'Sert d’icône tant que vous n’avez pas de logo.',
  'page.apparence.type.restaurant': 'Restaurant',
  'page.apparence.type.cafe': 'Café',
  'page.apparence.type.coiffure': 'Coiffure',
  'page.apparence.type.barbershop': 'Barbershop',
  'page.apparence.type.pressing': 'Pressing',
  'page.apparence.type.retoucherie': 'Retoucherie',
  'page.apparence.type.boucherie': 'Boucherie',
  'page.apparence.type.patisserie': 'Pâtisserie',
  'page.apparence.type.librairie': 'Librairie',
  'page.apparence.type.autre': 'Autre',
  'page.apparence.section2': '2 · Votre couleur',
  'page.apparence.couleurAria': 'Couleur {code}',
  'page.apparence.couleurLibre': 'Couleur personnalisée',
  'page.apparence.couleurAide':
    'Les huit teintes sont des raccourcis ; le nuancier, à droite, accepte n’importe quelle couleur.',
  'page.apparence.section3': '3 · Le haut de la carte',
  'page.apparence.image': 'Image',
  'page.apparence.imageAide': 'Affichée en haut de la carte.',
  'page.apparence.imageAjouter': 'Ajoutez une image de fond',
  'page.apparence.apercuTitre': 'Aperçu de la carte',
  'page.apparence.apercuLegende':
    'Le code, les points et la date sont un exemple ; seuls le nom, le logo, le type et la couleur viennent de chez vous.',
  'page.apparence.apercuRecompense': 'PROCHAINE RÉCOMPENSE',
  'page.apparence.apercuCode': 'CODE CLIENT',
  'page.apparence.apercuPoints': 'POINTS',
  'page.apparence.apercuDepuis': 'DEPUIS',
  'page.apparence.apercuSansRecompense': 'Aucune récompense au menu',
  'page.apparence.action': 'Enregistrer',
  'page.apparence.actionEnCours': 'Enregistrement…',
  'page.apparence.enregistre': 'Apparence enregistrée.',
  'page.apparence.aucunTitre': 'Aucun programme à habiller',
  'page.apparence.aucunTexte':
    'La carte prend le nom et la couleur d’un programme de fidélité. Il n’y en a pas encore : créez-le d’abord dans « Programme ».',
  'page.apparence.aucunLien': 'Aller à Programme',
  'page.apparence.erreur.nom': 'Le nom doit faire au moins {min} caractères.',
  'page.apparence.erreur.nomLong': 'Le nom doit faire au plus {max} caractères.',
  'page.apparence.erreur.couleur':
    'La couleur doit être au format #rrggbb : un dièse et six chiffres hexadécimaux.',
  'page.apparence.erreur.type': 'Choisissez un type d’établissement dans la liste.',
  'page.apparence.erreur.logo':
    'L’adresse du logo doit commencer par https:// ou par « / », sans espace, et tenir en 500 caractères.',
  'page.apparence.erreur.image':
    'L’adresse de l’image doit commencer par https:// ou par « / », sans espace, et tenir en 500 caractères.',
  'page.apparence.erreur.refus': 'L’apparence n’a pas été enregistrée. Réessayez.',


  'page.scanner.surtitre': 'Caisse',
  'page.scanner.titre': 'Scanner un client',
  'page.scanner.resume':
    'Créditer les points d’un passage. L’appel part vers `award_loyalty_points`, la fonction réellement présente dans la base.',
  'page.scanner.action': 'Créditer les points',
  'page.scanner.enCours': 'Envoi…',
  'page.scanner.champJeton': 'Jeton de carte',
  'page.scanner.champMontant': 'Montant de l’achat',
  'page.scanner.champPoints': 'Points à créditer',
  /* Le barème vient du programme (`0008`) : il explique ce que produit un champ
     de points laissé vide, et il est affiché **sous** les deux champs. */
  'page.scanner.pointsAuto': 'Auto',
  'page.scanner.taux': 'Barème : {taux} crédits par euro. Laissez les points vides pour les calculer.',
  'page.scanner.ok': 'Points crédités.',
  'page.scanner.erreurJeton': 'Jeton invalide : 1 à 64 caractères.',
  'page.scanner.erreurMontant': 'Montant invalide : un nombre positif ou nul.',
  'page.scanner.erreurPoints': 'Points invalides : un entier positif ou nul.',

  'page.caisse.surtitre': 'Caisse',
  'page.caisse.titre': 'Caisse',
  'page.caisse.resume':
    'Échanger des points contre une récompense. L’appel part vers `redeem_loyalty_reward`.',
  'page.caisse.action': 'Échanger',
  'page.caisse.enCours': 'Envoi…',
  'page.caisse.champJeton': 'Jeton de carte',
  'page.caisse.identification': 'Identifier le client',
  'page.caisse.saisie': 'ou saisir le code à la main',
  'page.caisse.solde': 'Solde',
  'page.caisse.champCout': 'Coût en points',
  'page.caisse.champLibelle': 'Récompense',
  'page.caisse.ok': 'Récompense échangée.',
  'page.caisse.erreurJeton': 'Jeton invalide : 1 à 64 caractères.',
  'page.caisse.erreurCout': 'Coût invalide : un entier strictement positif.',
  'page.caisse.erreurLibelle': 'Le libellé de la récompense ne peut pas être vide.',
  /* Choix de la récompense en cartes-radio (2026-11-01) : le `<select>` ne
     montrait qu'une ligne à la fois, donc jamais le prix des autres paliers. */
  'page.caisse.recompenses': 'Récompenses',
  'page.caisse.recompensesAide': 'Choisissez ce que vous remettez au client.',
  'page.caisse.coutPoints': '{n} pts',
  'page.caisse.manque': 'Encore {n} pts',
  'page.caisse.aucunPalier':
    'Aucune récompense n’est définie : réglez les paliers dans l’écran Programme.',

  /* --- R3 : la caisse hors ligne (PWA, file d'attente) --------------------
     Le vocabulaire suit celui du comptoir : « en attente », « écartée », jamais
     « erreur 422 ». Ce que l'écran ne promet pas : l'échange hors ligne. */
  'page.caisse.shortName': 'Caisse',
  'page.caisse.crediterTitre': 'Créditer des points',
  'page.caisse.crediterAide':
    'Montant de l’achat. Laissez les points vides pour les calculer avec le barème du programme.',
  'page.caisse.crediterMontant': 'Montant de l’achat',
  'page.caisse.crediterPoints': 'Points à créditer',
  'page.caisse.crediterPointsAuto': 'Auto',
  'page.caisse.crediterTaux': 'Barème : {taux} crédits par euro.',
  'page.caisse.crediterAction': 'Créditer',
  'page.caisse.crediterEnCours': 'Envoi…',
  'page.caisse.crediterOk': 'Points crédités. Nouveau solde : {solde}.',
  'page.caisse.crediterAttente':
    'Enregistré hors ligne : l’opération partira au retour du réseau. Le solde affiché ne la compte pas encore.',
  'page.caisse.crediterErreurCarte':
    'Aucune carte ne porte ce code : aucun point n’a été crédité.',
  'page.caisse.crediterErreurRefus':
    'La base a refusé l’opération : aucun point n’a été crédité.',
  'page.caisse.fileTitre': 'Opérations en attente',
  'page.caisse.fileAide':
    'Elles partent toutes les 65 secondes dès que le réseau est là. Une opération refusée est écartée ; les autres restent.',
  'page.caisse.fileVide': 'Aucune opération en attente.',
  'page.caisse.fileNombre': '{n} en attente d’envoi.',
  'page.caisse.fileBloquees':
    '{n} sans succès à la dernière tentative — elles restent en file, rien n’est perdu.',
  'page.caisse.fileRejouer': 'Envoyer maintenant',
  'page.caisse.horsLigneTitre': 'Caisse hors ligne',
  'page.caisse.horsLigneTexte':
    'Le réseau est absent. Les points peuvent encore être crédités sur la caisse déjà ouverte : ils sont mis en file et partent au retour de la connexion.',
  'page.caisse.horsLigneEchange':
    'L’échange d’une récompense n’est pas disponible hors ligne : le solde du client n’est pas connu.',
  'tableau.garanties.formulaire':
    'Formulaires d’authentification fonctionnels sans JavaScript (server actions).',

  /* --- R3 : libellés partagés par les quatre modules ---------------------- */
  'tableau.champ.slug': 'Adresse publique',
  'tableau.champ.nom': 'Nom du programme',
  'tableau.champ.seuil': 'Seuil (points)',
  'tableau.champ.type': 'Type',
  'tableau.champ.libelle': 'Intitulé',
  'tableau.champ.cout': 'Coût en points',
  'tableau.champ.description': 'Description (facultative)',

  /* États « on ne peut pas encore » — quatre causes, quatre textes. Confondre
     « base non migrée », « aucun client » et « service non configuré » ferait
     chercher au mauvais endroit.

     La quatrième n'est **pas** rendue par la RPC : elle est produite par les
     actions de `/scan` et `/caisse` quand le client Supabase ne peut pas être
     construit. `tableau.rpc.configuration` existe et dit la même cause, mais
     elle décrit un **appel** qui n'aboutit pas et n'est rendue par aucun écran ;
     celle-ci décrit un **geste perdu** et c'est ce que le commerçant doit lire.
     Le texte de `migrationTitre`/`migrationTexte` serait faux ici : la base
     n'est pas en cause, la requête n'est jamais partie. */
  'tableau.etat.migrationTitre': 'La base n’est pas encore migrée',
  'tableau.etat.migrationTexte':
    'Cette action appelle une fonction absente de la base. Exécutez le fichier de migration indiqué dans l’éditeur SQL du projet, puis rechargez la page.',
  'tableau.chargement': 'Chargement de la page…',
  'tableau.etat.introuvable': 'Aucune carte ne porte ce code.',
  'tableau.etat.refus': 'La base a refusé l’opération. Le solde n’a pas changé.',
  'tableau.etat.arguments': 'Saisie refusée : vérifiez le code et les montants.',
  /* `&etat=configuration` sur `/scan` et `/caisse` — produit par l'action, pas
     par la RPC. Décision de copie, distincte de celle de `/login` : ici le
     message doit dire ce que le geste a **fait** (rien), parce que le commerçant
     vient de cliquer et croit peut-être avoir crédité des points. Aucun nom de
     variable — l'écran s'adresse au commerçant — et aucune promesse de réessai :
     une configuration absente ne se répare pas en recommençant. */
  'tableau.etat.configuration':
    'L’opération n’a pas été enregistrée : ce service n’est pas configuré. Aucun point n’a été ajouté ni retiré. Prévenez l’administrateur du site.',
  'tableau.etat.origineInconnue':
    'Adresse publique indéterminée : définissez NEXT_PUBLIC_SITE_URL sur le serveur.',

  'page.qrcode.legende': 'Scannez pour obtenir une carte',
  'page.qrcode.affiche': 'Affiche à poser au comptoir',
  'page.qrcode.imprimer': 'Imprimer l’affiche',
  'page.qrcode.afficheNote':
    'Le client scanne, saisit son nom si vous le souhaitez, et reçoit sa carte. Imprimez cette affiche telle quelle : le cadre blanc est la zone que le téléphone doit voir.',
  'page.qrcode.lien': 'Adresse encodée',
  'page.qrcode.aide':
    'Le QR s’imprime noir sur blanc : un code coloré devient illisible sur certains téléphones.',
  'page.qrcode.aucunTitre': 'Aucun programme, donc aucun QR',
  'page.qrcode.aucunTexte':
    'Le QR encode l’adresse d’adhésion, qui dépend du slug du programme. Créez le programme d’abord.',
  'page.qrcode.creer': 'Créer le programme',

  'page.programme.ok': 'Programme enregistré.',
  'page.programme.action': 'Enregistrer le programme',
  /* L'unité (2026-11-02). Le mode « tampons » de la cible est **refusé**, pas
     reporté : la caisse crédite des points et aucune carte ne dessine de grille.
     La phrase remplace l'ancien `select` — sans elle, l'écran laisse croire que
     le choix existe ailleurs. */
  'page.programme.unitePoints':
    'Ce programme compte des points. Le mode « tampons » n’est pas proposé : la caisse crédite des points, et aucune carte n’affiche de grille de tampons.',
  'page.programme.paliersTitre': 'Paliers de récompense',
  /* Le taux de conversion (migration `0008`). L'aide ne contient **pas** le
     symbole monétaire : il vient de `symboleDevise`, donc de la devise du
     programme — la recopier ici afficherait un euro sur un programme en dirhams. */
  'page.programme.champCredits': 'Crédits par euro',
  'page.programme.creditsAide': 'À ce taux, {montant} rapportent {points} points.',
  'page.programme.devise': 'Devise',
  'page.programme.erreur.credits': 'Taux invalide : un nombre entre 0,01 et 1000.',
  'page.programme.erreur.slug':
    'Adresse invalide : au moins 3 caractères, minuscules, chiffres et tirets.',
  'page.programme.erreur.seuil': 'Seuil invalide : un entier strictement positif.',
  'page.programme.erreur.paliers':
    'Paliers invalides : au moins un palier, avec un intitulé et un coût croissant.',
  'page.programme.erreur.refus':
    'La base a refusé l’enregistrement. Aucun palier n’a été modifié.',

  /* --- `/program` — les Règles du programme (écart P0-1) ------------------
     TOUT CE BLOC EST MESURÉ, sauf mention contraire, sur
     `_captures/2026-11-02-a6/rendu/a02-program.html` : le `h1` « Programme »,
     l'onglet « Règles » actif, la carte « Configuration » et ses sept
     réglages, les aides, les deux `placeholder` et le bouton « Enregistrer ».

     Les symboles monétaires ne sont **jamais** recopiés : la capture écrit
     « Points par 10 € » parce que son programme est en euros, ici la devise est
     une donnée (`loyalty_programs.devise`). Le gabarit porte donc `{tranche}` et
     `{symbole}`, et `tableau-lecture.test.mjs` interdit « € » dans toute valeur
     du dictionnaire. Rendus en euros, les cinq libellés concernés donnent
     exactement le texte de la capture — c'est ce que vérifie
     `reglages-programme.test.mjs`, témoin à l'appui.

     Trois écarts, déclarés dans `docs/design-system.md` §3 :
       - « Demander sur WhatsApp » (lien `wa.me` de la cible) n'est pas repris :
         il porte le numéro du support de la cible, et ce socle n'en a pas ;
       - les mises en gras de la dernière phrase (`<b>`) ne sont pas rendues :
         une chaîne du dictionnaire n'a pas de balises ;
       - l'exemple chiffré se recalcule au chargement, pas à la frappe (le
         formulaire reste sans JavaScript), comme l'aide de `/rewards`. */
  'page.programme.regles.metaTitre': 'Règles',
  'page.programme.regles.configuration': 'Configuration',
  'page.programme.regles.devise': 'Devise de vos montants',
  'page.programme.regles.deviseMAD': 'Dirham (MAD)',
  'page.programme.regles.deviseEUR': 'Euro ({symbole})',
  'page.programme.regles.deviseAide':
    "Celle des montants saisis en caisse, du barème et du chiffre d'affaires affiché.",
  'page.programme.regles.points': 'Points par {tranche} {symbole} dépensés',
  'page.programme.regles.pointsAide':
    "C'est votre barème. Il se règle par tranche de {tranche} {symbole}.",
  'page.programme.regles.minimum': 'Achat minimum ({symbole})',
  'page.programme.regles.minimumAide': "En dessous, aucun point n'est crédité.",
  'page.programme.regles.minimumExemple': 'Un ticket de {montant} créditera {points} points.',
  'page.programme.regles.cashback': 'Mode cashback',
  /* « 1 point = 1 € de remise » : le second « 1 » est mesuré, et il n'est pas
     décoratif — sans lui la phrase promet « 1 point = € de remise », ce qui ne
     veut rien dire. Seul le **symbole** est une donnée. */
  'page.programme.regles.cashbackAide':
    '1 point = 1 {symbole} de remise. À chaque passage, la caisse déduit le nombre de points de votre choix, dans la limite du solde du client — sans passer par une récompense.',
  'page.programme.regles.expiration': 'Expiration des points (jours, 0 = jamais)',
  'page.programme.regles.parrainage': 'Parrainage',
  'page.programme.regles.parrainageChamp': 'Bonus de parrainage (points)',
  'page.programme.regles.parrainageAide':
    "Quand un client invite un ami, les deux reçoivent ce bonus au premier passage en caisse de l'ami — pas à son inscription. Mettez 0 pour ne pas offrir de bonus.",
  'page.programme.regles.parrainageVide': '0 = désactivé',
  'page.programme.regles.avis': 'Bonus avis Google',
  'page.programme.regles.avisActiver': 'Activer le bonus avis Google',
  'page.programme.regles.avisPoints': 'Bonus accordé (points)',
  'page.programme.regles.avisPointsVide': 'Ex : 10',
  'page.programme.regles.avisLien': "Lien de votre page d'avis Google",
  'page.programme.regles.avisLienGabarit':
    'https://search.google.com/local/writereview?placeid=...',
  'page.programme.regles.avisLienAide':
    'Collez votre Place ID à la fin du lien, après placeid=.',
  'page.programme.regles.avisTrouver': 'Trouver mon Place ID',
  'page.programme.regles.avisNote':
    "Le client laisse un avis, puis demande son bonus depuis sa carte. Vous validez chaque demande depuis l'onglet Avis Google — le bonus n'est crédité qu'une seule fois par client.",
  'page.programme.regles.action': 'Enregistrer',
  'page.programme.regles.ok': 'Réglages enregistrés.',
  'page.programme.regles.aucunTitre': 'Aucun programme',
  'page.programme.regles.aucunTexte':
    'Ces règles s’appliquent au programme du commerce. Créez-le d’abord depuis l’onglet Récompenses.',
  'page.programme.regles.aucunLien': 'Créer le programme',
  /* Les neuf refus, un par règle vérifiée par `refusReglages`. Le message dit
     la **borne**, jamais « erreur de saisie » : c'est ce qui distingue un refus
     utile d'un refus qui fait recommencer à l'aveugle. */
  'page.programme.regles.erreur.devise': 'Devise invalide : Dirham (MAD) ou Euro.',
  'page.programme.regles.erreur.points':
    'Barème invalide : un nombre entre 0,1 et 10 000, par pas de 0,1.',
  'page.programme.regles.erreur.minimum': 'Achat minimum invalide : un montant positif ou nul.',
  'page.programme.regles.erreur.expiration':
    'Expiration invalide : un nombre entier de jours (0 = jamais).',
  'page.programme.regles.erreur.parrainage':
    'Bonus de parrainage invalide : un nombre entier de points (0 = désactivé).',
  'page.programme.regles.erreur.avisPoints':
    'Bonus d’avis invalide : un nombre entier de points.',
  'page.programme.regles.erreur.avisActif':
    'Le bonus d’avis est activé mais n’accorde aucun point : mettez 0 pour le désactiver.',
  'page.programme.regles.erreur.avisLien':
    'Lien invalide : une adresse complète qui commence par https://.',
  'page.programme.regles.erreur.avisSansLien':
    'Activer le bonus d’avis exige le lien de votre page d’avis Google.',
  'page.programme.regles.erreur.refus':
    'La base a refusé l’enregistrement. Aucun réglage n’a été modifié.',

  'page.scanner.chercher': 'Afficher la carte',
  'page.scanner.client': 'Client',
  'page.scanner.prochain': 'Prochaine récompense',
  'page.scanner.toutAtteint': 'Tous les paliers sont atteints.',
  'page.scanner.introuvable': 'Carte inconnue',
  /* Caméra du scanner. Les quatre états d'échec ont un texte distinct : un
     « la caméra n'a pas marché » unique ferait chercher du mauvais côté —
     refus de permission, navigateur sans `BarcodeDetector`, appareil sans
     caméra et flux en échec n'ont pas le même remède. */
  'page.scanner.camera.titre': 'Caméra',
  'page.scanner.camera.aide': 'Scannez le QR code de la carte avec l’appareil photo.',
  'page.scanner.camera.activer': 'Activer la caméra',
  'page.scanner.camera.demande': 'Autorisation…',
  'page.scanner.camera.arreter': 'Arrêter',
  'page.scanner.camera.video': 'Aperçu de la caméra',
  'page.scanner.camera.actif': 'Caméra active : présentez le QR code de la carte.',
  'page.scanner.camera.refus':
    'Accès à la caméra refusé. La saisie du code reste disponible ci-dessous.',
  'page.scanner.camera.sansCamera':
    'Aucune caméra utilisable sur cet appareil. Saisissez le code ci-dessous.',
  'page.scanner.camera.nonSupporte':
    'Ce navigateur ne sait pas lire les QR codes. Saisissez le code ci-dessous.',
  'page.scanner.camera.indisponible':
    'La caméra n’a pas pu démarrer. Saisissez le code ci-dessous.',
  'page.scanner.camera.repli': 'La saisie manuelle reste toujours possible.',

  'page.caisse.chercher': 'Afficher la carte',
  'page.caisse.client': 'Client',
  'page.caisse.prochain': 'Prochaine récompense',
  'page.caisse.toutAtteint': 'Tous les paliers sont atteints.',
  'page.caisse.introuvable': 'Carte inconnue',
  'page.caisse.aucuneRecompense': 'Aucune récompense atteignable avec ce solde.',

  'page.adhesion.surtitre': 'Carte de fidélité',
  'page.adhesion.titre': 'Obtenir ma carte',
  'page.adhesion.action': 'Obtenir ma carte',
  'page.adhesion.sansDonnees': 'Ni nom, ni email, ni téléphone : un code suffit.',
  'page.adhesion.succes': 'Votre carte est créée.',
  'page.adhesion.conserver':
    'Montrez ce code au comptoir. Notez-le : il ne peut pas être retrouvé.',
  'page.adhesion.ferme': 'Ce programme n’accepte pas d’adhésion pour le moment.',

  /* --- Le choix de la caisse (`0009`) — mesuré, puis écrit ---------------- */

  /* MESURÉ : `p17-join.html`, `<label id="qui-vous-a-servi">`. */
  'page.adhesion.caisse': 'Qui vous a servi ?',
  /* MESURÉ : la même étiquette, dans son `span` d'atténuation. Les parenthèses
     font partie du texte rendu par la cible — elles sont donc dans la valeur. */
  'page.adhesion.caisseFacultatif': '(facultatif)',
  /* ÉCRIT, sans capture : l'état « la carte est créée, la caisse ne l'est pas »
     n'a jamais été rendu sur la cible (il demande une caisse supprimée entre
     l'affichage et l'envoi). La phrase dit les deux choses dans cet ordre —
     le résultat, puis ce qui manque — et **ne promet aucun rattrapage** : il
     n'existe aucune fonction qui redésigne une carte après coup, et écrire
     « vous pourrez la désigner au comptoir » serait une promesse sans geste
     (`lesson-learned` §38). */
  'page.adhesion.sansDesignation':
    'La caisse choisie n’est plus disponible. Votre carte est créée sans elle.',


  /* --- Vitrine publique `/recompenses/<slug>` ------------------------------ */
  'page.vitrine.titre': 'Programme de fidélité',
  'page.vitrine.surtitre': 'Programme de fidélité',
  'page.vitrine.accroche': '{points} points = {libelle}',
  'page.vitrine.action': 'Obtenir ma carte',
  'page.vitrine.sansPaliers':
    'Ce programme n’a pas encore publié de récompense. Le comptoir peut vous inscrire.',

  /* --- Carte publique `/card/<cardId>` (P0-2b) -----------------------------
     Forme mesurée : `_captures/2026-10-27-a3/mesure-a3.json` — la page répond
     **200 en anonyme**, titre « Carte fidélité — <commerce> ». Les libellés
     « Carte de fidélité », « Code client », « Membre depuis » et
     « Ajouter à votre wallet » viennent du chunk `card/[cardId]/page-…js`.

     RÈGLE DE CETTE PAGE, écrite ici pour qu'on ne la déplace pas : rien de ce
     qu'elle affiche ne promet la notification « à proximité ». La proximité est
     un géorepérage Wallet ; le bloc de notifications, lui, sert les messages du
     commerçant. `page.carte.proximite` le dit au client, à la fin. */
  'page.carte.titre': 'Carte de fidélité',
  'page.carte.metaTitre': 'Carte de fidélité — {commerce}',
  'page.carte.surtitre': 'Carte de fidélité',
  'page.carte.bonjour': 'Bonjour {prenom}',
  'page.carte.points': 'points',
  'page.carte.code': 'Code client',
  'page.carte.prochain': 'Encore {reste} points avant « {libelle} »',
  'page.carte.toutAtteint': 'Toutes vos récompenses sont atteignables.',
  'page.carte.depuis': 'Membre depuis {date}',
  'page.carte.wallet': 'Ajouter à votre wallet',
  'page.carte.walletGoogle': 'Ajouter à Google Wallet',
  'page.carte.garder': 'Gardez cette page en favori : c’est votre carte.',
  'page.carte.proximite':
    'Cette page n’active pas la notification de proximité : celle-ci dépend de la carte ajoutée au Wallet.',

  /* --- Opt-in web push — les cinq états et trois refus mesurés -------------
     MESURÉ : module 61618 du chunk `card/[cardId]/page-…js`. Les trois refus de
     la cible sont repris presque mot pour mot ; le reste décrit notre marque. */
  'carte.push.surtitre': 'Notifications',
  'carte.push.titre': 'Ne ratez aucune offre',
  'carte.push.texte':
    'Promotions, récompenses débloquées, invitations : recevez tout directement sur votre téléphone.',
  'carte.push.activer': 'Activer les notifications',
  'carte.push.activation': 'Activation…',
  'carte.push.active': 'Notifications activées — vous ne raterez rien',
  'carte.push.bloquees': 'Notifications bloquées',
  'carte.push.bloqueesTexte':
    'Appuyez sur l’icône à gauche de l’adresse du site, puis autorisez les notifications pour recevoir les offres de {commerce}.',
  'carte.push.fermer': 'Fermer',
  'carte.push.erreurPermission':
    'Autorisez les notifications quand votre téléphone vous le demande, puis réessayez.',
  'carte.push.erreurEnregistrement':
    'L’activation n’a pas pu être enregistrée. Réessayez dans un instant.',
  'carte.push.erreurReseau':
    'L’activation a échoué. Vérifiez votre connexion, puis réessayez.',
  'carte.push.erreurCarte':
    'Cette carte n’est plus reconnue. Rouvrez le lien de votre carte.',
  'carte.push.erreurPlafond':
    'Trop d’appareils sont déjà abonnés pour cette carte.',

  /* --- Fiche établissement `/settings` (P0-2) -----------------------------
     Copie mesurée : `_captures/2026-11-02-a7/rendu/c01-settings.html`. Les
     `placeholder` sont dans `page.compte.exemple.*` — ils font partie du texte
     rendu par la cible, donc du dictionnaire, pas du code. */
  'page.compte.metaTitre': 'Mon compte',
  'page.compte.titre': 'Mon compte',
  'page.compte.etablissement': 'Établissement',
  'page.compte.nom': 'Nom *',
  'page.compte.typeActivite': 'Type d’activité',
  'page.compte.type.physique': 'Commerce physique — mes clients viennent sur place',
  'page.compte.type.enLigne': 'Commerce en ligne — je vends à distance',
  'page.compte.type.mixte': 'Les deux',
  'page.compte.phone': 'Téléphone',
  'page.compte.city': 'Ville',
  'page.compte.address': 'Adresse',
  'page.compte.description': 'Description courte',
  'page.compte.liens': 'Liens sur la carte',
  'page.compte.liensAide':
    'Affichés au dos de la carte de vos clients, dans leur wallet. L’adresse et le téléphone ci-dessus y figurent aussi, et sont cliquables.',
  'page.compte.site': 'Site web',
  'page.compte.reservation': 'Réservation en ligne',
  'page.compte.instagram': 'Instagram',
  'page.compte.facebook': 'Facebook',
  'page.compte.tiktok': 'TikTok',
  'page.compte.proximite': 'Notification à proximité',
  'page.compte.proximiteAide':
    'Vos clients reçoivent une notification quand ils passent près de chez vous, sans que vous ayez rien à envoyer. Il faut que la carte soit dans leur wallet. Comptez quelques minutes après leur entrée dans la zone : le téléphone n’écoute pas le GPS en continu, il se réveille par intermittence pour préserver la batterie.',
  'page.compte.emplacement': 'Emplacement de la boutique',
  'page.compte.emplacementAide':
    'Sur Google Maps : trouvez votre boutique, appuyez sur Partager, puis copiez le lien. Vous pouvez aussi saisir vos coordonnées : 33.5731, -7.5898. Laissez vide pour désactiver.',
  'page.compte.rayon': 'Distance de déclenchement',
  'page.compte.rayonAide1': 'En mètres, jusqu’à 2000. Couverture réelle : ',
  'page.compte.couverture': '≈ {metres} m',
  'page.compte.rayonAide2':
    '. Apple et Google fixent eux-mêmes la portée de chaque point ; nous en plaçons plusieurs autour de votre boutique pour couvrir la zone, sans jamais pouvoir dépasser ce plafond.',
  'page.compte.texte': 'Message affiché',
  'page.compte.texteAide': '120 caractères maximum. Vide = « Vous êtes près de {commerce} ».',
  'page.compte.action': 'Enregistrer',
  'page.compte.ok': 'Fiche enregistrée.',
  'page.compte.aucunTitre': 'Aucun programme',
  'page.compte.aucunTexte':
    'Ces coordonnées appartiennent au programme du commerce. Créez-le d’abord depuis l’onglet Récompenses.',
  'page.compte.aucunLien': 'Créer le programme',
  'page.compte.erreur.nom': 'Le nom du commerce est obligatoire.',
  'page.compte.erreur.type': 'Type d’activité inconnu : choisissez l’une des trois options.',
  'page.compte.erreur.rayon':
    'Distance invalide : un nombre entier de mètres entre 50 et 2000, par pas de 50.',
  'page.compte.erreur.texte': 'Message trop long : 120 caractères maximum.',
  'page.compte.erreur.emplacement':
    'Emplacement illisible : collez un lien Google Maps complet, ou vos coordonnées (« 33.5731, -7.5898 »).',
  'page.compte.erreur.emplacementCourt':
    'Ce lien est raccourci : il ne contient pas les coordonnées. Ouvrez-le, puis copiez l’adresse complète de la barre du navigateur.',
  'page.compte.erreur.refus':
    'La fiche n’a pas été enregistrée : la base a refusé une des valeurs.',

  'page.compte.exemple.phone': '+212 6 00 00 00 00',
  'page.compte.exemple.city': 'Casablanca',
  'page.compte.exemple.address': '123 rue Mohammed V',
  'page.compte.exemple.description': 'Restaurant marocain traditionnel...',
  'page.compte.exemple.site': 'moncafe.ma',
  'page.compte.exemple.reservation': 'moncafe.ma/reserver',
  'page.compte.exemple.instagram': 'instagram.com/moncafe',
  'page.compte.exemple.facebook': 'facebook.com/moncafe',
  'page.compte.exemple.tiktok': 'tiktok.com/@moncafe',
  'page.compte.exemple.emplacement': 'Collez votre lien Google Maps',
  'page.compte.exemple.rayon': '1000',
  'page.compte.exemple.texte': 'Un café vous attend chez nous ☕',

  /* --------------------------------------------------------------------------
     L'offre gratuite (P0-3) — textes **mesurés**.
     Sources : `c01-settings.html:29706` (bandeau), `c02-billing.html:43501`
     (progression), `chunks_9990:1494` (plafond atteint), `layout-c7e219:38932`
     (calme / attention / urgente). La règle de comptage est dans
     `docs/regle-comptage-30-2026-11-02.md` ; la limite, elle, vient de la base
     (`0012`), jamais d'ici.
     ------------------------------------------------------------------------ */
  'offre.titre': 'Offre gratuite',
  'offre.epuisee': 'Offre gratuite épuisée',
  'offre.surLimite': ' / {limite} clients',
  'offre.ariaJauge': '{clients} clients sur {limite} dans l’offre gratuite',
  'offre.msgCalme': 'Gratuit jusqu’à {limite} clients, sans aucune autre limite.',
  'offre.msgAttention': 'Plus que {reste} clients avant la limite gratuite.',
  'offre.msgUrgentUn':
    'Plus que {reste} client : au {limite}e, le scan s’arrête. Abonnez-vous maintenant pour ne pas l’interrompre.',
  'offre.msgUrgentPlusieurs':
    'Plus que {reste} clients : au {limite}e, le scan s’arrête. Abonnez-vous maintenant pour ne pas l’interrompre.',
  'offre.msgAtteint':
    '{clients} clients ont déjà leur carte. Activez l’abonnement pour continuer à scanner et inscrire de nouveaux clients.',
  'offre.voirAbonnement': 'Voir l’abonnement',
  'offre.plaqueTitre': 'La plaque NFC n’est pas comprise dans l’offre gratuite.',
  'offre.plaqueTexte':
    'Elle se commande à part, {prix} MAD une seule fois, depuis votre tableau de bord. Sans elle, vos clients s’inscrivent avec votre QR code.',

  /* --------------------------------------------------------------------------
     `/billing` (P0-3) — l'onglet « Abonnement » du groupe « Mon compte ».
     La barre à trois onglets est mesurée (`c01-settings.html:31855`) :
     Paramètres → `/settings`, Abonnement → `/billing`, Données clients →
     `/donnees-clients`. Seuls les deux premiers ont une page : le troisième
     n'est pas rendu (déclaré dans `docs/design-system.md` §3).
     ------------------------------------------------------------------------ */
  'page.abonnement.metaTitre': 'Abonnement',
  'page.abonnement.titre': 'Mon compte',
  'page.abonnement.ongletsAria': 'Sections du compte',
  'page.abonnement.ongletParametres': 'Paramètres',
  'page.abonnement.ongletAbonnement': 'Abonnement',
  'page.abonnement.votre': 'Votre abonnement',
  'page.abonnement.aucun': 'Aucun abonnement actif',
  'page.abonnement.activationAbsente':
    'L’activation en ligne n’est pas encore disponible dans cette version : aucun paiement n’est demandé.',
  'page.abonnement.progressionUn':
    '{clients} client sur {limite} offerts. Votre programme fonctionne déjà ; l’abonnement lève la limite.',
  'page.abonnement.progressionPlusieurs':
    '{clients} clients sur {limite} offerts. Votre programme fonctionne déjà ; l’abonnement lève la limite.',
  'page.abonnement.ariaJauge': 'Clients inscrits sur l’offre gratuite',
  'page.abonnement.prixMois': '{prix} MAD / mois TTC',
  'page.abonnement.parPoint': '{prix} MAD par point de vente',
  'page.abonnement.inclus': 'Clients illimités · Wallet · Push · Campagnes email',
  'page.abonnement.plaquePrix': '{prix} MAD',
  'page.abonnement.plaqueUneFois': '· une seule fois',
  'page.abonnement.plaqueTexte': 'Carte NFC acrylique posée en caisse (optionnel)',
  'page.abonnement.nonRendu':
    'Non rendu ici, faute de paiement branché : rythme de paiement, packs d’emails, points de vente supplémentaires, conditions du pack.',

}


export const DICTIONNAIRES = Object.freeze({ fr })
