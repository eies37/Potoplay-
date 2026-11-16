# 🕹️ Salon Arcade

Salon privé de **mini-jeux multijoueur en temps réel**, style « salon de jeux chill » (façon Plato / arcade moderne).

- **Zéro dépendance** : Node.js pur (>= 18) pour le serveur, HTML/CSS/JS vanilla pour le front.
- **Temps réel** via Server-Sent Events (SSE) + requêtes POST — pas de WebSocket à configurer.

## Lancer

```bash
npm start          # puis ouvrir http://127.0.0.1:3000
# ou : PORT=8080 HOST=0.0.0.0 node server.js   (HOST=0.0.0.0 uniquement sur ton propre réseau privé)
```

## Tester

```bash
npm test           # test de bout en bout : 2 joueurs simulés (salon, chat, les 3 jeux)
```

## Fonctionnalités

- **Salon privé** avec code de partage à 4 chiffres (copier en un clic), hôte désigné 👑, liste des joueurs avec statut de connexion et scores ⭐.
- **Chat intégré** avec barre d'émojis rapides (les messages 100 % émoji flottent à l'écran 🎉).
- **3 mini-jeux** :
  - 🎨 **Dessin & Devinettes** — un joueur dessine sur un canvas partagé en direct, les autres proposent des mots ; points selon la rapidité.
  - 🔴 **Puissance 4** — duel 1v1, détection de victoire, revanche en un clic.
  - ⚡ **Quiz éclair** — 5 questions, tout le monde répond en même temps, bonus de vitesse.
- **Design** : mode sombre néon, animations fluides, responsive mobile (chat en panneau coulissant) / desktop.
- Reconnexion automatique (session en `localStorage`), salons nettoyés après 2 h d'inactivité.

## Architecture

```
server.js          Serveur HTTP : fichiers statiques + /api/action (POST) + /api/stream (SSE)
games.js           Machines à états des 3 jeux (quiz, Puissance 4, dessin) + sérialisation publique
public/index.html  Structure des écrans (accueil, salon, partie, chat)
public/style.css   Thème sombre néon, responsive
public/app.js      Client : SSE, rendu des états, canvas de dessin, chat
test/smoke.js      Test d'intégration bout en bout (2 clients simulés)
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

`PORT` (3000), `HOST` (127.0.0.1), `TICK_MS`, `QUIZ_SECONDS`, `REVEAL_MS`, `DRAW_SECONDS`, `ROUND_REVEAL_MS`, `QUIZ_COUNT`.

> ⚠️ Par défaut le serveur écoute sur `127.0.0.1` (loopback). Pour jouer à plusieurs depuis des machines différentes, héberge-le sur ton propre serveur privé (VPN, LAN, VPS perso) — ne l'expose pas publiquement sans ajouter une authentification.
