from dotenv import load_dotenv
load_dotenv()

import os
import re
import json
import uuid
import base64
import logging
import asyncio
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from openpyxl import Workbook
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# ----------------------------- ENV / DB -----------------------------
ROOT_DIR = Path(__file__).parent
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGORITHM = 'HS256'
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ----------------------------- AUTH HELPERS -----------------------------
ROLES = {"admin", "operations", "finance", "warehouse", "manager"}

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=12*3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=7*24*3600, path="/")

def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_roles(*allowed):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in allowed:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(allowed)}")
        return user
    return checker

# ----------------------------- MODELS -----------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Optional[str] = "operations"
    tenant_name: Optional[str] = None  # if provided, creates a new tenant

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    tenant_id: str
    tenant_name: Optional[str] = None
    created_at: str

class TenantIn(BaseModel):
    name: str
    gstin: Optional[str] = None

class VendorIn(BaseModel):
    name: str
    gstin: Optional[str] = None
    address: Optional[str] = None
    contact: Optional[str] = None

class DocumentUpdateIn(BaseModel):
    extracted_data: Optional[Dict[str, Any]] = None
    doc_type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

# ----------------------------- VALIDATION -----------------------------
GST_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

def validate_gst(gstin: Optional[str]) -> bool:
    if not gstin:
        return False
    return bool(GST_REGEX.match(gstin.strip().upper()))

async def run_validations(tenant_id: str, doc_id: str, data: Dict[str, Any]) -> List[Dict[str, str]]:
    errors = []
    mandatory = ["vendor_name", "invoice_number", "invoice_date", "total_amount"]
    for f in mandatory:
        if not data.get(f):
            errors.append({"field": f, "level": "error", "message": f"Missing mandatory field: {f}"})
    gstin = data.get("vendor_gstin") or data.get("gstin")
    if gstin and not validate_gst(gstin):
        errors.append({"field": "vendor_gstin", "level": "warning", "message": "GSTIN format invalid"})
    inv_num = data.get("invoice_number")
    if inv_num:
        dup = await db.documents.find_one({
            "tenant_id": tenant_id,
            "extracted_data.invoice_number": inv_num,
            "id": {"$ne": doc_id}
        }, {"_id": 0, "id": 1})
        if dup:
            errors.append({"field": "invoice_number", "level": "error",
                           "message": f"Duplicate invoice number (also in doc {dup['id'][:8]})"})
    try:
        total = float(data.get("total_amount") or 0)
        items = data.get("line_items") or []
        s = sum(float(i.get("amount") or 0) for i in items)
        if items and abs(total - s) > max(1.0, 0.01 * total):
            errors.append({"field": "total_amount", "level": "warning",
                           "message": f"Total ({total}) does not match line items sum ({s:.2f})"})
    except Exception:
        pass
    return errors

# ----------------------------- AI EXTRACTION -----------------------------
EXTRACTION_PROMPT = """You are an expert document understanding AI for enterprise business documents.

Analyze the attached document image and extract structured data. The document may be one of:
invoice, delivery_challan, purchase_order, grn, packing_slip, eway_bill, transport_slip, receipt, other.

Return ONLY a valid JSON object (no markdown, no explanation) with this schema:
{
  "doc_type": "<one of the above>",
  "confidence": <0.0 to 1.0 overall confidence>,
  "language": "<ISO code, e.g. en, hi>",
  "vendor_name": "string or null",
  "vendor_gstin": "string or null",
  "vendor_address": "string or null",
  "customer_name": "string or null",
  "customer_gstin": "string or null",
  "invoice_number": "string or null",
  "dc_number": "string or null",
  "po_number": "string or null",
  "eway_bill_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "transport_mode": "string or null",
  "vehicle_number": "string or null",
  "lr_number": "string or null",
  "line_items": [
    {"description": "...", "hsn_sac": "...", "quantity": "...", "unit": "...",
     "unit_price": "...", "amount": "...", "tax_rate": "..."}
  ],
  "subtotal": "number or null",
  "cgst": "number or null",
  "sgst": "number or null",
  "igst": "number or null",
  "total_tax": "number or null",
  "total_amount": "number or null",
  "currency": "string (default INR)",
  "remarks": "string or null",
  "barcode_qr_data": "string or null",
  "raw_text": "<concise plaintext OCR>"
}

If a field is not present, use null. Numeric fields may be returned as numbers or strings.
Be precise: read the document carefully, including handwritten parts, stamps, and signatures."""

async def extract_with_gemini(image_b64: str, mime_type: str) -> Dict[str, Any]:
    if not EMERGENT_LLM_KEY:
        return {"doc_type": "other", "confidence": 0.0, "raw_text": "",
                "error": "EMERGENT_LLM_KEY not configured"}
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"docintel-{uuid.uuid4()}",
            system_message="You are a precise document understanding AI. Always return valid JSON only."
        ).with_model("gemini", "gemini-2.5-pro")
        img = ImageContent(image_base64=image_b64)
        msg = UserMessage(text=EXTRACTION_PROMPT, file_contents=[img])
        response = await chat.send_message(msg)
        text = response.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text).rstrip("```").strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", text, re.DOTALL)
            data = json.loads(m.group(0)) if m else {"raw_text": text, "doc_type": "other", "confidence": 0.3}
        return data
    except Exception as e:
        logger.exception("gemini extraction failed")
        return {"doc_type": "other", "confidence": 0.0, "raw_text": "", "error": str(e)}

# ----------------------------- APP / ROUTER -----------------------------
app = FastAPI(title="Document Intelligence Platform API", version="1.0.0",
              description="Enterprise AI-powered Document Intelligence Platform")
api = APIRouter(prefix="/api")

# ----------------------------- AUTH ROUTES -----------------------------
async def log_audit(tenant_id: str, user_id: str, action: str, resource_type: str,
                    resource_id: str = "", details: Optional[Dict] = None):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    })

@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    # Public registration ALWAYS creates non-admin user. Admins are elevated via /users by an existing admin.
    requested_role = (payload.role or "operations").lower()
    role = requested_role if requested_role in (ROLES - {"admin"}) else "operations"
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    # If tenant_name provided, create new tenant; otherwise default tenant
    if payload.tenant_name:
        tenant_id = str(uuid.uuid4())
        await db.tenants.insert_one({
            "id": tenant_id, "name": payload.tenant_name, "gstin": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        default = await db.tenants.find_one({"name": "Default Tenant"}, {"_id": 0})
        if not default:
            tenant_id = str(uuid.uuid4())
            await db.tenants.insert_one({
                "id": tenant_id, "name": "Default Tenant", "gstin": None,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        else:
            tenant_id = default["id"]
    uid = str(uuid.uuid4())
    user_doc = {
        "id": uid, "email": email, "password_hash": hash_password(payload.password),
        "name": payload.name, "role": role, "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    access = create_access_token(uid, email)
    refresh = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    user_doc["tenant_name"] = tenant.get("name") if tenant else None
    await log_audit(tenant_id, uid, "register", "user", uid)
    return user_doc

@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        last = datetime.fromisoformat(attempt["last"])
        if (datetime.now(timezone.utc) - last).total_seconds() < 900:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        await db.login_attempts.delete_one({"identifier": identifier})
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"last": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    access = create_access_token(user["id"], email)
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    user.pop("_id", None)
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    user["tenant_name"] = tenant.get("name") if tenant else None
    await log_audit(user["tenant_id"], user["id"], "login", "user", user["id"])
    return user

@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    user["tenant_name"] = tenant.get("name") if tenant else None
    return user

@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(401, "User not found")
        access = create_access_token(user["id"], user["email"])
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="none", max_age=12*3600, path="/")
        return {"ok": True}
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid refresh token")

# ----------------------------- TENANTS / USERS -----------------------------
@api.get("/tenants/me")
async def get_my_tenant(user: dict = Depends(get_current_user)):
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    return t or {}

@api.put("/tenants/me")
async def update_my_tenant(payload: TenantIn, user: dict = Depends(require_roles("admin"))):
    await db.tenants.update_one({"id": user["tenant_id"]},
                                {"$set": {"name": payload.name, "gstin": payload.gstin}})
    return await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})

@api.get("/users")
async def list_users(user: dict = Depends(require_roles("admin", "manager"))):
    cursor = db.users.find({"tenant_id": user["tenant_id"]}, {"_id": 0, "password_hash": 0})
    return await cursor.to_list(500)

@api.post("/users")
async def create_user(payload: RegisterIn, user: dict = Depends(require_roles("admin"))):
    email = payload.email.lower().strip()
    role = (payload.role or "operations").lower()
    if role not in ROLES:
        raise HTTPException(400, "Invalid role")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already exists")
    uid = str(uuid.uuid4())
    doc = {"id": uid, "email": email, "password_hash": hash_password(payload.password),
           "name": payload.name, "role": role, "tenant_id": user["tenant_id"],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(doc)
    await log_audit(user["tenant_id"], user["id"], "create_user", "user", uid)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc

@api.delete("/users/{uid}")
async def delete_user(uid: str, user: dict = Depends(require_roles("admin"))):
    if uid == user["id"]:
        raise HTTPException(400, "Cannot delete yourself")
    res = await db.users.delete_one({"id": uid, "tenant_id": user["tenant_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await log_audit(user["tenant_id"], user["id"], "delete_user", "user", uid)
    return {"ok": True}

# ----------------------------- VENDORS -----------------------------
@api.get("/vendors")
async def list_vendors(user: dict = Depends(get_current_user)):
    cursor = db.vendors.find({"tenant_id": user["tenant_id"]}, {"_id": 0})
    return await cursor.to_list(1000)

@api.post("/vendors")
async def create_vendor(payload: VendorIn, user: dict = Depends(require_roles("admin", "operations", "finance"))):
    if payload.gstin and not validate_gst(payload.gstin):
        raise HTTPException(400, "Invalid GSTIN format")
    vid = str(uuid.uuid4())
    doc = {"id": vid, "tenant_id": user["tenant_id"], **payload.model_dump(),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.vendors.insert_one(doc)
    doc.pop("_id", None)
    await log_audit(user["tenant_id"], user["id"], "create_vendor", "vendor", vid)
    return doc

@api.delete("/vendors/{vid}")
async def delete_vendor(vid: str, user: dict = Depends(require_roles("admin", "operations"))):
    res = await db.vendors.delete_one({"id": vid, "tenant_id": user["tenant_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await log_audit(user["tenant_id"], user["id"], "delete_vendor", "vendor", vid)
    return {"ok": True}

# ----------------------------- DOCUMENTS -----------------------------
async def _save_document(file: UploadFile, user: dict) -> dict:
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(413, f"File too large: {file.filename}")
    b64 = base64.b64encode(content).decode("utf-8")
    mime = file.content_type or "application/octet-stream"
    if mime == "application/octet-stream":
        ext = (file.filename or "").lower().split(".")[-1]
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "webp": "image/webp", "pdf": "application/pdf"}.get(ext, mime)
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": user["tenant_id"],
        "filename": file.filename,
        "mime_type": mime,
        "file_b64": b64,
        "size": len(content),
        "doc_type": "unknown",
        "status": "pending",  # pending, processing, processed, approved, rejected, failed
        "extracted_data": {},
        "confidence": 0.0,
        "validation_errors": [],
        "uploaded_by": user["id"],
        "uploaded_by_name": user.get("name"),
        "approved_by": None,
        "notes": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(doc.copy())
    await log_audit(user["tenant_id"], user["id"], "upload_document", "document", doc["id"],
                    {"filename": file.filename, "size": len(content)})
    return doc

@api.post("/documents/upload")
async def upload_document(file: UploadFile = File(...),
                          auto_process: bool = Form(True),
                          user: dict = Depends(get_current_user)):
    doc = await _save_document(file, user)
    if auto_process and doc["mime_type"].startswith("image/"):
        asyncio.create_task(_process_document_async(doc["id"], user["tenant_id"]))
    doc.pop("file_b64", None)
    return doc

@api.post("/documents/upload-bulk")
async def upload_bulk(files: List[UploadFile] = File(...),
                      auto_process: bool = Form(True),
                      user: dict = Depends(get_current_user)):
    saved = []
    for f in files:
        try:
            d = await _save_document(f, user)
            if auto_process and d["mime_type"].startswith("image/"):
                asyncio.create_task(_process_document_async(d["id"], user["tenant_id"]))
            d.pop("file_b64", None)
            saved.append(d)
        except HTTPException as e:
            saved.append({"filename": f.filename, "error": e.detail})
    return {"uploaded": len(saved), "documents": saved}

async def _process_document_async(doc_id: str, tenant_id: str):
    doc = await db.documents.find_one({"id": doc_id, "tenant_id": tenant_id})
    if not doc:
        return
    await db.documents.update_one({"id": doc_id}, {"$set": {"status": "processing"}})
    try:
        if doc["mime_type"].startswith("image/"):
            data = await extract_with_gemini(doc["file_b64"], doc["mime_type"])
        else:
            data = {"doc_type": "other", "confidence": 0.0, "raw_text": "",
                    "error": "Only image processing supported in this MVP"}
        confidence = float(data.get("confidence") or 0.0)
        doc_type = data.get("doc_type") or "other"
        errors = await run_validations(tenant_id, doc_id, data)
        status = "processed" if not data.get("error") else "failed"
        await db.documents.update_one({"id": doc_id}, {"$set": {
            "extracted_data": data,
            "confidence": confidence,
            "doc_type": doc_type,
            "status": status,
            "validation_errors": errors,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
    except Exception as e:
        logger.exception("processing failed")
        await db.documents.update_one({"id": doc_id}, {"$set": {
            "status": "failed", "validation_errors": [{"field": "_system", "level": "error", "message": str(e)}]
        }})

@api.post("/documents/{doc_id}/process")
async def process_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"id": doc_id, "tenant_id": user["tenant_id"]})
    if not doc:
        raise HTTPException(404, "Not found")
    await _process_document_async(doc_id, user["tenant_id"])
    await log_audit(user["tenant_id"], user["id"], "process_document", "document", doc_id)
    updated = await db.documents.find_one({"id": doc_id}, {"_id": 0, "file_b64": 0})
    return updated

@api.get("/documents")
async def list_documents(user: dict = Depends(get_current_user),
                         q: Optional[str] = None,
                         doc_type: Optional[str] = None,
                         status: Optional[str] = None,
                         limit: int = 50,
                         skip: int = 0):
    query = {"tenant_id": user["tenant_id"]}
    if doc_type and doc_type != "all":
        query["doc_type"] = doc_type
    if status and status != "all":
        query["status"] = status
    if q:
        query["$or"] = [
            {"filename": {"$regex": q, "$options": "i"}},
            {"extracted_data.invoice_number": {"$regex": q, "$options": "i"}},
            {"extracted_data.vendor_name": {"$regex": q, "$options": "i"}},
            {"extracted_data.dc_number": {"$regex": q, "$options": "i"}},
            {"extracted_data.po_number": {"$regex": q, "$options": "i"}},
        ]
    total = await db.documents.count_documents(query)
    cursor = db.documents.find(query, {"_id": 0, "file_b64": 0}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return {"total": total, "documents": docs}

@api.get("/documents/{doc_id}")
async def get_document(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"id": doc_id, "tenant_id": user["tenant_id"]}, {"_id": 0, "file_b64": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc

@api.get("/documents/{doc_id}/file")
async def get_document_file(doc_id: str, user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"id": doc_id, "tenant_id": user["tenant_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return {"filename": doc.get("filename"), "mime_type": doc.get("mime_type"),
            "data_url": f"data:{doc.get('mime_type')};base64,{doc.get('file_b64')}"}

@api.put("/documents/{doc_id}")
async def update_document(doc_id: str, payload: DocumentUpdateIn,
                          user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"id": doc_id, "tenant_id": user["tenant_id"]})
    if not doc:
        raise HTTPException(404, "Not found")
    update = {}
    if payload.extracted_data is not None:
        update["extracted_data"] = payload.extracted_data
        update["validation_errors"] = await run_validations(user["tenant_id"], doc_id, payload.extracted_data)
    if payload.doc_type is not None:
        update["doc_type"] = payload.doc_type
    if payload.status is not None:
        update["status"] = payload.status
    if payload.notes is not None:
        update["notes"] = payload.notes
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.documents.update_one({"id": doc_id}, {"$set": update})
    await log_audit(user["tenant_id"], user["id"], "update_document", "document", doc_id)
    return await db.documents.find_one({"id": doc_id}, {"_id": 0, "file_b64": 0})

@api.post("/documents/{doc_id}/approve")
async def approve_document(doc_id: str, user: dict = Depends(require_roles("admin", "finance", "manager"))):
    res = await db.documents.update_one(
        {"id": doc_id, "tenant_id": user["tenant_id"]},
        {"$set": {"status": "approved", "approved_by": user["id"],
                  "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_audit(user["tenant_id"], user["id"], "approve_document", "document", doc_id)
    return await db.documents.find_one({"id": doc_id}, {"_id": 0, "file_b64": 0})

@api.post("/documents/{doc_id}/reject")
async def reject_document(doc_id: str, payload: DocumentUpdateIn,
                          user: dict = Depends(require_roles("admin", "finance", "manager"))):
    res = await db.documents.update_one(
        {"id": doc_id, "tenant_id": user["tenant_id"]},
        {"$set": {"status": "rejected", "approved_by": user["id"],
                  "notes": payload.notes or "",
                  "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    await log_audit(user["tenant_id"], user["id"], "reject_document", "document", doc_id)
    return await db.documents.find_one({"id": doc_id}, {"_id": 0, "file_b64": 0})

@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(require_roles("admin", "operations"))):
    res = await db.documents.delete_one({"id": doc_id, "tenant_id": user["tenant_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await log_audit(user["tenant_id"], user["id"], "delete_document", "document", doc_id)
    return {"ok": True}

# ----------------------------- EXPORTS -----------------------------
def _flatten_doc(doc: dict) -> dict:
    d = doc.get("extracted_data") or {}
    return {
        "id": doc.get("id"),
        "filename": doc.get("filename"),
        "doc_type": doc.get("doc_type"),
        "status": doc.get("status"),
        "confidence": doc.get("confidence"),
        "vendor_name": d.get("vendor_name"),
        "vendor_gstin": d.get("vendor_gstin"),
        "invoice_number": d.get("invoice_number"),
        "dc_number": d.get("dc_number"),
        "po_number": d.get("po_number"),
        "invoice_date": d.get("invoice_date"),
        "due_date": d.get("due_date"),
        "subtotal": d.get("subtotal"),
        "cgst": d.get("cgst"),
        "sgst": d.get("sgst"),
        "igst": d.get("igst"),
        "total_tax": d.get("total_tax"),
        "total_amount": d.get("total_amount"),
        "currency": d.get("currency"),
        "transport_mode": d.get("transport_mode"),
        "vehicle_number": d.get("vehicle_number"),
        "lr_number": d.get("lr_number"),
        "remarks": d.get("remarks"),
        "uploaded_by": doc.get("uploaded_by_name"),
        "created_at": doc.get("created_at"),
    }

@api.get("/documents/export/all")
async def export_all(format: str = Query("excel"), user: dict = Depends(get_current_user)):
    cursor = db.documents.find({"tenant_id": user["tenant_id"]}, {"_id": 0, "file_b64": 0})
    docs = await cursor.to_list(5000)
    rows = [_flatten_doc(d) for d in docs]
    fmt = format.lower()
    if fmt == "json":
        from json import dumps
        body = dumps({"documents": rows}, indent=2, default=str)
        return StreamingResponse(BytesIO(body.encode("utf-8")), media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=documents.json"})
    if fmt == "csv":
        import csv
        if rows:
            keys = list(rows[0].keys())
            import io
            sio = io.StringIO()
            writer = csv.DictWriter(sio, fieldnames=keys)
            writer.writeheader()
            for r in rows:
                writer.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in keys})
            data = sio.getvalue().encode("utf-8")
        else:
            data = b"no data"
        return StreamingResponse(BytesIO(data), media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=documents.csv"})
    if fmt == "xml":
        def esc(v): return ("" if v is None else str(v)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        body = "<?xml version='1.0' encoding='UTF-8'?>\n<documents>\n"
        for r in rows:
            body += "  <document>\n"
            for k, v in r.items():
                body += f"    <{k}>{esc(v)}</{k}>\n"
            body += "  </document>\n"
        body += "</documents>"
        return StreamingResponse(BytesIO(body.encode("utf-8")), media_type="application/xml",
            headers={"Content-Disposition": "attachment; filename=documents.xml"})
    # excel default
    wb = Workbook()
    ws = wb.active
    ws.title = "Documents"
    if rows:
        headers = list(rows[0].keys())
        ws.append(headers)
        for r in rows:
            ws.append([r.get(k) for k in headers])
    # second sheet: line items
    li = wb.create_sheet("LineItems")
    li.append(["document_id", "vendor_name", "invoice_number", "description", "hsn_sac",
               "quantity", "unit", "unit_price", "amount", "tax_rate"])
    for d in docs:
        ed = d.get("extracted_data") or {}
        for it in ed.get("line_items") or []:
            li.append([d.get("id"), ed.get("vendor_name"), ed.get("invoice_number"),
                       it.get("description"), it.get("hsn_sac"), it.get("quantity"),
                       it.get("unit"), it.get("unit_price"), it.get("amount"), it.get("tax_rate")])
    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=documents.xlsx"}
    )

@api.get("/documents/{doc_id}/export")
async def export_one(doc_id: str, format: str = Query("excel"), user: dict = Depends(get_current_user)):
    d = await db.documents.find_one({"id": doc_id, "tenant_id": user["tenant_id"]}, {"_id": 0, "file_b64": 0})
    if not d:
        raise HTTPException(404, "Not found")
    rows = [_flatten_doc(d)]
    if format.lower() == "json":
        body = json.dumps({"document": rows[0], "raw": d.get("extracted_data")}, indent=2, default=str)
        return StreamingResponse(BytesIO(body.encode("utf-8")), media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={doc_id}.json"})
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    keys = list(rows[0].keys())
    ws.append(keys)
    ws.append([rows[0].get(k) for k in keys])
    li = wb.create_sheet("LineItems")
    li.append(["description", "hsn_sac", "quantity", "unit", "unit_price", "amount", "tax_rate"])
    ed = d.get("extracted_data") or {}
    for it in ed.get("line_items") or []:
        li.append([it.get("description"), it.get("hsn_sac"), it.get("quantity"),
                   it.get("unit"), it.get("unit_price"), it.get("amount"), it.get("tax_rate")])
    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={doc_id}.xlsx"})

# ----------------------------- DASHBOARD / AUDIT -----------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    tid = user["tenant_id"]
    total = await db.documents.count_documents({"tenant_id": tid})
    by_status = {}
    for s in ["pending", "processing", "processed", "approved", "rejected", "failed"]:
        by_status[s] = await db.documents.count_documents({"tenant_id": tid, "status": s})
    by_type = {}
    for t in ["invoice", "delivery_challan", "purchase_order", "grn", "packing_slip", "eway_bill", "transport_slip", "other", "unknown"]:
        c = await db.documents.count_documents({"tenant_id": tid, "doc_type": t})
        if c > 0:
            by_type[t] = c
    pipeline = [
        {"$match": {"tenant_id": tid, "confidence": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$confidence"}}}
    ]
    avg = 0.0
    async for r in db.documents.aggregate(pipeline):
        avg = r.get("avg", 0.0) or 0.0
    # last 14 days trend
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    trend = []
    for day in days:
        start = day + "T00:00:00"
        end = day + "T23:59:59"
        c = await db.documents.count_documents({"tenant_id": tid,
            "created_at": {"$gte": start, "$lte": end}})
        trend.append({"date": day, "count": c})
    # vendors top 5
    vp = [
        {"$match": {"tenant_id": tid, "extracted_data.vendor_name": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$extracted_data.vendor_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_vendors = []
    async for r in db.documents.aggregate(vp):
        top_vendors.append({"vendor": r["_id"], "count": r["count"]})
    pending_review = await db.documents.count_documents({"tenant_id": tid,
        "status": {"$in": ["processed", "pending"]}})
    failed = by_status.get("failed", 0)
    return {
        "total_documents": total,
        "by_status": by_status,
        "by_type": by_type,
        "avg_confidence": round(avg, 3),
        "trend_14d": trend,
        "top_vendors": top_vendors,
        "pending_review": pending_review,
        "failed_validations": failed,
    }

@api.get("/audit-logs")
async def list_audit_logs(user: dict = Depends(require_roles("admin", "manager")),
                          limit: int = 100):
    cursor = db.audit_logs.find({"tenant_id": user["tenant_id"]}, {"_id": 0}).sort("created_at", -1).limit(limit)
    logs = await cursor.to_list(limit)
    # enrich with user names
    user_ids = list({log.get("user_id") for log in logs})
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)
    umap = {u["id"]: u for u in users}
    for log in logs:
        u = umap.get(log.get("user_id"))
        log["user_name"] = u.get("name") if u else "Unknown"
        log["user_email"] = u.get("email") if u else ""
    return logs

@api.get("/")
async def root():
    return {"name": "Document Intelligence Platform", "version": "1.0.0", "docs": "/docs"}

# ----------------------------- INCLUDE / CORS -----------------------------
app.include_router(api)

frontend_origin = os.environ.get("FRONTEND_URL", "http://localhost:3000")
allowed_origins = [frontend_origin, "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------- STARTUP -----------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.documents.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.audit_logs.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    # Seed default tenant + admin
    default = await db.tenants.find_one({"name": "Default Tenant"})
    if not default:
        tenant_id = str(uuid.uuid4())
        await db.tenants.insert_one({
            "id": tenant_id, "name": "Default Tenant", "gstin": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    else:
        tenant_id = default["id"]
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@docintel.io")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Platform Admin", "role": "admin", "tenant_id": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}})
    logger.info("Startup complete. Admin: %s", admin_email)

@app.on_event("shutdown")
async def on_shutdown():
    client.close()
