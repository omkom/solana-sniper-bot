# Solana Memecoin Sniper Bot

## Vue d'ensemble
Bot de sniping haute performance pour les memecoins Solana, optimisé pour pump.fun avec un focus sur le ROI maximal.

## Objectifs principaux
- Détection ultra-rapide des nouveaux tokens (< 30 secondes)
- Automatisation complète des achats/ventes
- Gestion intelligente du risque
- ROI maximal avec protection du capital

## Fonctionnalités clés

### 1. Détection rapide
- Monitoring en temps réel des nouvelles créations sur pump.fun
- WebSocket pour les événements on-chain
- Détection < 10 secondes après création

### 2. Modes d'opération
- **DRY RUN** (défaut) : Simulation avec prix réels
- **LIVE** : Trading réel
- **LOG** : Mode verbeux pour debug

### 3. Gestion du capital
- Investissement : 0.02-0.05 SOL par position
- Maximum 20-30 positions simultanées
- Stop loss : -20% automatique

### 4. Stratégie de sortie
- Vente par paliers progressifs
- Protection des gains avec trailing stop
- Sécurisation à 90% sur gros ROI

## Structure du projet
```
solana-sniper-bot/
├── src/
│   ├── core/           # Logique métier
│   ├── trading/        # Moteur de trading
│   ├── detection/      # Système de détection
│   ├── filters/        # Filtres de sécurité
│   ├── wallet/         # Gestion wallet
│   └── monitoring/     # Logs et stats
├── config/
├── tests/
└── docs/
```

## Prérequis techniques
- Node.js 18+
- RPC Solana performant (Helius/Triton)
- Wallet avec SOL pour trading
- Variables d'environnement configurées

## Démarrage rapide
```bash
# Installation
npm install

# Configuration
cp .env.example .env
# Éditer .env avec vos paramètres

# Mode dry run
npm run start:dry

# Mode live (attention!)
npm run start:live
```

## Métriques de performance
- Temps de détection moyen
- ROI global et par trade
- Taux de réussite
- Positions actives/fermées

## Sécurité
- Clés privées jamais exposées
- Validation de tous les contracts
- Limites de position strictes
- Stop loss automatique