'use strict';

/* Banque de contenu : quiz (8 catégories × 10 questions), devinettes (5 packs × 6),
   et 120 mots à deviner/dessiner (12 packs × 10). Le catalogue généré fait 100+ jeux. */

const QUIZ_CATEGORIES = [
  {
    key: 'general', name: 'Culture générale', emoji: '🧠',
    questions: [
      { q: 'Quelle est la capitale de la France ?', options: ['Paris', 'Lyon', 'Marseille', 'Lille'], answer: 0 },
      { q: 'Combien font 7 × 8 ?', options: ['54', '56', '48', '64'], answer: 1 },
      { q: 'Quel est le plus grand océan du monde ?', options: ['Atlantique', 'Pacifique', 'Indien', 'Arctique'], answer: 1 },
      { q: 'Combien de côtés a un hexagone ?', options: ['5', '6', '7', '8'], answer: 1 },
      { q: 'Combien de pattes a une araignée ?', options: ['6', '8', '10', '12'], answer: 1 },
      { q: 'Quelle est la langue maternelle la plus parlée au monde ?', options: ['Anglais', 'Mandarin', 'Espagnol', 'Hindi'], answer: 1 },
      { q: 'En quelle année est tombé le mur de Berlin ?', options: ['1987', '1989', '1991', '1985'], answer: 1 },
      { q: 'La vitesse de la lumière est d’environ…', options: ['300 000 km/s', '150 000 km/s', '1 000 000 km/s', '30 000 km/s'], answer: 0 },
      { q: 'Quel instrument possède 6 cordes ?', options: ['Le violon', 'La guitare', 'Le piano', 'La harpe'], answer: 1 },
      { q: 'En quelle année ont eu lieu les Jeux olympiques de Paris ?', options: ['2020', '2024', '2028', '2016'], answer: 1 },
    ],
  },
  {
    key: 'geo', name: 'Géographie', emoji: '🌍',
    questions: [
      { q: 'Dans quel pays se trouve le Machu Picchu ?', options: ['Pérou', 'Brésil', 'Mexique', 'Chili'], answer: 0 },
      { q: 'Quelle est la capitale du Japon ?', options: ['Pékin', 'Séoul', 'Tokyo', 'Bangkok'], answer: 2 },
      { q: 'Dans quelle mer se jette le Nil ?', options: ['Méditerranée', 'Mer Rouge', 'Océan Indien', 'Golfe Persique'], answer: 0 },
      { q: 'Quel est le plus haut sommet du monde ?', options: ['K2', 'Everest', 'Mont-Blanc', 'Kilimandjaro'], answer: 1 },
      { q: 'Le « pays du Soleil levant », c’est…', options: ['Le Japon', 'La Chine', 'La Thaïlande', 'La Corée du Sud'], answer: 0 },
      { q: 'Quelle est la capitale de l’Australie ?', options: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], answer: 2 },
      { q: 'Quelle est l’île la plus peuplée du monde ?', options: ['Madagascar', 'Grande-Bretagne', 'Java', 'Sumatra'], answer: 2 },
      { q: 'Le Sahara se trouve principalement en…', options: ['Afrique', 'Asie', 'Amérique', 'Australie'], answer: 0 },
      { q: 'Quelle est la capitale du Canada ?', options: ['Toronto', 'Ottawa', 'Montréal', 'Vancouver'], answer: 1 },
      { q: 'Quel est le plus long fleuve d’Europe ?', options: ['Le Danube', 'La Volga', 'Le Rhin', 'La Loire'], answer: 1 },
    ],
  },
  {
    key: 'science', name: 'Sciences', emoji: '🔬',
    questions: [
      { q: 'Quel est le symbole chimique de l’or ?', options: ['Ag', 'Au', 'Fe', 'Or'], answer: 1 },
      { q: 'Quelle planète est la plus proche du Soleil ?', options: ['Vénus', 'Mercure', 'Mars', 'La Terre'], answer: 1 },
      { q: 'H₂O, c’est…', options: ['De l’oxygène', 'De l’eau', 'De l’hydrogène', 'Du sel'], answer: 1 },
      { q: 'Combien de planètes compte le système solaire ?', options: ['7', '8', '9', '10'], answer: 1 },
      { q: 'Quelle force nous attire vers le sol ?', options: ['Le magnétisme', 'La gravité', 'La friction', 'L’inertie'], answer: 1 },
      { q: 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', options: ['CO₂', 'O₂', 'N₂', 'H₂'], answer: 0 },
      { q: 'L’intensité d’un courant électrique se mesure en…', options: ['Volts', 'Ampères', 'Ohms', 'Watts'], answer: 1 },
      { q: 'L’ADN est un…', options: ['Acide désoxyribonucléique', 'Acide ribonucléique', 'Protéine nucléaire', 'Enzyme'], answer: 0 },
      { q: 'La « planète rouge », c’est…', options: ['Mars', 'Vénus', 'Jupiter', 'Saturne'], answer: 0 },
      { q: '0 °C correspond à combien de degrés Fahrenheit ?', options: ['32 °F', '0 °F', '100 °F', '12 °F'], answer: 0 },
    ],
  },
  {
    key: 'sport', name: 'Sport', emoji: '⚽',
    questions: [
      { q: 'Combien de joueurs d’une équipe de foot sont sur le terrain ?', options: ['9', '10', '11', '12'], answer: 2 },
      { q: 'La Coupe du monde de football a lieu tous les…', options: ['2 ans', '3 ans', '4 ans', '5 ans'], answer: 2 },
      { q: 'Roland-Garros, c’est un tournoi de…', options: ['Golf', 'Tennis', 'Voile', 'Athlétisme'], answer: 1 },
      { q: 'Combien de joueurs au basket par équipe sur le terrain ?', options: ['5', '6', '7', '11'], answer: 0 },
      { q: 'De quelle couleur est le maillot du leader du Tour de France ?', options: ['Jaune', 'Vert', 'Blanc', 'À pois rouges'], answer: 0 },
      { q: 'Teddy Riner est champion de…', options: ['Judo', 'Karaté', 'Boxe', 'Escrime'], answer: 0 },
      { q: 'Les Jeux olympiques d’été ont lieu tous les…', options: ['2 ans', '4 ans', '3 ans', '5 ans'], answer: 1 },
      { q: 'Au handball, combien de joueurs par équipe sur le terrain ?', options: ['6', '7', '8', '9'], answer: 1 },
      { q: 'Usain Bolt était un…', options: ['Sprinter', 'Nageur', 'Cycliste', 'Gymnaste'], answer: 0 },
      { q: 'Wimbledon se joue sur…', options: ['Gazon', 'Terre battue', 'Moquette', 'Dur'], answer: 0 },
    ],
  },
  {
    key: 'culture', name: 'Cinéma & musique', emoji: '🎬',
    questions: [
      { q: 'Qui a peint la Joconde ?', options: ['Léonard de Vinci', 'Monet', 'Picasso', 'Dalí'], answer: 0 },
      { q: 'Qui a réalisé Jurassic Park (1993) ?', options: ['Steven Spielberg', 'Martin Scorsese', 'George Lucas', 'James Cameron'], answer: 0 },
      { q: 'Qui chante « Bohemian Rhapsody » ?', options: ['Queen', 'The Beatles', 'The Rolling Stones', 'Pink Floyd'], answer: 0 },
      { q: 'Quel acteur joue Iron Man dans le MCU ?', options: ['Robert Downey Jr.', 'Chris Evans', 'Tom Holland', 'Mark Ruffalo'], answer: 0 },
      { q: 'Le Roi Lion (1994) est un film…', options: ['Pixar', 'Disney', 'DreamWorks', 'Universal'], answer: 1 },
      { q: 'Une guitare classique a combien de cordes ?', options: ['4', '5', '6', '12'], answer: 2 },
      { q: 'Quel film a remporté l’Oscar du meilleur film en 2024 ?', options: ['Oppenheimer', 'Barbie', 'Killers of the Flower Moon', 'Poor Things'], answer: 0 },
      { q: 'Qui chante « Shape of You » ?', options: ['Ed Sheeran', 'Drake', 'Justin Bieber', 'The Weeknd'], answer: 0 },
      { q: 'Qui a réalisé « Les Dents de la mer » ?', options: ['Steven Spielberg', 'Ridley Scott', 'John Carpenter', 'Francis Ford Coppola'], answer: 0 },
      { q: 'Daft Punk était composé de…', options: ['1 membre', '2 membres', '3 membres', '4 membres'], answer: 1 },
    ],
  },
  {
    key: 'histoire', name: 'Histoire', emoji: '🏛️',
    questions: [
      { q: 'En quelle année a commencé la Révolution française ?', options: ['1789', '1776', '1815', '1848'], answer: 0 },
      { q: 'Qui a été le premier président de la Ve République ?', options: ['Charles de Gaulle', 'Georges Pompidou', 'François Mitterrand', 'Jacques Chirac'], answer: 0 },
      { q: 'Qui a « découvert » l’Amérique en 1492 ?', options: ['Christophe Colomb', 'Magellan', 'Vasco de Gama', 'Cabral'], answer: 0 },
      { q: 'Les grandes pyramides célèbres sont en…', options: ['Égypte', 'Italie', 'Mexique', 'Pérou'], answer: 0 },
      { q: 'La Première Guerre mondiale s’est déroulée de…', options: ['1914 à 1918', '1939 à 1945', '1870 à 1871', '1900 à 1901'], answer: 0 },
      { q: 'Le « Roi Soleil », c’est…', options: ['Louis XIV', 'Louis XVI', 'Charles X', 'Henri IV'], answer: 0 },
      { q: 'La Déclaration des droits de l’homme et du citoyen date de…', options: ['1789', '1848', '1948', '1776'], answer: 0 },
      { q: 'Jules César a été assassiné en…', options: ['44 av. J.-C.', '27 av. J.-C.', '476 ap. J.-C.', '1453'], answer: 0 },
      { q: 'La Seconde Guerre mondiale a commencé en…', options: ['1939', '1914', '1941', '1945'], answer: 0 },
      { q: 'Charlemagne a été couronné empereur en…', options: ['800', '1066', '1492', '1789'], answer: 0 },
    ],
  },
  {
    key: 'animaux', name: 'Animaux', emoji: '🦁',
    questions: [
      { q: 'Quel est le plus grand animal terrestre ?', options: ['L’éléphant', 'La girafe', 'Le rhinocéros', 'L’hippopotame'], answer: 0 },
      { q: 'Quel animal est le symbole de la sagesse ?', options: ['La chouette', 'Le renard', 'L’aigle', 'Le lion'], answer: 0 },
      { q: 'Combien de pattes a un insecte ?', options: ['4', '6', '8', '10'], answer: 1 },
      { q: 'Quel animal change de couleur ?', options: ['Le caméléon', 'Le renard', 'Le hibou', 'Le corbeau'], answer: 0 },
      { q: 'Quel est l’animal terrestre le plus rapide ?', options: ['Le guépard', 'Le lion', 'Le cheval', 'Le zèbre'], answer: 0 },
      { q: 'Quel animal dort debout ?', options: ['Le cheval', 'La vache', 'L’éléphant', 'La girafe'], answer: 0 },
      { q: 'Le bébé de la grenouille s’appelle…', options: ['Un têtard', 'Une chenille', 'Un asticot', 'Une larve'], answer: 0 },
      { q: 'L’emblème de l’Australie, c’est…', options: ['Le kangourou', 'Le koala', 'Le wombat', 'L’ornithorynque'], answer: 0 },
      { q: 'Quel animal fait « miaou » ?', options: ['Le chat', 'Le chien', 'La vache', 'Le cheval'], answer: 0 },
      { q: 'Quelle est la plus grande baleine ?', options: ['La baleine bleue', 'La baleine à bosse', 'La baleine grise', 'La baleine franche'], answer: 0 },
    ],
  },
  {
    key: 'espace', name: 'Espace', emoji: '🚀',
    questions: [
      { q: 'Quelle est l’étoile la plus proche de la Terre (hors Soleil) ?', options: ['Proxima du Centaure', 'Sirius', 'Véga', 'L’étoile Polaire'], answer: 0 },
      { q: 'L’Homme a marché sur la Lune en…', options: ['1969', '1959', '1979', '1989'], answer: 0 },
      { q: 'Quelle planète est célèbre pour ses anneaux ?', options: ['Saturne', 'Mars', 'Vénus', 'Mercure'], answer: 0 },
      { q: 'Dans quelle galaxie se trouve le Soleil ?', options: ['La Voie lactée', 'Andromède', 'Le Tourbillon', 'Le Sombrero'], answer: 0 },
      { q: 'Le Soleil est…', options: ['Une planète', 'Une étoile', 'Une comète', 'Une météorite'], answer: 1 },
      { q: 'La Lune met environ combien de temps pour orbiter autour de la Terre ?', options: ['1 jour', '7 jours', '28 jours', '365 jours'], answer: 2 },
      { q: 'Quel astronaute français est très connu ?', options: ['Thomas Pesquet', 'Youri Gagarine', 'Neil Armstrong', 'Buzz Aldrin'], answer: 0 },
      { q: 'Combien de lunes a Mars ?', options: ['2', '0', '1', '4'], answer: 0 },
      { q: 'Le premier trou noir photographié (2019) s’appelle…', options: ['M87*', 'Sagittarius A*', 'Cygnus X-1', 'V404 Cygni'], answer: 0 },
      { q: 'En astronomie, on mesure les grandes distances en…', options: ['Kilomètres', 'Millions de km', 'Années-lumière', 'Heures-lumière'], answer: 2 },
    ],
  },
];

const RIDDLE_PACKS = [
  {
    key: 'classiques', name: 'Classiques', emoji: '🧩',
    riddles: [
      { q: 'Je cours mais je n’ai pas de jambes. Qui suis-je ?', a: 'rivière' },
      { q: 'Je suis pleine de trous mais je retiens l’eau. Qui suis-je ?', a: 'éponge' },
      { q: 'Plus je sèche, plus je deviens mouillée. Qui suis-je ?', a: 'serviette' },
      { q: 'Je monte et je descends sans jamais bouger. Qui suis-je ?', a: 'escalier' },
      { q: 'J’ai des dents mais je ne mords pas. Qui suis-je ?', a: 'peigne' },
      { q: 'On me prend avant de me donner. Qui suis-je ?', a: 'photo' },
    ],
  },
  {
    key: 'animaux', name: 'Animaux', emoji: '🦁',
    riddles: [
      { q: 'J’ai une crinière et je rugis dans la savane.', a: 'lion' },
      { q: 'Je saute et j’ai une poche sur le ventre.', a: 'kangourou' },
      { q: 'Je fais « coin-coin » au bord de l’eau.', a: 'canard' },
      { q: 'J’ai le cou le plus long de tous les animaux.', a: 'girafe' },
      { q: 'Je dors la tête en bas, accrochée au plafond.', a: 'chauve-souris' },
      { q: 'Je peux changer de couleur pour me camoufler.', a: 'caméléon' },
    ],
  },
  {
    key: 'objets', name: 'Objets du quotidien', emoji: '📦',
    riddles: [
      { q: 'J’ai une lame et un manche, je coupe.', a: 'couteau' },
      { q: 'Je sonne le matin pour te réveiller.', a: 'réveil' },
      { q: 'J’ai deux aiguilles mais je ne pique pas.', a: 'horloge' },
      { q: 'On me plie et me déplie pour se protéger de la pluie.', a: 'parapluie' },
      { q: 'J’ai des touches noires et blanches et je fais de la musique.', a: 'piano' },
      { q: 'Qui vole sans avoir d’ailes ?', a: 'temps' },
    ],
  },
  {
    key: 'nourriture', name: 'Nourriture', emoji: '🍕',
    riddles: [
      { q: 'Ronde, nappée de sauce tomate et de fromage, je viens d’Italie.', a: 'pizza' },
      { q: 'Jaune à l’extérieur, blanc à l’intérieur, on me casse le matin.', a: 'œuf' },
      { q: 'On me mange avec du lait dans un bol le matin.', a: 'céréales' },
      { q: 'Rouge, juteuse et pleine de petites graines.', a: 'fraise' },
      { q: 'Blanche, froide, servie en boule avec un cornet.', a: 'glace' },
      { q: 'Fruit rond du pommier, rouge ou verte.', a: 'pomme' },
    ],
  },
  {
    key: 'metiers', name: 'Métiers', emoji: '👷',
    riddles: [
      { q: 'Je soigne les malades à l’hôpital.', a: 'médecin' },
      { q: 'J’éteins les incendies avec un tuyau.', a: 'pompier' },
      { q: 'J’enseigne à l’école.', a: 'professeur' },
      { q: 'Je conduis un gros véhicule jaune.', a: 'chauffeur' },
      { q: 'Je pétris la pâte et je fais le pain.', a: 'boulanger' },
      { q: 'Je pilote des avions.', a: 'pilote' },
    ],
  },
];

const WORD_THEMES = [
  { key: 'animaux', name: 'Animaux', emoji: '🦁', words: ['chat', 'chien', 'lion', 'girafe', 'elephant', 'poisson', 'oiseau', 'cheval', 'vache', 'serpent'] },
  { key: 'objets', name: 'Objets', emoji: '📦', words: ['chaise', 'table', 'lampe', 'telephone', 'livre', 'horloge', 'miroir', 'valise', 'parapluie', 'cle'] },
  { key: 'nourriture', name: 'Nourriture', emoji: '🍕', words: ['pizza', 'gateau', 'pomme', 'pain', 'fromage', 'chocolat', 'glace', 'bonbon', 'banane', 'oeuf'] },
  { key: 'nature', name: 'Nature', emoji: '🌿', words: ['arbre', 'fleur', 'soleil', 'lune', 'etoile', 'nuage', 'pluie', 'montagne', 'riviere', 'mer'] },
  { key: 'sports', name: 'Sports', emoji: '⚽', words: ['ballon', 'raquette', 'ski', 'surf', 'arc', 'cible', 'gant', 'casque', 'luge', 'palmes'] },
  { key: 'transports', name: 'Transports', emoji: '🚗', words: ['voiture', 'avion', 'bateau', 'train', 'bus', 'moto', 'camion', 'helicoptere', 'fusee', 'velo'] },
  { key: 'maison', name: 'Maison', emoji: '🏠', words: ['maison', 'porte', 'fenetre', 'toit', 'cheminee', 'lit', 'armoire', 'escalier', 'cuisine', 'lavabo'] },
  { key: 'corps', name: 'Corps humain', emoji: '🖐️', words: ['tete', 'main', 'pied', 'oeil', 'nez', 'bouche', 'bras', 'jambe', 'coeur', 'doigt'] },
  { key: 'lieux', name: 'Lieux', emoji: '🏙️', words: ['ecole', 'hopital', 'plage', 'parc', 'cinema', 'musee', 'chateau', 'pont', 'gare', 'port'] },
  { key: 'metiers', name: 'Métiers', emoji: '👷', words: ['pompier', 'policier', 'boulanger', 'professeur', 'pilote', 'medecin', 'dentiste', 'veterinaire', 'chanteur', 'acteur'] },
  { key: 'espace', name: 'Espace', emoji: '🚀', words: ['planete', 'comete', 'astronaute', 'galaxie', 'satellite', 'soucoupe', 'mars', 'terre', 'venus', 'jupiter'] },
  { key: 'divers', name: 'Divers & fantastique', emoji: '🎭', words: ['arc-en-ciel', 'clown', 'fantome', 'dragon', 'licorne', 'sirene', 'robot', 'pirate', 'cowboy', 'sorciere'] },
];

const ALL_QUESTIONS = QUIZ_CATEGORIES.flatMap((c) => c.questions);
const ALL_RIDDLES = RIDDLE_PACKS.flatMap((p) => p.riddles);
const WORD_PACKS = WORD_THEMES.map((t) => ({ key: t.key, name: t.name, emoji: t.emoji, words: t.words }));

const clampInt = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

function buildCatalog() {
  const cat = [];
  const push = (type, emoji, title, desc, cfg) => cat.push({ id: `${type}#${cat.length}`, type, emoji, title, desc, cfg });

  for (const c of QUIZ_CATEGORIES) {
    for (const n of [5, 10]) {
      push('quiz', c.emoji, `Quiz ${c.name} · ${n} questions`, `QCM ${c.name}, ${n} questions, bonus de vitesse.`, { cat: c.key, mode: 'mcq', count: n });
    }
  }
  push('quiz', '🎲', 'Quiz libre (mix) · 10 questions', '10 questions tirées dans toutes les catégories.', { cat: 'all', mode: 'mcq', count: 10 });

  for (const p of RIDDLE_PACKS) {
    for (const n of [3, 6]) {
      push('quiz', p.emoji, `Devinettes ${p.name} · ${n}`, `Énigmes ${p.name}, réponse en texte libre.`, { cat: p.key, mode: 'text', count: n });
    }
  }

  for (const p of WORD_PACKS) {
    push('pendu', p.emoji, `Pendu ${p.name}`, `Mot du thème « ${p.name} », 6 vies communes.`, { pack: p.key, lives: 6 });
  }
  for (const p of WORD_PACKS) {
    push('draw', p.emoji, `Dessin ${p.name}`, `Dessine un mot du thème « ${p.name} », les autres devinent.`, { pack: p.key });
  }

  for (let w = 4; w <= 9; w++) {
    for (let h = 4; h <= 8; h++) {
      push('connect4', '🔴', `Puissance 4 · plateau ${w}×${h}`, `Duel 1v1 sur une grille ${w} colonnes × ${h} lignes.`, { w, h });
    }
  }

  const morpions = [
    { size: 3, win: 3, name: 'classique 3×3' },
    { size: 4, win: 4, name: '4×4, aligner 4' },
    { size: 5, win: 4, name: '5×5, aligner 4' },
    { size: 6, win: 4, name: '6×6, aligner 4' },
  ];
  for (const m of morpions) {
    push('morpion', '⭕', `Morpion ${m.name}`, `Grille ${m.size}×${m.size}, il faut aligner ${m.win} symboles.`, { size: m.size, win: m.win });
  }

  push('ultimate', '✕', 'Morpion XXL (ultimate)', '9 mini-grilles, ton coup envoie l’adversaire dans une grille précise.', {});

  for (const range of [10, 100, 1000, 10000]) {
    push('number', '🔢', `Chaud / Froid · 1 à ${range}`, `Trouve le nombre mystère entre 1 et ${range}, guidé par brûlant/glacé.`, { range });
  }

  for (const rounds of [3, 5, 10]) {
    for (const ms of [4000, 2500]) {
      push('reflex', '🎯', `Réflexe · ${rounds} manches (${ms / 1000}s)`, `Clique la cible dès qu’elle apparaît — ${rounds} manches.`, { rounds, targetMs: ms });
    }
  }

  for (const rounds of [3, 5, 7, 9, 11]) {
    push('rps', '✊', `Pierre-Feuille-Ciseaux · best of ${rounds}`, `Tout le monde choisit en même temps, ${rounds} manches.`, { rounds });
  }

  push('snake', '🐍', 'Snake rétro', 'Le serpent 8-bit : mange, grandis, ne te mords pas la queue. Sprint de 75 s, chacun joue sa partie, classement en direct.', { speed: 140, duration: 75 });
  push('snake', '🐍💨', 'Snake rétro turbo', 'Même serpent, mais plus rapide (60 s).', { speed: 90, duration: 60 });
  push('whack', '🐹', 'Tape la taupe', '30 s : tape la taupe dès qu’elle sort de son trou (tactile, parfait sur mobile).', { duration: 30 });
  push('whack', '🐹⏱️', 'Tape la taupe marathon', '60 s de taupe non stop.', { duration: 60 });
  push('memory', '🃏', 'Memory 4×4 rétro', '8 paires d’émojis à retrouver au doigt.', { cols: 4, rows: 4 });
  push('memory', '🃏🧠', 'Memory 5×4 rétro', '10 paires d’émojis.', { cols: 5, rows: 4 });
  push('breakout', '🧱', 'Casse-briques rétro', 'Déplace la raquette au doigt, casse toutes les briques. 3 vies.', { lives: 3, speed: 1 });
  push('breakout', '🧱🔥', 'Casse-briques hardcore', 'Briques + rapides, 3 vies, plus de points.', { lives: 3, speed: 1.6 });
  push('simon', '🎨', 'Simon rétro', 'Répète la séquence de couleurs qui grandit à chaque tour. Le cerveau en feu.', {});

  push('flappy', '🐤', 'Flappy NES', 'Tape pour faire voler l’oiseau entre les tuyaux. 60 s de survie.', { duration: 60 });
  push('flappy', '🐤🔥', 'Flappy NES hardcore', 'Tuyaux plus serrés et plus rapides.', { duration: 45, gap: 110, speedMul: 1.5 });
  push('invaders', '👾', 'Space Invaders NES', 'Déplace le canon (◀ ▶) et tire (🔥) sur la flotte alien.', {});
  push('invaders', '👾🔥', 'Invaders NES arcade', 'Aliens plus rapides, vagues infinies.', { speedMul: 1.7 });
  push('duckhunt', '🦆', 'Duck Hunt NES · 30 s', 'Tape les canards qui traversent l’écran !', { duration: 30 });
  push('duckhunt', '🦆⏱️', 'Duck Hunt NES · 60 s', '60 s de chasse au canard.', { duration: 60 });
  push('pong', '🏓', 'Pong NES vs IA · 5 pts', 'Glisse le doigt pour déplacer ta raquette, premier à 5 points.', { target: 5 });
  push('pong', '🏓🏆', 'Pong NES vs IA · 11 pts', 'Le marathon pong : premier à 11 points.', { target: 11 });

  return cat;
}

const CATALOG = buildCatalog();

module.exports = { CATALOG, QUIZ_CATEGORIES, RIDDLE_PACKS, WORD_PACKS, ALL_QUESTIONS, ALL_RIDDLES };
