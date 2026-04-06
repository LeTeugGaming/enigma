# 🧩 Énigma - Guide de Déploiement

## Structure des dossiers

```
deploy/
├── frontend-web/     # Build web statique (pour Vercel/Netlify)
└── backend/          # API FastAPI (pour Railway/Render/Heroku)
```

---

## 🌐 Déployer le Frontend (Web)

### Option 1: Vercel (Recommandé)

1. Allez sur https://vercel.com
2. Connectez votre compte GitHub
3. Importez votre repo
4. Configurez:
   - **Framework Preset**: Other
   - **Root Directory**: `deploy/frontend-web`
   - **Build Command**: (laisser vide, déjà buildé)
   - **Output Directory**: `.`
5. Cliquez sur "Deploy"

### Option 2: Netlify

1. Allez sur https://netlify.com
2. "Add new site" > "Deploy manually"
3. Glissez-déposez le dossier `frontend-web`
4. C'est déployé !

### Option 3: GitHub Pages

1. Activez GitHub Pages dans les settings de votre repo
2. Sélectionnez la branche et le dossier `/deploy/frontend-web`

---

## ⚙️ Déployer le Backend (API)

### Option 1: Railway (Recommandé)

1. Allez sur https://railway.app
2. "New Project" > "Deploy from GitHub"
3. Sélectionnez votre repo
4. Configurez:
   - **Root Directory**: `deploy/backend`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Ajoutez les variables d'environnement:
   ```
   MONGO_URL=mongodb+srv://...votre_url_mongodb_atlas...
   JWT_SECRET=votre_secret_jwt_super_long
   EMERGENT_LLM_KEY=sk-emergent-...votre_cle...
   DB_NAME=enigma_app
   ```

### Option 2: Render

1. Allez sur https://render.com
2. "New" > "Web Service"
3. Connectez votre repo GitHub
4. Configurez:
   - **Root Directory**: `deploy/backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Ajoutez les variables d'environnement (voir ci-dessus)

---

## 🔗 Connecter Frontend et Backend

**IMPORTANT**: Une fois le backend déployé, mettez à jour l'URL dans le frontend:

1. Obtenez l'URL de votre backend déployé (ex: `https://enigma-api.railway.app`)
2. Modifiez le fichier `frontend-web/_expo/static/js/web/entry-*.js`
3. Recherchez l'ancienne URL et remplacez par la nouvelle

**OU** avant de builder, modifiez `/app/frontend/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://votre-backend-deploye.com
```
Puis refaites le build.

---

## 🗄️ Base de données MongoDB

Utilisez MongoDB Atlas (gratuit):
1. Créez un compte sur https://mongodb.com/atlas
2. Créez un cluster gratuit (M0)
3. Créez un utilisateur database
4. Obtenez l'URL de connexion
5. Utilisez cette URL dans MONGO_URL

---

## 📱 Pour l'app mobile (Expo Go)

L'app fonctionne toujours via Expo Go avec le QR code tant que le serveur de dev est actif.

Pour publier sur les stores:
```bash
npm install -g eas-cli
eas login
eas build --platform android
eas build --platform ios
eas submit
```

---

## ❓ Support

Pour toute question: support@emergent.sh
