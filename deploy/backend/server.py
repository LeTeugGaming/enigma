from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from bson import ObjectId
import secrets
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============ Models ============

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    score: int = 0
    riddles_solved: int = 0
    created_at: datetime

class RiddleAnswer(BaseModel):
    riddle_id: str
    answer: str

class RiddleResponse(BaseModel):
    id: str
    question: str
    hint: Optional[str] = None
    difficulty: str
    points: int
    created_at: datetime
    expires_at: datetime
    is_active: bool

class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    score: int
    riddles_solved: int

class HistoryEntry(BaseModel):
    riddle_question: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    points_earned: int
    answered_at: datetime

class UpdateProfilePhoto(BaseModel):
    photo: str  # Base64 encoded image

# ============ Password Utilities ============

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# ============ JWT Token Management ============

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# ============ Auth Helper ============

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Type de token invalide")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

# ============ AI Riddle Generation ============

async def generate_riddle_with_ai() -> dict:
    """Generate a French riddle using AI"""
    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"riddle-{uuid.uuid4()}",
            system_message="""Tu es un créateur d'énigmes français. Tu dois générer des énigmes originales, amusantes et stimulantes en français.
            
Réponds UNIQUEMENT avec un JSON valide dans ce format exact (sans texte avant ou après):
{
    "question": "L'énigme en français",
    "answer": "La réponse en un ou deux mots",
    "hint": "Un indice pour aider",
    "difficulty": "facile" ou "moyen" ou "difficile"
}

Exemple:
{
    "question": "Je suis toujours devant toi mais tu ne peux jamais me voir. Qui suis-je?",
    "answer": "L'avenir",
    "hint": "Pense au temps",
    "difficulty": "moyen"
}"""
        )
        chat.with_model("openai", "gpt-4.1-mini")
        
        user_message = UserMessage(
            text="Génère une nouvelle énigme originale et créative en français. La réponse doit être un mot ou une courte phrase simple."
        )
        
        response = await chat.send_message(user_message)
        logger.info(f"AI Response: {response}")
        
        # Parse JSON response
        import json
        # Clean response if needed
        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.startswith("```"):
            response_clean = response_clean[3:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()
        
        riddle_data = json.loads(response_clean)
        
        # Determine points based on difficulty
        difficulty_points = {
            "facile": 10,
            "moyen": 20,
            "difficile": 30
        }
        
        return {
            "question": riddle_data["question"],
            "answer": riddle_data["answer"].lower().strip(),
            "hint": riddle_data.get("hint", ""),
            "difficulty": riddle_data.get("difficulty", "moyen"),
            "points": difficulty_points.get(riddle_data.get("difficulty", "moyen"), 20)
        }
    except Exception as e:
        logger.error(f"Error generating riddle: {e}")
        # Fallback riddles
        fallback_riddles = [
            {
                "question": "Je suis toujours devant toi mais tu ne peux jamais me voir. Qui suis-je?",
                "answer": "l'avenir",
                "hint": "Pense au temps",
                "difficulty": "moyen",
                "points": 20
            },
            {
                "question": "Plus je sèche, plus je suis mouillée. Qui suis-je?",
                "answer": "une serviette",
                "hint": "Tu l'utilises après la douche",
                "difficulty": "facile",
                "points": 10
            },
            {
                "question": "J'ai des villes, mais pas de maisons. J'ai des forêts, mais pas d'arbres. J'ai de l'eau, mais pas de poissons. Qui suis-je?",
                "answer": "une carte",
                "hint": "Tu peux me plier",
                "difficulty": "difficile",
                "points": 30
            }
        ]
        import random
        return random.choice(fallback_riddles)

# ============ Auth Endpoints ============

@api_router.post("/auth/register")
async def register(user_data: UserRegister, response: Response):
    email = user_data.email.lower()
    
    # Check if user exists
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    
    # Create user
    user_doc = {
        "email": email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "score": 0,
        "riddles_solved": 0,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create tokens
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    # Set cookies
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=2592000, path="/")
    
    return {
        "id": user_id,
        "email": email,
        "name": user_data.name,
        "score": 0,
        "riddles_solved": 0,
        "token": access_token
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response):
    email = user_data.email.lower()
    
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    if not verify_password(user_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    user_id = str(user["_id"])
    
    # Create tokens
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    # Set cookies
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=2592000, path="/")
    
    return {
        "id": user_id,
        "email": user["email"],
        "name": user["name"],
        "score": user.get("score", 0),
        "riddles_solved": user.get("riddles_solved", 0),
        "token": access_token
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Déconnexion réussie"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {
        "id": user["_id"],
        "email": user["email"],
        "name": user["name"],
        "score": user.get("score", 0),
        "riddles_solved": user.get("riddles_solved", 0),
        "profile_photo": user.get("profile_photo", None)
    }

@api_router.put("/auth/profile-photo")
async def update_profile_photo(photo_data: UpdateProfilePhoto, request: Request):
    """Update user's profile photo (base64 encoded)"""
    user = await get_current_user(request)
    
    # Validate base64 image
    if not photo_data.photo.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Format d'image invalide. Utilisez base64.")
    
    # Update user's profile photo
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"profile_photo": photo_data.photo}}
    )
    
    return {"message": "Photo de profil mise à jour", "profile_photo": photo_data.photo}

# ============ Riddle Endpoints ============

@api_router.get("/riddles/current")
async def get_current_riddle(request: Request):
    """Get the current active riddle (changes every 2 hours)"""
    user = await get_current_user(request)
    
    now = datetime.now(timezone.utc)
    
    # Deactivate expired riddles first
    await db.riddles.update_many(
        {"expires_at": {"$lt": now}, "is_active": True},
        {"$set": {"is_active": False}}
    )
    
    # Find active riddle that hasn't expired
    active_riddle = await db.riddles.find_one({
        "is_active": True,
        "expires_at": {"$gt": now}
    })
    
    if not active_riddle:
        # Generate new riddle
        logger.info("No active riddle found, generating new one...")
        riddle_data = await generate_riddle_with_ai()
        
        new_riddle = {
            "question": riddle_data["question"],
            "answer": riddle_data["answer"],
            "hint": riddle_data["hint"],
            "difficulty": riddle_data["difficulty"],
            "points": riddle_data["points"],
            "created_at": now,
            "expires_at": now + timedelta(hours=2),
            "is_active": True
        }
        
        result = await db.riddles.insert_one(new_riddle)
        active_riddle = new_riddle
        active_riddle["_id"] = result.inserted_id
        
        logger.info(f"New riddle generated: {riddle_data['question'][:50]}...")
    
    # Check if user already solved this riddle
    user_answer = await db.user_answers.find_one({
        "user_id": user["_id"],
        "riddle_id": str(active_riddle["_id"])
    })
    
    return {
        "id": str(active_riddle["_id"]),
        "question": active_riddle["question"],
        "hint": active_riddle["hint"],
        "difficulty": active_riddle["difficulty"],
        "points": active_riddle["points"],
        "created_at": active_riddle["created_at"].isoformat() if isinstance(active_riddle["created_at"], datetime) else active_riddle["created_at"],
        "expires_at": active_riddle["expires_at"].isoformat() if isinstance(active_riddle["expires_at"], datetime) else active_riddle["expires_at"],
        "already_answered": user_answer is not None,
        "user_was_correct": user_answer["is_correct"] if user_answer else None
    }

@api_router.post("/riddles/answer")
async def submit_answer(answer_data: RiddleAnswer, request: Request):
    """Submit an answer to a riddle"""
    user = await get_current_user(request)
    
    # Get the riddle
    riddle = await db.riddles.find_one({"_id": ObjectId(answer_data.riddle_id)})
    if not riddle:
        raise HTTPException(status_code=404, detail="Énigme non trouvée")
    
    # Check if already answered
    existing_answer = await db.user_answers.find_one({
        "user_id": user["_id"],
        "riddle_id": answer_data.riddle_id
    })
    
    if existing_answer:
        raise HTTPException(status_code=400, detail="Vous avez déjà répondu à cette énigme")
    
    # Check answer (case insensitive, stripped)
    user_answer = answer_data.answer.lower().strip()
    correct_answer = riddle["answer"].lower().strip()
    
    # More flexible matching - check if answer contains the correct answer or vice versa
    is_correct = (user_answer == correct_answer or 
                  user_answer in correct_answer or 
                  correct_answer in user_answer)
    
    points_earned = riddle["points"] if is_correct else 0
    
    # Save answer
    answer_doc = {
        "user_id": user["_id"],
        "riddle_id": answer_data.riddle_id,
        "riddle_question": riddle["question"],
        "user_answer": answer_data.answer,
        "correct_answer": riddle["answer"],
        "is_correct": is_correct,
        "points_earned": points_earned,
        "answered_at": datetime.now(timezone.utc)
    }
    
    await db.user_answers.insert_one(answer_doc)
    
    # Update user score if correct
    if is_correct:
        await db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {
                "$inc": {
                    "score": points_earned,
                    "riddles_solved": 1
                }
            }
        )
    
    return {
        "is_correct": is_correct,
        "correct_answer": riddle["answer"],
        "points_earned": points_earned,
        "message": "Bravo ! Bonne réponse ! 🎉" if is_correct else f"Dommage ! La bonne réponse était: {riddle['answer']}"
    }

@api_router.get("/riddles/hint/{riddle_id}")
async def get_hint(riddle_id: str, request: Request):
    """Get hint for a riddle"""
    await get_current_user(request)
    
    riddle = await db.riddles.find_one({"_id": ObjectId(riddle_id)})
    if not riddle:
        raise HTTPException(status_code=404, detail="Énigme non trouvée")
    
    return {"hint": riddle.get("hint", "Aucun indice disponible")}

# ============ Leaderboard Endpoint ============

@api_router.get("/leaderboard")
async def get_leaderboard(request: Request):
    """Get top 10 players leaderboard"""
    await get_current_user(request)
    
    users = await db.users.find(
        {},
        {"name": 1, "score": 1, "riddles_solved": 1}
    ).sort("score", -1).limit(10).to_list(10)
    
    leaderboard = []
    for i, user in enumerate(users):
        leaderboard.append({
            "rank": i + 1,
            "name": user["name"],
            "score": user.get("score", 0),
            "riddles_solved": user.get("riddles_solved", 0)
        })
    
    return leaderboard

# ============ History Endpoint ============

@api_router.get("/history")
async def get_history(request: Request):
    """Get user's riddle history"""
    user = await get_current_user(request)
    
    answers = await db.user_answers.find(
        {"user_id": user["_id"]}
    ).sort("answered_at", -1).limit(50).to_list(50)
    
    history = []
    for answer in answers:
        history.append({
            "riddle_question": answer["riddle_question"],
            "user_answer": answer["user_answer"],
            "correct_answer": answer["correct_answer"],
            "is_correct": answer["is_correct"],
            "points_earned": answer["points_earned"],
            "answered_at": answer["answered_at"].isoformat() if isinstance(answer["answered_at"], datetime) else answer["answered_at"]
        })
    
    return history

# ============ User Stats Endpoint ============

@api_router.get("/stats")
async def get_user_stats(request: Request):
    """Get detailed user statistics"""
    user = await get_current_user(request)
    
    # Count total answers
    total_answers = await db.user_answers.count_documents({"user_id": user["_id"]})
    correct_answers = await db.user_answers.count_documents({"user_id": user["_id"], "is_correct": True})
    
    # Get user rank
    users_above = await db.users.count_documents({"score": {"$gt": user.get("score", 0)}})
    rank = users_above + 1
    
    return {
        "score": user.get("score", 0),
        "riddles_solved": user.get("riddles_solved", 0),
        "total_attempts": total_answers,
        "accuracy": round((correct_answers / total_answers * 100) if total_answers > 0 else 0, 1),
        "rank": rank
    }

# ============ Time Until Next Riddle ============

@api_router.get("/riddles/next-time")
async def get_next_riddle_time():
    """Get time until next riddle"""
    now = datetime.now(timezone.utc)
    
    active_riddle = await db.riddles.find_one({
        "is_active": True,
        "expires_at": {"$gt": now}
    })
    
    if active_riddle:
        expires_at = active_riddle["expires_at"]
        if isinstance(expires_at, datetime):
            time_remaining = (expires_at - now).total_seconds()
        else:
            time_remaining = 7200  # 2 hours default
    else:
        time_remaining = 0
    
    return {
        "seconds_remaining": max(0, int(time_remaining)),
        "next_riddle_at": active_riddle["expires_at"].isoformat() if active_riddle else now.isoformat()
    }

# ============ Root Endpoint ============

@api_router.get("/")
async def root():
    return {"message": "Enigma API - Bienvenue!"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ Startup Event ============

@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.riddles.create_index("expires_at")
    await db.riddles.create_index("is_active")
    await db.user_answers.create_index([("user_id", 1), ("riddle_id", 1)], unique=True)
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@enigma.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "score": 0,
            "riddles_solved": 0,
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    
    # Deactivate old riddles
    now = datetime.now(timezone.utc)
    await db.riddles.update_many(
        {"expires_at": {"$lt": now}},
        {"$set": {"is_active": False}}
    )
    
    logger.info("Enigma API started successfully!")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
