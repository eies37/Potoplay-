# 🕹️ Salon Arcade

Salon privé de **mini-jeux multijoueur en temps réel**, style « salon de jeux chill » (façon Plato / arcade moderne).

- **Zéro dépendance** : Node.js pur (>= 18) pour le serveur, HTML/CSS/JS vanilla pour le front.
- **Temps réel** via Server-Sent Events (SSE) + requêtes POST — pas de WebSocket à configurer.

## 🎮 Jouer à plusieurs (téléphone + amis)

Le plus simple, sur **ton Wi-Fi** (aucune exposition publique nécessaire) :

```bash
npm start   # (déjà sur 0.0.0.0:8080)
```

Le démarrage affiche les URL disponibles, ex. `http://192.168.1.23:8080`.

1. **Sur ton ordi** : ouvre cette URL, crée un salon → le code à 4 chiffres s'affiche.
2. **Bouton « 🔗 lien d'invitation »** dans le salon : copie `http://192.168.1.23:8080/?room=1234` → envoie ce lien à tes amis (même Wi-Fi).
3. **Sur chaque téléphone** : ouvre le lien → le code est pré-rempli → pseudo → « Rejoindre ». Puis menu Chrome ⋮ → « Ajouter à l'écran d'accueil » pour une icône plein écran (PWA).
4. L'hôte 👑 lance n'importe lequel des 118 jeux ; tout le monde joue en même temps (party games, rétro avec classement en direct) ou en duel 1v1 + spectateurs.

> Pour jouer par **Internet** (amis hors Wi-Fi) : héberge sur ton propre serveur/VPS avec HTTPS (reverse proxy) — ne rends jamais le serveur public sans ajouter une authentification (le code à 4 chiffres seul est un secret faible).

## Lancer

```bash
npm start          # écoute sur 0.0.0.0:8080 → http://<IP-de-la-machine>:8080
HOST=127.0.0.1 npm start   # mode local seul : http://127.0.0.1:8080 uniquement
```

## Tester

```bash
npm test           # test de bout en bout : 2 joueurs simulés (salon, chat, les 3 jeux)
```

## Fonctionnalités

- **Salon privé** avec code de partage à 4 chiffres (copier en un clic), hôte désigné 👑, liste des joueurs avec statut de connexion, scores ⭐ et **🏆 records du salon** par jeu.
- **Chat intégré** avec barre d'émojis rapides (les messages 100 % émoji flottent à l'écran 🎉).
- **118 mini-jeux** dans un catalogue filtrable/recherchable, chacun avec sa **couverte SVG générée** (`/api/cover/<id>`) :
  - 🧠 **Quiz & devinettes** — 8 catégories de QCM (80 questions) + 5 packs d'énigmes en texte libre, en 5/10 questions.
  - 🔤 **Pendu** — 12 packs thématiques (120 mots), vies communes.
  - 🎨 **Dessin & Devinettes** — 12 packs de mots à dessiner, canvas partagé en direct.
  - 🔴 **Puissance 4** — 30 plateaux (4–9 × 4–8), duel 1v1 + spectateurs.
  - ⭕ **Morpion** — 3×3 à 6×6 — et ✕ **Morpion XXL** (ultimate).
  - 🎯 **Réflexe** (clic le plus rapide), 🔢 **Chaud/Froid** (1 à 10 → 10 000), ✊ **Pierre-Feuille-Ciseaux** (best of 3 à 11, tout le monde joue).
  - 🕹️ **Rétro / NES, 100 % tactiles (Android)** — chacun a sa propre partie en parallèle avec **classement en direct** : 🐍 Snake (swipe + croix directionnelle), 🐹 Tape-la-taupe, 🃏 Memory, 🧱 Casse-briques (glisser le doigt), 🎨 Simon, 🐤 Flappy, 👾 Space Invaders, 🦆 Duck Hunt, 🏓 Pong vs IA.
- **Design** : mode sombre néon, animations fluides, cadre « scanlines » phosphore vert pour les jeux rétro, responsive mobile (chat en panneau coulissant, contrôles tactiles) / desktop.
- Reconnexion automatique (session en `localStorage`), salons nettoyés après 2 h d'inactivité.

## 📦 APK précompilé (prêt à installer)

Un APK debug-signé est déjà construit et livré dans le dépôt : **[build/Potoplay.apk](build/Potoplay.apk)**
(téléchargement direct : `https://raw.githubusercontent.com/eies37/Potoplay-/vibe/salon-arcade-2e129d/build/Potoplay.apk`)

- Package `fr.potoplay.app` v1.0 — icône « Potoplay » — portrait — ARM (arm64-v8a + armeabi-v7a), minSdk 21 / targetSdk 34
- Construit avec Godot 4.3 (template `android_release.apk` officiel + `assets/game.pck` du lanceur `godot/`), signé debug (CN=Android Debug)
- **Installation** : autorise « sources inconnues » sur Android → ouvre le fichier APK → Installer → lance « Potoplay » → entre l'URL du serveur (`http://<IP>:8080`) → ▶ JOUER
- Pour le Play Store : re-signe avec ta clé release (voir section Godot ci-dessous)

## 🎮 APK via Godot (projet prêt à exporter)

Le dossier **`godot/`** contient un projet Godot 4 minimal (lanceur « Potoplay ») : un écran pour saisir l'URL du serveur (même Wi-Fi/hotspot) puis l'ouvrir. **Je ne peux pas compiler l'APK dans le bac à sable** (pas de Godot/SDK Android/réseau), donc l'export se fait sur **ton PC** en ~10 min :

1. Installe **Godot 4.x** (Standard, version Android) + **Android SDK** (cmdline-tools via Android Studio) + JDK 17.
2. Dans Godot : *Project → Export → Add → Android*. Laisse Godot générer un **debug keystore** (ou mets le tien pour le Play Store).
3. Ouvre le dossier `godot/` du dépôt cloné, vérifie la scène `main.tscn`, puis **Export Project → APK**.
4. Installe l'APK sur le téléphone (`adb install` ou transfert du fichier), lance-le, entre l'URL du serveur (`http://<IP>:8080`) → « ▶ JOUER ».
5. Pour une WebView **intégrée** (sans ouvrir Chrome) : ajoute un plugin WebView depuis l'AssetLib (ex. « WebView » pour Android) et remplace `OS.shell_open(url)` dans `godot/main.gd` par `webview.load_url(url)`.

> Le serveur doit tourner sur un appareil du même réseau (voir section « Jouer à plusieurs »). L'APK ouvre l'app web par son URL — aucune donnée n'est embarquée.

## 📱 PWA & APK (Android)

L'app est une **PWA installable** : manifest + service worker + icônes PNG générées (`tools/make-icons.js`).

- **Sur Android (Chrome)** : ouvre l'URL du serveur → menu ⋮ → **« Ajouter à l'écran d'accueil »** → l'app s'installe avec son icône, en plein écran, et le shell fonctionne hors-ligne (les parties temps réel passent toujours par `/api/`, non mises en cache).
- **Vrai fichier .apk** : non produit ici (pas de SDK Android dans le bac à sable, et un APK exige une clé de signature). Sur ta machine : Android Studio → *New Project → « Trusted Web Activity »* → URL de ton serveur privé → build signé → `.apk` installable. Alternative : Capacitor (`npx cap add android`) si tu préfères un wrapper natif.

## Architecture

```
server.js          Serveur HTTP : statiques + /api/action (POST) + /api/stream (SSE) + /api/catalog + /api/cover/:id
content.js         Banque de contenu (80 questions, 30 énigmes, 120 mots) + génération du catalogue (118 jeux)
covers.js          Générateur de couvertures SVG par jeu
games.js           18 moteurs de jeu (quiz, pendu, dessin, plateaux, réflexe, PFC, rétro NES…) + sérialisation publique par joueur
public/index.html  Structure des écrans (accueil, salon, partie, chat)
public/style.css   Thème sombre néon + UI rétro, responsive mobile/desktop
public/app.js      Client : SSE, catalogue avec couvertures, toutes les vues de jeu, chat
test/smoke.js      Test d'intégration bout en bout (2 clients simulés, 76 assertions)
```

## Protocole (résumé)

| Action | Description |
| --- | --- |
| `create` / `join` / `reconnect` | Gérer la session (retourne `room` + `token`) |
| `chat` | Envoyer un message |
| `startGame` / `endGame` | Hôte uniquement |
| `game` | Action de jeu (`answer`, `drop`, `rematch`, `stroke`, `clear`, `guess`) |
| `leave` | Quitter le salon |

Côté client, l'état complet du salon arrive en événement SSE `state` ; `chat`, `stroke`, `secret` (mot à dessiner), `tick` (minuteur) et `toast` sont des événements éphémères.

## Variables d'environnement

`HOST` (0.0.0.0 par défaut ; `127.0.0.1` pour local seul), `PORT` (8080), `HOST` (127.0.0.1), `TICK_MS`, `QUIZ_SECONDS`, `REVEAL_MS`, `DRAW_SECONDS`, `ROUND_REVEAL_MS`, `RPS_CHOOSE_MS`. Les variantes de jeux se règlent via le `cfg` de chaque entrée du catalogue (taille de plateau, vies, durée, vitesse…).

> ⚠️ Par défaut le serveur écoute sur `0.0.0.0` (toutes les interfaces) pour faciliter le jeu en LAN/hotspot : **réservé à un réseau privé** (Wi-Fi perso, hotspot perso). Pour du local seul : `HOST=127.0.0.1`. Ne jamais exposer publiquement sans ajouter une authentification.
