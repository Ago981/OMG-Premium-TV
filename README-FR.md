# 📺 OMG Premium TV pour Stremio

***[🇮🇹 Leggi in italiano](README.md)*** - ***[🇬🇧 Read in English](README-EN.md)*** - ***[🇫🇷 Lire en Français](README-FR.md)*** - ***[🇪🇸 Leer en español](README-ES.md)***

> 🚀 **Version 8.0.0** : réécrite en TypeScript/TSX. Chaque configuration est enregistrée sur le serveur avec un **ID et un mot de passe** et s'installe avec une URL simple `https://votre-domaine/c/<ID>/manifest.json`. Panneau d'administration sur `/admin`, assistant par étapes, guides EPG prédéfinis par pays, prise en charge d'**EasyProxy** et MediaFlow, compatibilité **Nuvio** et Cloudflare. **PostgreSQL requis.** Voir [docs/DEPLOY.md](docs/DEPLOY.md) (en italien).

## 👋 Introduction

Bienvenue dans OMG Premium TV, l'addon pour Stremio qui vous permet de regarder vos chaînes TV et IPTV préférées à partir de playlists M3U/M3U8, enrichies d'informations sur les programmes (EPG). Ce guide vous aidera à tirer le meilleur parti de toutes les fonctionnalités disponibles.

<img width="1440" alt="Screenshot 2025-02-28 alle 21 36 52" src="https://github.com/user-attachments/assets/c85b2a33-0174-4cb3-b7a9-2cc2140c8c0f" />

### ⚠️ Lisez attentivement !

Travailler sur cet addon, le maintenir à jour a coûté beaucoup d'heures et beaucoup d'engagement ❤️
Un café ☕ ou une bière 🍺 sont un geste de reconnaissance très apprécié et m'aident à continuer et à maintenir ce projet actif !

**Avec un don, vous serez ajouté à un groupe Telegram dédié où vous recevrez en avant-première les nouvelles versions ! Je vous attends !**

<a href="https://www.buymeacoffee.com/mccoy88f"><img src="https://img.buymeacoffee.com/button-api/?text=Offrez-moi une bière&emoji=🍺&slug=mccoy88f&button_colour=FFDD00&font_colour=000000&font_family=Bree&outline_colour=000000&coffee_colour=ffffff" /></a>

[Vous pouvez aussi m'offrir une bière avec PayPal 🍻](https://paypal.me/mccoy88f?country.x=FR&locale.x=fr_FR)




## 🔄 Changelog de OMG Premium TV

### 🚀 Version 7.0.0 (Actuelle)

### ✨ Nouvelles fonctionnalités
- **🔒 Protection par mot de passe de la home** : Option dans l’interface web pour protéger l’accès à la page de configuration par un mot de passe. Si activée, toute personne ouvrant la home (ou le lien « Configurer » depuis Stremio) doit saisir le mot de passe ; l’utilisation de l’addon depuis Stremio ne demande pas de mot de passe.
- **🔄 Sessions et cache isolé** : Le cache est isolé automatiquement par configuration (même config = même cache). L'EPG, le Résolveur Python et le Générateur de playlist sont aussi par session. Plusieurs utilisateurs ou configurations différentes peuvent utiliser le serveur en même temps sans s’écraser mutuellement.

- **🆔 ID de session** : L'**ID de session** (dérivé de la configuration) est affiché sur la page home/config lorsque vous générez une configuration. L'ID est inclus dans la sauvegarde (export) et mis à jour à la restauration (import).
- **⏰ Expiration des sessions (24h)** : Si une session ne reçoit aucune requête pendant **24 heures**, elle expire automatiquement : tout le cache de cette session (cache M3U, EPG, résolveur, générateur) est supprimé. À la prochaine requête avec la même config, la session est recréée et les données sont rechargées depuis les URL.

### 🔧 Améliorations
- **🌐 Interface en 4 langues** : L'interface web est disponible en italien, anglais, espagnol et français ; vous pouvez changer de langue depuis la barre en haut à droite.
- **📋 Listes prédéfinies (optionnel)** : Sur la page de configuration, une section permet d'ajouter en un clic les playlist et EPG prédéfinis iptv-org et iptv-epg.org par pays (champs M3U et EPG).
- **⚙️ Section Paramètres** : Le catalogue a un filtre genre **⚙️** qui regroupe les canaux utilitaires : **Refresh M3U playlist**, **Refresh EPG**, **Rigenera Playlist Python**. Descriptions et messages en anglais.
- **🔄 Pseudo-canaux** : Ouvrir un canal de la section ⚙️ exécute l’action (rechargement playlist, mise à jour EPG ou régénération Python) et affiche un message de résultat ; pas de flux vidéo réel.
- **♻️ Cache au redémarrage** : Si le cache est vide (ex. après redémarrage Docker), la playlist et l’EPG sont reconstruits à la première requête quand les URL M3U/EPG sont configurées.
- **📺 EPG et ID canaux** : Meilleure correspondance EPG pour les canaux avec suffixe (ex. `canale5.it` / `canale5`).
- **🔒 Interface protection home** : Quand la protection est active, la case et le bouton « Modifica password » (Modifier le mot de passe) sont visibles ; les champs mot de passe et confirmation n’apparaissent qu’en cliquant dessus.
- **🔗 Retour après connexion** : Après avoir saisi le mot de passe sur la page d’accès, vous êtes renvoyé à la page d’origine (ex. page de configuration avec URL encodée).

### 🚀 Version 6.0.0

### 📢 Changement de nom
- **📜 OMG+ devient OMG Premium** : Nouveau nom pour différencier et valoriser toutes les nouvelles fonctions disponibles. OMG TV reste comme version de base avec des chaînes prédéfinies. Elle ne sera plus mise à jour.

### ✨ Nouvelles fonctionnalités
- **🐍 Résolveur Python** : Système complet pour résoudre les URL de streaming via des scripts Python personnalisables
- **🔄 Canal de régénération** : Nouveau canal dans la catégorie ~SETTINGS~ pour régénérer la playlist sans accéder au panneau web
- **🛠️ Sauvegarde et restauration** : Système pour sauvegarder et restaurer la configuration complète
- **🔧 Template résolveur** : Fonctionnalité pour créer automatiquement des templates de scripts résolveurs personnalisables
- **👤 User-Agent avancé** : Gestion améliorée des headers User-Agent, Referer et Origin
- **🧩 Modules Python** : Support intégré pour request et autres modules Python pour scripts avancés

### 🔧 Améliorations
- **🐳 Support Docker amélioré** : Configurations optimisées pour Hugging Face et Portainer
- **♻️ Cache intelligent** : Système de cache complètement repensé avec des performances améliorées
- **🔄 Mise à jour planifiée** : Contrôle précis de l'intervalle de mise à jour au format HH:MM
- **📋 Interface web renouvelée** : Panneau de configuration plus intuitif et riche en fonctionnalités
- **⚡ Streaming optimisé** : Meilleure gestion du fallback entre proxy et streams directs
- **🛡️ Gestion des erreurs robuste** : Système amélioré de gestion des erreurs et tentatives multiples

### 🐛 Corrections
- **🔄 Résolution de la boucle infinie** : Correction du problème de boucle infinie avec résolveur et proxy actifs
- **🔌 Compatibilité améliorée** : Résolution des problèmes de compatibilité avec différents types de playlists
- **🧰 Correction des headers HTTP** : Correction de la gestion des headers HTTP personnalisés
- **🔍 Correction de la recherche de chaînes** : Amélioration de la recherche des chaînes par correspondance partielle
- **📊 Optimisation EPG** : Résolution des problèmes avec les EPG de grande taille

## 📝 Notes de mise à jour
- Les configurations précédentes NE SONT PAS compatibles avec les installations de OMG TV et OMG+ TV.
- Il est recommandé d'effectuer une nouvelle installation à partir de zéro sur Hugging Face ou sur VPS (Portainer recommandé)
- Pour profiter des fonctionnalités du résolveur Python, il est nécessaire de le configurer dans la section avancée

Pour des détails complets sur le fonctionnement des nouvelles fonctionnalités, consultez le manuel utilisateur mis à jour.

## 🚀 Commençons : Installation

### 🐳 Déploiement sur DOCKER
- Pour pouvoir procéder, vous devez d'abord faire l'installation via docker sur Hugging Face ou sur VPS.
- [Suivez le guide ici](docker-install-fr.md) puis revenez à cette page une fois le site web de votre addon disponible.
- Si toutes ces choses vous semblent incompréhensibles, ARRÊTEZ ; cherchez un guide en ligne sur docker, regardez la section support en bas de cette page ou demandez de l'aide à une IA 😊

### 📲 Installation de l'addon
1. Ouvrez la page web de configuration OMG Premium TV
2. Configurez l'addon selon vos besoins
3. Cliquez sur le bouton **INSTALLER SUR STREMIO** 🔘
4. Stremio s'ouvrira automatiquement et vous demandera de confirmer l'installation
5. Cliquez sur **Installer** ✅

## ⚙️ Configuration de base

### 📋 Configuration de la playlist
- **URL M3U** 📋 : Entrez l'URL de votre playlist M3U/M3U8
  - *Exemple unique* : `http://example.com/playlist.m3u`
  - *Exemple multiple* : `http://example.com/playlist1.m3u,http://example.com/playlist2.m3u`
  - 💡 **Nouveauté** : Vous pouvez entrer plusieurs URL M3U séparées par des virgules (,) pour combiner plusieurs playlists

### 📊 Configuration EPG
- **URL EPG** 📊 : Entrez l'URL du fichier EPG (guide électronique des programmes)
  - *Exemple unique* : `http://example.com/epg.xml` ou `http://example.com/epg.xml.gz`
  - *Exemple multiple* : `http://example.com/epg1.xml,http://example.com/epg2.xml`
  - �� **Nouveauté** : Vous pouvez entrer plusieurs URL EPG séparées par des virgules (,) pour combiner plusieurs guides de programmes
- **Activer EPG** ✅ : Cochez cette case pour afficher les informations sur les programmes

## 🔍 Utilisation de l'addon

### 📱 Navigation dans le catalogue
1. Ouvrez Stremio
2. Allez à la section **Découvrir** 🔍
3. Sélectionnez **Chaînes TV** puis **OMG Premium TV** dans la liste des addons
4. Vous verrez la liste complète des chaînes disponibles

### 🎯 Filtrage des chaînes
- **Par genre** 🏷️ : Sélectionnez un genre dans le menu déroulant pour filtrer les chaînes
- **Recherche** 🔍 : Utilisez la fonction de recherche pour trouver des chaînes spécifiques par nom

### 🎬 Visualisation des détails de la chaîne
Cliquez sur une chaîne pour voir :
- 📋 Informations sur la chaîne
- 📺 Programme actuellement diffusé (si EPG activé)
- 🕒 Prochains programmes (si EPG activé)
- 🏷️ Catégories de la chaîne

### ▶️ Lecture d'une chaîne
- Cliquez sur la chaîne puis sur le bouton **WATCH** ▶️
- Choisissez parmi les options de stream disponibles :
  - 📺 **Stream Original** : Le stream standard de la playlist
  - 🌐 **Stream Proxy** : Le stream à travers un proxy (meilleure compatibilité)
  - 🧩 **Stream Résolu** : Le stream traité par un script résolveur (pour les chaînes spéciales)

## 🛠️ Paramètres avancés

### 🔒 Protéger l'accès à la home
- **Activer la protection par mot de passe** ✅ : Si activée, la prochaine visite sur la page de configuration (home ou lien « Configurer » depuis Stremio) demandera le mot de passe. L’addon dans Stremio continue de fonctionner sans mot de passe.
- **Modifier le mot de passe** : Quand la protection est active, vous voyez « Protezione attiva » et le bouton **Modifica password** ; en cliquant, les champs pour changer le mot de passe s’affichent. Pour désactiver, décochez et enregistrez (sans saisir de mot de passe).
- Le mot de passe se définit et se modifie uniquement depuis l’interface web ; il n’est pas demandé pour regarder les chaînes dans Stremio.

### 🌐 Configuration du proxy
- **URL Proxy** 🔗 : URL du proxy pour les streams (compatible uniquement avec [MediaFlow Proxy](https://github.com/mhdzumair/mediaflow-proxy))
- **Mot de passe Proxy** 🔑 : Mot de passe pour l'authentification du proxy
- **Forcer Proxy** ✅ : Oblige tous les streams à utiliser le proxy

### 🆔 Gestion des ID et mises à jour
- **Suffixe ID** 🏷️ : Ajoute un suffixe aux ID des chaînes sans id dans la playlist (ex. `.fr`)
- **Chemin du fichier remapper** 📝 : Spécifie un fichier pour le remappage des ID EPG
- **Intervalle de mise à jour** ⏱️ : Spécifie la fréquence de mise à jour de la playlist (format `HH:MM`)

## 🐍 Fonctionnalités Python avancées

### 🔄 Génération de playlist avec script Python
1. **URL du script Python** 🔗 : Entrez l'URL du script Python
2. **TÉLÉCHARGER SCRIPT** 💾 : Téléchargez le script sur le serveur
3. **EXÉCUTER SCRIPT** ▶️ : Exécutez le script pour générer la playlist
4. **UTILISER CETTE PLAYLIST** ✅ : Utilisez la playlist générée comme source

### ⏱️ Mise à jour automatique
- Entrez l'intervalle souhaité (ex. `12:00` pour 12 heures)
- Cliquez sur **PLANIFIER** 📅 pour activer les mises à jour automatiques
- Cliquez sur **ARRÊTER** ⏹️ pour désactiver les mises à jour

### 🧩 Configuration du Résolveur Python
- **URL Script Résolveur** 🔗 : Entrez l'URL du script résolveur
- **Activer Résolveur Python** ✅ : Activez l'utilisation du résolveur
- **TÉLÉCHARGER SCRIPT** 💾 : Téléchargez le script résolveur
- **CRÉER TEMPLATE** 📋 : Créez un template de script résolveur à personnaliser
- **VÉRIFIER SCRIPT** ✅ : Vérifiez que le script résolveur fonctionne correctement
- **VIDER CACHE** 🧹 : Videz le cache du résolveur

## 💾 Sauvegarde et restauration

### 📤 Sauvegarde de la configuration
1. Cliquez sur **SAUVEGARDER CONFIGURATION** 💾
2. Un fichier JSON sera téléchargé avec tous vos paramètres (y compris l'**ID de session** de la config actuelle)

### 📥 Restauration de la configuration
1. Cliquez sur **RESTAURER CONFIGURATION** 📤
2. Sélectionnez le fichier JSON précédemment sauvegardé
3. Attendez la fin de la restauration (l'ID de session affiché sur la page se met à jour selon la config restaurée)

## ❓ Résolution des problèmes

### ⚠️ Streams qui ne fonctionnent pas
- Essayez d'activer l'option **Forcer Proxy** ✅
- Vérifiez que l'URL de la playlist est correcte
- Essayez d'utiliser un script résolveur Python pour les chaînes problématiques

### 📊 Problèmes avec EPG
- Vérifiez que l'URL de l'EPG est correcte
- Vérifiez que l'option **Activer EPG** ✅ est activée
- Assurez-vous que les ID des chaînes correspondent entre la playlist et l'EPG

### 🐍 Problèmes avec les scripts Python
- Vérifiez que Python est installé sur le serveur de l'addon
- Vérifiez l'état du script dans la section **État Script Python**
- Essayez de télécharger à nouveau le script

## 🔄 Mises à jour et maintenance

### 🔄 Modification des paramètres
- Dans Stremio, allez dans **Paramètres** ⚙️ > **Addon**
- Cliquez sur **Configurer** 🔄 à côté de OMG Premium TV
- Accédez à la page de configuration, faites les modifications qui vous intéressent
- Appuyez sur **Générer Configuration**
- Pour éviter un doublon, supprimez l'addon sur Stremio
- Retournez à la page de configuration et cliquez sur **Installer sur Stremio**

### 🔧 Régénération de la playlist et mises à jour rapides
- Dans la section **⚙️** (filtre par genre du catalogue) : **Refresh M3U playlist** (recharger depuis la source), **Refresh EPG** (mettre à jour la guide), **Rigenera Playlist Python** (exécuter le script et recharger). Ouvrez le canal et suivez le message à l’écran.

## 📋 Résumé des fonctionnalités principales

- ✅ Support des playlists M3U/M3U8
- ✅ Support des guides de programmes EPG (XMLTV)
- ✅ Filtres par genre et recherche
- ✅ Proxy pour une meilleure compatibilité
- ✅ Résolveur Python pour les streams spéciaux
- ✅ Génération de playlists personnalisées
- ✅ Mises à jour automatiques
- ✅ Sauvegarde et restauration de la configuration
- ✅ Protection par mot de passe de la page de configuration (optionnelle)
- ✅ Cache isolée par configuration (accès simultanés)
- ✅ ID de session visible et inclus dans l'export/import
- ✅ Expiration automatique des sessions inactives (24h) pour libérer de l'espace
- Spécifications techniques dans le [wiki](https://github.com/mccoy88f/OMG-Premium-TV/wiki/Tech-Spec-%E2%80%90-Specifiche-Teniche)

## 📱 Compatibilité

OMG PremTV fonctionne sur toutes les plateformes supportées par Stremio :
- 💻 Windows
- 🍎 macOS
- 🐧 Linux
- 📱 Android
- 📱 iOS (via navigateur web)
- 📺 Android TV
- 📺 Apple TV

## 👥 Communauté
- Si vous cherchez du support, des guides ou des informations sur le monde OMG, MediaFlow Proxy et Stremio, vous pouvez visiter :
- [Reddit (Team Stremio Italia)](https://www.reddit.com/r/Stremio_Italia/)
- [Groupe Telegram](http:/t.me/Stremio_ITA)

## 👏 Remerciements
- FuriousCat pour l'idée du nom OMG
- L'équipe de Stremio Italia
- Communauté Telegram (voir section Communauté)
- Iconic Panda pour l'[icône](https://www.flaticon.com/free-icon/tv_18223703?term=tv&page=1&position=2&origin=tag&related_id=18223703)
- [Vidéo d'arrière-plan](https://it.vecteezy.com/video/1803236-no-signal-bad-tv) du frontend et pour les flux factices créée par igor.h (sur Vecteezy)

## 📜 Licence
Projet publié sous licence MIT.


---

📚 **Note importante** : OMG Premium TV est conçu pour accéder à des contenus légaux. Aucune chaîne ou flux n'est inclus dans l'addon. Assurez-vous de respecter la réglementation de votre pays concernant le streaming de contenus.

🌟 Merci d'avoir choisi OMG Premium TV ! Bon visionnage ! 🌟
