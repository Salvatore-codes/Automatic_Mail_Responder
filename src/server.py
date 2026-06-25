import os
import time
import json
import random
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

from google import genai
from src.tenants import get_tenant_catalog, get_tenant_config, list_tenants_public
from src.scenario_free import run_scenario_free
from src.scenario_hybrid import run_scenario_hybrid
from src.pdf_generator import generate_pdf_quotation
from src.negotiator import run_negotiation_step

# 1. Initialize FastAPI app
app = FastAPI(title="Trofeo Hardware Automated SKU Matcher API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths setup
project_root = os.path.dirname(os.path.dirname(__file__))
static_dir = os.path.join(project_root, "static")
quotes_dir = os.path.join(static_dir, "quotes")

# Ensure static and quotes directory exist
os.makedirs(quotes_dir, exist_ok=True)

# Pydantic schemas
class ProcessRequest(BaseModel):
    text: str
    engine: str  # "A" or "B"
    customer_email: str
    input_type: str  # "email", "whatsapp", "custom"
    tenant_id: str = "default"

class ConfirmRequest(BaseModel):
    query: str
    sku_id: str
    tenant_id: str = "default"

class PDFRequest(BaseModel):
    matched_lines: List[Dict[str, Any]]
    discount_pct: float
    customer_name: str
    invoice_id: str
    tenant_id: str = "default"

class NegotiateRequest(BaseModel):
    customer_message: str
    requested_discount: float
    chat_history: List[Dict[str, str]]
    tenant_id: str = "default"

# Helper: Load CRM Customers for a specific tenant
def load_tenant_crm_customers(tenant_id):
    tenant_config = get_tenant_config(tenant_id)
    crm_p = tenant_config.get("crm_json")
    if crm_p:
        if not os.path.isabs(crm_p):
            crm_p = os.path.join(project_root, crm_p)
        if not os.path.exists(crm_p):
            crm_p = os.path.join(project_root, "data", "crm_customers.json")
    else:
        crm_p = os.path.join(project_root, "data", "crm_customers.json")
        
    if os.path.exists(crm_p):
        try:
            with open(crm_p, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

# Tenant Metadata listing endpoint
@app.get("/api/tenants")
async def get_tenants():
    return list_tenants_public()

# Webhook simulation / API Ingestion endpoint
@app.post("/api/process")
async def process_order(req: ProcessRequest):
    start_time = time.time()
    
    # 1. CRM Lookup
    customers = load_tenant_crm_customers(req.tenant_id)
    cust_profile = customers.get(req.customer_email, {"name": "Walk-in Retail Client", "tier": "retail", "discount": 0.0})
    
    # Get tenant specific Catalog
    catalog = get_tenant_catalog(req.tenant_id)
    
    # 2. Run Matcher Pipeline
    matched_lines = []
    
    if req.engine == "A":
        # Scenario A (Free Fuzzy)
        matched_lines = run_scenario_free(req.text, catalog)
    else:
        # Scenario B (Paid AI Hybrid)
        matched_lines = run_scenario_hybrid(req.text, catalog, input_type=req.input_type)
        
    search_time = time.time() - start_time
    
    # Calculate pipeline costs
    cost = 0.0014 if req.engine == "B" else 0.0
    
    return {
        "matched_lines": matched_lines,
        "discount_pct": cust_profile["discount"],
        "customer_name": cust_profile["name"],
        "metrics": {
            "parsed_count": len(matched_lines),
            "search_time_sec": round(search_time, 4),
            "cost_usd": cost
        }
    }

# Human-in-the-Loop Override Endpoint
@app.post("/api/hitl/confirm")
async def confirm_hitl_override(req: ConfirmRequest):
    try:
        catalog = get_tenant_catalog(req.tenant_id)
        catalog.register_synonym(req.query, req.sku_id)
        return {"status": "SUCCESS", "message": f"Synonym registered: '{req.query}' -> {req.sku_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# PDF Quotation Generation Endpoint
@app.post("/api/quote/generate")
async def generate_quote_pdf(req: PDFRequest):
    if not req.matched_lines:
        raise HTTPException(status_code=400, detail="Cannot generate quotation with 0 items.")
    
    from src.tenants import sanitize_tenant_id
    t_id = sanitize_tenant_id(req.tenant_id)
    safe_inv_id = "".join(c for c in str(req.invoice_id) if c.isalnum() or c in ("_", "-"))
    if not safe_inv_id:
        raise HTTPException(status_code=400, detail="Invalid Invoice ID.")
        
    filename = f"Quote_{safe_inv_id}.pdf"
    
    # Isolate PDF path per tenant
    if t_id and t_id != "default":
        pdf_subdir = os.path.join(quotes_dir, t_id)
    else:
        pdf_subdir = quotes_dir
    os.makedirs(pdf_subdir, exist_ok=True)
    pdf_path = os.path.join(pdf_subdir, filename)
    
    try:
        # Lookup customer phone and email from tenant CRM if possible
        customers = load_tenant_crm_customers(req.tenant_id)
        cust_phone = "—"
        cust_email = "walkin_retail@guest.com"
        for email_key, profile in customers.items():
            if profile.get("name") == req.customer_name:
                cust_phone = profile.get("phone", "—")
                cust_email = email_key
                break

        tenant_config = get_tenant_config(req.tenant_id)
        catalog = get_tenant_catalog(req.tenant_id)

        # Cap quantities based on on-hand stock and track deficits
        from src.email_listener import adjust_quantities_by_stock, send_deficit_purchase_order_alert
        deficit_lines = adjust_quantities_by_stock(req.matched_lines, catalog)

        # Send deficit PO alert to master if SMTP settings are configured
        email_user = tenant_config.get("email_user")
        email_pass = tenant_config.get("email_pass")
        master_email = tenant_config.get("master_email")
        if deficit_lines and email_user and email_pass and master_email and email_user.strip() != "" and not email_user.startswith("your_"):
            try:
                send_deficit_purchase_order_alert(
                    smtp_server=tenant_config.get("smtp_server", "smtp.gmail.com"),
                    smtp_port=int(tenant_config.get("smtp_port", 465)),
                    email_user=email_user,
                    email_pass=email_pass,
                    master_email=master_email,
                    customer_name=req.customer_name,
                    customer_email=cust_email,
                    customer_phone=cust_phone,
                    original_subject=f"Manual Quotation Deficit Notification (Invoice #{req.invoice_id})",
                    deficit_lines=deficit_lines
                )
            except Exception as e:
                print(f"[Warning] Failed to send deficit PO alert from server: {e}")

        generate_pdf_quotation(
            matched_lines=req.matched_lines,
            discount_pct=req.discount_pct,
            customer_name=req.customer_name,
            invoice_id=req.invoice_id,
            output_path=pdf_path,
            catalog=catalog,
            customer_phone=cust_phone,
            upi_id=tenant_config.get("upi_id"),
            upi_name=tenant_config.get("upi_name"),
            logo_path=tenant_config.get("company_logo_path"),
            business_name=tenant_config.get("business_name")
        )
        
        # Log to SQLite Database
        try:
            from src.database_sqlite import log_quotation, log_quotation_item
            raw_subtotal = sum(i["quantity"] * i["unit_price"] for i in req.matched_lines if i["matched_sku_id"] != "UNKNOWN")
            discount_amt = raw_subtotal * req.discount_pct
            net_subtotal = raw_subtotal - discount_amt
            tax_amt = net_subtotal * 0.18
            grand_total = net_subtotal + tax_amt
            
            log_quotation(
                invoice_id=req.invoice_id,
                customer_name=req.customer_name,
                customer_email=cust_email,
                customer_phone=cust_phone,
                subtotal=raw_subtotal,
                discount_pct=req.discount_pct,
                tax_amt=tax_amt,
                grand_total=grand_total,
                status="QUOTE_GENERATED",
                tenant_id=req.tenant_id
            )
            for item in req.matched_lines:
                if item["matched_sku_id"] != "UNKNOWN":
                    log_quotation_item(
                        invoice_id=req.invoice_id,
                        sku_id=item["matched_sku_id"],
                        sku_name=item["matched_sku_name"],
                        quantity=item["quantity"],
                        unit_price=item["unit_price"],
                        line_total=item["quantity"] * item["unit_price"],
                        tenant_id=req.tenant_id
                    )
        except Exception as e:
            print(f"[Warning] SQLite logging failed: {e}")
        return {"pdf_url": f"/api/quote/pdf/{req.invoice_id}?tenant_id={req.tenant_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/quote/pdf/{invoice_id}")
async def get_quote_pdf(invoice_id: str, tenant_id: str = "default"):
    from fastapi.responses import FileResponse
    from src.tenants import sanitize_tenant_id
    
    t_id = sanitize_tenant_id(tenant_id)
    safe_inv_id = "".join(c for c in str(invoice_id) if c.isalnum() or c in ("_", "-"))
    if not safe_inv_id:
        raise HTTPException(status_code=400, detail="Invalid Invoice ID.")
        
    filename = f"Quote_{safe_inv_id}.pdf"
    
    # 1. Check static/quotes/
    if t_id and t_id != "default":
        path1 = os.path.join(quotes_dir, t_id, filename)
        path2 = os.path.join(project_root, "mock_outbox", t_id, filename)
    else:
        path1 = os.path.join(quotes_dir, filename)
        path2 = os.path.join(project_root, "mock_outbox", filename)

    if os.path.exists(path1):
        return FileResponse(path1)
        
    # 2. Check mock_outbox/
    if os.path.exists(path2):
        return FileResponse(path2)
        
    raise HTTPException(status_code=404, detail="Quotation PDF file not found.")

# AI Negotiation Agent Endpoint
@app.post("/api/negotiate")
async def negotiate_discount(req: NegotiateRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    client = None
    is_live = False
    
    if api_key and api_key.strip() and not api_key.startswith("your_"):
        try:
            client = genai.Client(api_key=api_key)
            is_live = True
        except Exception:
            pass
            
    try:
        result = run_negotiation_step(
            customer_message=req.customer_message,
            requested_discount=req.requested_discount,
            chat_history=req.chat_history,
            is_live=is_live,
            client=client
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static dashboard files
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/api/report/data")
async def get_report_data(tenant_id: str = "default"):
    try:
        from src.database_sqlite import get_connection
        conn = get_connection(tenant_id)
        cursor = conn.cursor()
        
        # Fetch all quotations
        cursor.execute("SELECT * FROM quotations ORDER BY created_at DESC")
        quotations = [dict(row) for row in cursor.fetchall()]
        
        # Fetch all items for all quotations
        cursor.execute("SELECT * FROM quotation_items")
        items = [dict(row) for row in cursor.fetchall()]
        
        # Fetch all chat logs
        cursor.execute("SELECT * FROM chat_logs ORDER BY timestamp ASC")
        logs = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        # Group items and logs by invoice_id
        items_by_invoice = {}
        for item in items:
            inv_id = item["invoice_id"]
            if inv_id not in items_by_invoice:
                items_by_invoice[inv_id] = []
            items_by_invoice[inv_id].append(item)
            
        logs_by_invoice = {}
        for log in logs:
            inv_id = log["invoice_id"]
            if inv_id not in logs_by_invoice:
                logs_by_invoice[inv_id] = []
            logs_by_invoice[inv_id].append(log)
            
        return {
            "quotations": quotations,
            "items": items_by_invoice,
            "logs": logs_by_invoice
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/report/send_pdf")
async def send_report_pdf(tenant_id: str = "default"):
    tenant_config = get_tenant_config(tenant_id)
    
    smtp_server = tenant_config.get("smtp_server", "smtp.gmail.com")
    try:
        smtp_port = int(tenant_config.get("smtp_port", 465))
    except (ValueError, TypeError):
        smtp_port = 465
        
    email_user = tenant_config.get("email_user")
    email_pass = tenant_config.get("email_pass")
    master_email = tenant_config.get("master_email")
    
    if not email_user or not email_pass:
        raise HTTPException(status_code=400, detail=f"SMTP credentials are not configured for tenant {tenant_id}")
        
    from src.daily_report_pdf import send_daily_report_email
    
    # Send to both the monitored inbox and the master email
    recipients = list({
        email_user,
        master_email
    })
    recipients = [r for r in recipients if r and r.strip()]
    
    results = []
    for recipient in recipients:
        success = send_daily_report_email(smtp_server, smtp_port, email_user, email_pass, recipient, tenant_id=tenant_id)
        results.append({"recipient": recipient, "success": success})
    
    if all(r["success"] for r in results):
        return {"status": "SUCCESS", "message": f"Daily report PDF sent to recipients", "results": results}
    else:
        failed = [r["recipient"] for r in results if not r["success"]]
        raise HTTPException(status_code=500, detail=f"Failed to send to: {', '.join(failed)}")

@app.get("/api/unmatched")
async def get_unmatched_enquiries(tenant_id: str = "default"):
    """Returns all unmatched / uncategorized customer enquiries from the database."""
    try:
        from src.database_sqlite import get_all_unmatched_items, get_unmatched_items_count
        items = get_all_unmatched_items(limit=100, tenant_id=tenant_id)
        count = get_unmatched_items_count(tenant_id=tenant_id)
        return {
            "count": count,
            "items": items
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/report")
async def get_report():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(static_dir, "report.html"))


@app.get("/")
async def get_index():
    # Serves static dashboard index by default
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(static_dir, "index.html"))
